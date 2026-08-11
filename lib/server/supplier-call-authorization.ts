import { NextResponse } from "next/server";
import { saveSupplierCallApproval, type SaveSupplierCallApprovalInput } from "../erp/commands/supplier-calls";
import { evaluateSupplierCallEligibility } from "../erp/guardrails/supplier-call";
import { createErpSeedState } from "../erp/seed";
import type { ErpState, PurchaseOrder, Supplier, SupplierCall, SupplierCallApproval } from "../erp/types";
import { MockSupplierCallProvider } from "../supplier-call/mock-provider";
import type { CreateSupplierCallInput, CreateSupplierCallResult, SupplierCallProvider, SupplierCallProviderMode } from "../supplier-call/types";
import { SupplierCallProviderError } from "../supplier-call/types";
import { getJakartaClock } from "../supplier-call/jakarta-clock";
import { isStrictIsoInstant } from "../erp/date-validation";
import { isValidDemoSessionId } from "../demo/session";

export interface CreateSupplierCallRequest { callId: string; supplierId: string; purchaseOrderId: string; demoSessionId: string; demoClockIso?: string }
export interface SupplierCallClaimRequest extends CreateSupplierCallRequest { idempotencyKey: string; supplierLocalDate: string; approvalCapability: string }
export type SupplierCallClaimResult = { ok: true; claimId: string } | { ok: false; reason: "approval_required" | "already_claimed" };
export interface RegisterSupplierCallApprovalRequest {
  demoSessionId: string;
  approvedAt: string;
  approval: SaveSupplierCallApprovalInput;
}
export type RegisterSupplierCallApprovalResult =
  | { ok: true; approval: SupplierCallApproval }
  | { ok: false };
export type InvalidateSupplierCallSessionResult =
  | { ok: true }
  | { ok: false; reason: "busy" };
export type RestartSupplierCallSessionResult =
  | { ok: true }
  | { ok: false; reason: "busy" | "retired" };

export interface SupplierCallEnvironment {
  CALLE_API_URL?: string;
  CALLE_API_KEY?: string;
  CALLE_AGENT_ID?: string;
}

export interface SupplierCallAuthorizationRepository {
  readonly authorizationMode: "demo" | "production";
  readonly repositoryCapability: "demo" | "production";
  getSupplier(supplierId: string, demoSessionId: string): Promise<Supplier | null>;
  getPurchaseOrder(purchaseOrderId: string, demoSessionId: string): Promise<PurchaseOrder | null>;
  getSupplierCall(callId: string, demoSessionId: string): Promise<SupplierCall | null>;
  getApproval(callId: string, demoSessionId: string): Promise<SupplierCallApproval | null>;
  countCallsForPurchaseOrderOnDate(purchaseOrderId: string, supplierLocalDate: string, demoSessionId: string): Promise<number>;
  hasOpenDispute(purchaseOrderId: string, demoSessionId: string): Promise<boolean>;
  registerSupplierCallApproval(input: RegisterSupplierCallApprovalRequest, approvalCapability: string): Promise<RegisterSupplierCallApprovalResult>;
  invalidateDemoSession(demoSessionId: string): Promise<InvalidateSupplierCallSessionResult>;
  restartDemoSession(demoSessionId: string): Promise<RestartSupplierCallSessionResult>;
  /** Atomically reserves both idempotencyKey and supplierId/purchaseOrderId/local-date. */
  claimSupplierCall(input: SupplierCallClaimRequest): Promise<SupplierCallClaimResult>;
  /** Permanently consumes an ambiguous/failed provider attempt so it cannot be retried as a second call. */
  recordFailedCallClaim(claimId: string): Promise<void>;
  /** Atomically persists the created call and finalizes its matching reserved claim. */
  recordCreatedCall(claimId: string, input: CreateSupplierCallRequest, result: CreateSupplierCallResult, supplierLocalDate: string): Promise<void>;
}

interface DemoSupplierCallClaim {
  id: string;
  idempotencyKey: string;
  dailyKey: string;
  callId: string;
  demoSessionId: string;
  status: "reserved" | "failed" | "completed";
}

interface DemoSupplierCallApprovalCapability {
  token: string;
  demoSessionId: string;
  supplierCallId: string;
  supplierId: string;
  purchaseOrderId: string;
  approvalApprovedAt: string;
  status: "active" | "consumed" | "invalidated";
}

export class DemoSupplierCallAuthorizationRepository implements SupplierCallAuthorizationRepository {
  readonly authorizationMode = "demo" as const;
  readonly repositoryCapability = "demo" as const;
  private readonly states = new Map<string, ErpState>();
  private claimTail: Promise<void> = Promise.resolve();
  private readonly claims = new Map<string, DemoSupplierCallClaim>();
  private readonly claimsByIdempotency = new Map<string, string>();
  private readonly claimsByDailyKey = new Map<string, string>();
  private readonly approvalCapabilities = new Map<string, DemoSupplierCallApprovalCapability>();
  private readonly invalidatedSessions = new Set<string>();

  private stateFor(demoSessionId: string): ErpState {
    const existing = this.states.get(demoSessionId);
    if (existing) return existing;
    const state = createErpSeedState(); this.states.set(demoSessionId, state); return state;
  }

  async getSupplier(supplierId: string, session: string) { return this.invalidatedSessions.has(session) ? null : this.stateFor(session).suppliers.find((item) => item.id === supplierId) ?? null; }
  async getPurchaseOrder(purchaseOrderId: string, session: string) { return this.invalidatedSessions.has(session) ? null : this.stateFor(session).purchaseOrders.find((item) => item.id === purchaseOrderId) ?? null; }
  async getSupplierCall(callId: string, session: string) { return this.invalidatedSessions.has(session) ? null : this.stateFor(session).supplierCalls.find((item) => item.id === callId) ?? null; }
  async getApproval(callId: string, session: string) { return this.invalidatedSessions.has(session) ? null : this.stateFor(session).supplierApprovals.find((item) => item.supplierCallId === callId) ?? null; }
  async countCallsForPurchaseOrderOnDate(purchaseOrderId: string, supplierLocalDate: string, session: string) {
    if (this.invalidatedSessions.has(session)) return 0;
    return this.stateFor(session).supplierCalls.filter((item) => item.purchaseOrderId === purchaseOrderId && item.calledLocalDate === supplierLocalDate).length;
  }
  async hasOpenDispute(purchaseOrderId: string, session: string) {
    if (this.invalidatedSessions.has(session)) return false;
    return this.stateFor(session).disputes.some((item) => item.purchaseOrderId === purchaseOrderId && (item.status === "open" || item.status === "investigating"));
  }

  private async withClaimLock<T>(operation: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.claimTail;
    this.claimTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  async registerSupplierCallApproval(input: RegisterSupplierCallApprovalRequest, approvalCapability: string): Promise<RegisterSupplierCallApprovalResult> {
    return this.withClaimLock(() => {
      if (this.invalidatedSessions.has(input.demoSessionId) || this.approvalCapabilities.has(approvalCapability)) return { ok: false };
      const current = this.stateFor(input.demoSessionId);
      const saved = saveSupplierCallApproval(current, "approver", input.approval, input.approvedAt);
      if (!saved.ok || !saved.value.approvedAt) return { ok: false };
      for (const [token, capability] of this.approvalCapabilities) {
        if (capability.demoSessionId === input.demoSessionId && capability.supplierCallId === input.approval.supplierCallId && capability.status === "active") {
          this.approvalCapabilities.set(token, { ...capability, status: "invalidated" });
        }
      }
      this.states.set(input.demoSessionId, saved.state);
      this.approvalCapabilities.set(approvalCapability, {
        token: approvalCapability,
        demoSessionId: input.demoSessionId,
        supplierCallId: input.approval.supplierCallId,
        supplierId: input.approval.supplierId,
        purchaseOrderId: input.approval.purchaseOrderId,
        approvalApprovedAt: saved.value.approvedAt,
        status: "active",
      });
      return { ok: true, approval: saved.value };
    });
  }

  async invalidateDemoSession(demoSessionId: string): Promise<InvalidateSupplierCallSessionResult> {
    return this.withClaimLock(() => {
      if ([...this.claims.values()].some((claim) => claim.demoSessionId === demoSessionId && claim.status === "reserved")) {
        return { ok: false, reason: "busy" };
      }
      this.invalidatedSessions.add(demoSessionId);
      this.states.delete(demoSessionId);
      for (const [token, candidate] of this.approvalCapabilities) {
        if (candidate.demoSessionId === demoSessionId) this.approvalCapabilities.set(token, { ...candidate, status: "invalidated" });
      }
      return { ok: true };
    });
  }

  async restartDemoSession(demoSessionId: string): Promise<RestartSupplierCallSessionResult> {
    return this.withClaimLock(() => {
      if (this.invalidatedSessions.has(demoSessionId)) return { ok: false, reason: "retired" };
      if ([...this.claims.values()].some((claim) => claim.demoSessionId === demoSessionId && claim.status === "reserved")) {
        return { ok: false, reason: "busy" };
      }
      this.states.delete(demoSessionId);
      for (const [claimId, claim] of this.claims) {
        if (claim.demoSessionId !== demoSessionId) continue;
        this.claimsByIdempotency.delete(claim.idempotencyKey);
        this.claimsByDailyKey.delete(claim.dailyKey);
        this.claims.delete(claimId);
      }
      for (const [token, capability] of this.approvalCapabilities) {
        if (capability.demoSessionId === demoSessionId) this.approvalCapabilities.delete(token);
      }
      return { ok: true };
    });
  }

  async claimSupplierCall(input: SupplierCallClaimRequest): Promise<SupplierCallClaimResult> {
    return this.withClaimLock(() => {
      if (this.invalidatedSessions.has(input.demoSessionId)) return { ok: false, reason: "approval_required" };
      const state = this.stateFor(input.demoSessionId);
      const capability = this.approvalCapabilities.get(input.approvalCapability);
      const approval = state.supplierApprovals.find((item) => item.supplierCallId === input.callId);
      if (!capability || capability.status !== "active"
        || capability.demoSessionId !== input.demoSessionId
        || capability.supplierCallId !== input.callId
        || capability.supplierId !== input.supplierId
        || capability.purchaseOrderId !== input.purchaseOrderId
        || !approval
        || approval.approvedAt !== capability.approvalApprovedAt) {
        return { ok: false, reason: "approval_required" };
      }
      const dailyKey = `${input.demoSessionId}:${input.supplierId}:${input.purchaseOrderId}:${input.supplierLocalDate}`;
      const scopedIdempotencyKey = `${input.demoSessionId}:${input.idempotencyKey}`;
      if (this.claimsByIdempotency.has(scopedIdempotencyKey) || this.claimsByDailyKey.has(dailyKey)
        || state.supplierCalls.some((call) => call.supplierId === input.supplierId && call.purchaseOrderId === input.purchaseOrderId && call.calledLocalDate === input.supplierLocalDate)) return { ok: false, reason: "already_claimed" };
      const claimId = `supplier-call-claim-${input.demoSessionId}-${input.idempotencyKey}`;
      const claim: DemoSupplierCallClaim = { id: claimId, idempotencyKey: scopedIdempotencyKey, dailyKey, callId: input.callId, demoSessionId: input.demoSessionId, status: "reserved" };
      this.approvalCapabilities.set(input.approvalCapability, { ...capability, status: "consumed" });
      this.claims.set(claimId, claim);
      this.claimsByIdempotency.set(scopedIdempotencyKey, claimId);
      this.claimsByDailyKey.set(dailyKey, claimId);
      return { ok: true, claimId };
    });
  }

  async recordFailedCallClaim(claimId: string): Promise<void> {
    await this.withClaimLock(() => {
      const claim = this.claims.get(claimId);
      if (claim?.status === "reserved") this.claims.set(claimId, { ...claim, status: "failed" });
    });
  }

  async recordCreatedCall(claimId: string, input: CreateSupplierCallRequest, result: CreateSupplierCallResult, supplierLocalDate: string) {
    await this.withClaimLock(() => {
      const claim = this.claims.get(claimId);
      if (this.invalidatedSessions.has(input.demoSessionId)) throw new Error("Supplier call demo session was reset.");
      const state = this.stateFor(input.demoSessionId);
      const expectedDailyKey = `${input.demoSessionId}:${input.supplierId}:${input.purchaseOrderId}:${supplierLocalDate}`;
      if (!claim || claim.status !== "reserved" || claim.callId !== input.callId || claim.dailyKey !== expectedDailyKey || result.callId !== input.callId) throw new Error("Supplier call claim does not match the created call.");
      const now = new Date().toISOString();
      const callExists = state.supplierCalls.some((call) => call.id === input.callId && call.status === "draft");
      if (!callExists) throw new Error("Supplier call draft is no longer eligible.");
      const next: ErpState = {
        ...state,
        revision: state.revision + 1,
        supplierCalls: state.supplierCalls.map((call) => call.id === input.callId ? {
          ...call, status: "active", provider: result.provider, providerCallId: result.providerCallId, calledLocalDate: supplierLocalDate, updatedAt: now,
        } : call),
        auditLogs: [...state.auditLogs, {
          id: `erp-audit-${state.revision + 1}`, entityType: "supplier_call", entityId: input.callId, action: "supplier_call.created",
          actorRole: "system", actorId: "system:supplier-call-api", detail: { supplierId: input.supplierId, purchaseOrderId: input.purchaseOrderId, provider: result.provider }, createdAt: now, updatedAt: now,
        }],
      };
      this.states.set(input.demoSessionId, next);
      this.claims.set(claimId, { ...claim, status: "completed" });
    });
  }
}

export interface RegisterSupplierCallApprovalHandlerDependencies {
  repository: SupplierCallAuthorizationRepository;
  createCapability?: () => string;
}

function parseApprovalRequest(input: unknown): RegisterSupplierCallApprovalRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["demoSessionId", "approvedAt", "approval"].includes(key))) return null;
  if (!isValidDemoSessionId(value.demoSessionId) || !isStrictIsoInstant(value.approvedAt)) return null;
  if (!value.approval || typeof value.approval !== "object" || Array.isArray(value.approval)) return null;
  const approval = value.approval as Record<string, unknown>;
  const keys = [
    "supplierCallId", "supplierId", "purchaseOrderId", "scenario", "objective", "permittedProductIds",
    "maximumDeliveryDate", "partialDeliveryAllowed", "maximumUnitPriceIncreasePercent", "language", "approvedBy",
  ] as const;
  if (Object.keys(approval).length !== keys.length || Object.keys(approval).some((key) => !keys.includes(key as typeof keys[number]))) return null;
  const strings = ["supplierCallId", "supplierId", "purchaseOrderId", "scenario", "objective", "maximumDeliveryDate", "language", "approvedBy"] as const;
  if (strings.some((key) => typeof approval[key] !== "string" || !String(approval[key]).trim() || String(approval[key]).length > 500)) return null;
  if (!["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"].includes(String(approval.scenario))) return null;
  if (!Array.isArray(approval.permittedProductIds) || approval.permittedProductIds.length === 0 || approval.permittedProductIds.length > 100
    || approval.permittedProductIds.some((item) => typeof item !== "string" || !item.trim() || item.length > 160)) return null;
  if (typeof approval.partialDeliveryAllowed !== "boolean" || typeof approval.maximumUnitPriceIncreasePercent !== "number") return null;
  return {
    demoSessionId: value.demoSessionId,
    approvedAt: value.approvedAt,
    approval: {
      supplierCallId: String(approval.supplierCallId), supplierId: String(approval.supplierId), purchaseOrderId: String(approval.purchaseOrderId),
      scenario: approval.scenario as SaveSupplierCallApprovalInput["scenario"], objective: String(approval.objective),
      permittedProductIds: [...approval.permittedProductIds] as string[], maximumDeliveryDate: String(approval.maximumDeliveryDate),
      partialDeliveryAllowed: approval.partialDeliveryAllowed, maximumUnitPriceIncreasePercent: approval.maximumUnitPriceIncreasePercent,
      language: String(approval.language), approvedBy: String(approval.approvedBy),
    },
  };
}

function createCryptoApprovalCapability(): string {
  const first = globalThis.crypto?.randomUUID?.();
  const second = globalThis.crypto?.randomUUID?.();
  if (!first || !second) throw new Error("Secure random capability generation is unavailable.");
  return `sca_${first.replaceAll("-", "")}${second.replaceAll("-", "")}`;
}

export function createRegisterSupplierCallApprovalHandler(dependencies: RegisterSupplierCallApprovalHandlerDependencies) {
  return async function handleRegisterSupplierCallApproval(request: Request): Promise<Response> {
    let input: RegisterSupplierCallApprovalRequest | null;
    try { input = parseApprovalRequest(await request.json()); } catch { input = null; }
    if (!input) return NextResponse.json({ error: "Invalid supplier call approval request.", code: "INVALID_REQUEST" }, { status: 400 });
    let approvalCapability: string;
    try {
      approvalCapability = dependencies.createCapability?.() ?? createCryptoApprovalCapability();
      if (!/^sca_[A-Za-z0-9_-]{40,196}$/.test(approvalCapability)) throw new Error("Invalid capability.");
    } catch {
      return NextResponse.json({ error: "Unable to register supplier call approval.", code: "APPROVAL_CAPABILITY_UNAVAILABLE" }, { status: 503 });
    }
    try {
      const registered = await dependencies.repository.registerSupplierCallApproval(input, approvalCapability);
      if (!registered.ok) return NextResponse.json({ error: "Supplier call approval was rejected.", code: "SERVER_APPROVAL_REJECTED" }, { status: 409 });
      return NextResponse.json({ code: "SUPPLIER_CALL_APPROVAL_REGISTERED", approvalCapability }, { status: 201, headers: { "cache-control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Unable to register supplier call approval.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
  };
}

export function createInvalidateSupplierCallSessionHandler(dependencies: { repository: SupplierCallAuthorizationRepository }) {
  return async function handleInvalidateSupplierCallSession(request: Request): Promise<Response> {
    let demoSessionId: string | null = null;
    try {
      const value = await request.json() as unknown;
      if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && isValidDemoSessionId((value as Record<string, unknown>).demoSessionId)) {
        demoSessionId = (value as { demoSessionId: string }).demoSessionId;
      }
    } catch { demoSessionId = null; }
    if (!demoSessionId) return NextResponse.json({ error: "Invalid supplier call session request.", code: "INVALID_REQUEST" }, { status: 400 });
    if (dependencies.repository.authorizationMode !== "demo" || dependencies.repository.repositoryCapability !== "demo") {
      return NextResponse.json({ error: "Demo session reset is not authorized.", code: "DEMO_RESET_NOT_ALLOWED" }, { status: 409 });
    }
    try {
      const invalidated = await dependencies.repository.invalidateDemoSession(demoSessionId);
      if (!invalidated.ok) {
        return NextResponse.json({ error: "Supplier call reset is busy; retry after the reserved attempt finishes.", code: "SUPPLIER_CALL_RESET_BUSY" }, { status: 409 });
      }
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Unable to invalidate supplier call session.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
  };
}

export function createRestartSupplierCallSessionHandler(dependencies: { repository: SupplierCallAuthorizationRepository }) {
  return async function handleRestartSupplierCallSession(request: Request): Promise<Response> {
    let demoSessionId: string | null = null;
    try {
      const value = await request.json() as unknown;
      if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && isValidDemoSessionId((value as Record<string, unknown>).demoSessionId)) {
        demoSessionId = (value as { demoSessionId: string }).demoSessionId;
      }
    } catch { demoSessionId = null; }
    if (!demoSessionId) return NextResponse.json({ error: "Invalid supplier call session request.", code: "INVALID_REQUEST" }, { status: 400 });
    if (dependencies.repository.authorizationMode !== "demo" || dependencies.repository.repositoryCapability !== "demo") {
      return NextResponse.json({ error: "Demo session replay is not authorized.", code: "DEMO_RESET_NOT_ALLOWED" }, { status: 409 });
    }
    try {
      const restarted = await dependencies.repository.restartDemoSession(demoSessionId);
      if (!restarted.ok && restarted.reason === "busy") {
        return NextResponse.json({ error: "Supplier call reset is busy; retry after the reserved attempt finishes.", code: "SUPPLIER_CALL_RESET_BUSY" }, { status: 409 });
      }
      if (!restarted.ok) {
        return NextResponse.json({ error: "Supplier call demo session is retired and cannot be replayed.", code: "SUPPLIER_CALL_SESSION_RETIRED" }, { status: 409 });
      }
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Unable to restart supplier call session.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
  };
}

export interface CreateSupplierCallHandlerDependencies {
  repository: SupplierCallAuthorizationRepository;
  providerMode?: SupplierCallProviderMode;
  env?: SupplierCallEnvironment;
  now?: () => Date;
  providerFactory?: (mode: SupplierCallProviderMode) => SupplierCallProvider;
}

function parseRequest(input: unknown): CreateSupplierCallRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const requiredKeys = ["callId", "supplierId", "purchaseOrderId", "demoSessionId"] as const;
  const allowedKeys = [...requiredKeys, "demoClockIso"] as const;
  if (Object.keys(value).some((key) => !allowedKeys.includes(key as typeof allowedKeys[number]))) return null;
  if (requiredKeys.some((key) => typeof value[key] !== "string" || !String(value[key]).trim() || String(value[key]).length > 160)) return null;
  if (!isValidDemoSessionId(value.demoSessionId)) return null;
  if (value.demoClockIso !== undefined && !isStrictIsoInstant(value.demoClockIso)) return null;
  return { callId: String(value.callId), supplierId: String(value.supplierId), purchaseOrderId: String(value.purchaseOrderId), demoSessionId: String(value.demoSessionId),
    ...(typeof value.demoClockIso === "string" ? { demoClockIso: value.demoClockIso } : {}) };
}

function defaultProvider(mode: SupplierCallProviderMode): SupplierCallProvider {
  if (mode === "mock") return new MockSupplierCallProvider();
  throw new SupplierCallProviderError("Live supplier-call provider is not configured.", "LIVE_PROVIDER_UNAVAILABLE");
}

export function createCreateSupplierCallHandler(dependencies: CreateSupplierCallHandlerDependencies) {
  return async function handleCreateSupplierCall(request: Request): Promise<Response> {
    let input: CreateSupplierCallRequest | null;
    try { input = parseRequest(await request.json()); } catch { input = null; }
    if (!input) return NextResponse.json({ error: "Invalid supplier call request.", code: "INVALID_REQUEST" }, { status: 400 });
    const approvalCapability = request.headers.get("x-supplier-call-approval");
    if (!approvalCapability || approvalCapability.length < 32 || approvalCapability.length > 200) {
      return NextResponse.json(
        { error: "Server approval is required before a supplier call can start.", code: "SERVER_APPROVAL_REQUIRED" },
        { status: 409 },
      );
    }

    const forceMock = new URL(request.url).searchParams.get("forceMock") === "1";
    const providerMode: SupplierCallProviderMode = forceMock ? "mock" : dependencies.providerMode ?? "mock";
    if (input.demoClockIso && (!forceMock || providerMode !== "mock" || dependencies.repository.authorizationMode !== "demo" || dependencies.repository.repositoryCapability !== "demo")) {
      return NextResponse.json({ error: "Demo clock is not allowed for this request.", code: "DEMO_CLOCK_NOT_ALLOWED" }, { status: 400 });
    }

    if (providerMode === "live" && (dependencies.repository.authorizationMode !== "production" || dependencies.repository.repositoryCapability !== "production")) {
      return NextResponse.json({ error: "Live supplier calls are not authorized.", code: "LIVE_PROVIDER_NOT_AUTHORIZED" }, { status: 409 });
    }

    let supplier: Supplier | null;
    let purchaseOrder: PurchaseOrder | null;
    let supplierCall: SupplierCall | null;
    let approval: SupplierCallApproval | null;
    try {
      [supplier, purchaseOrder, supplierCall, approval] = await Promise.all([
        dependencies.repository.getSupplier(input.supplierId, input.demoSessionId),
        dependencies.repository.getPurchaseOrder(input.purchaseOrderId, input.demoSessionId),
        dependencies.repository.getSupplierCall(input.callId, input.demoSessionId),
        dependencies.repository.getApproval(input.callId, input.demoSessionId),
      ]);
    } catch {
      return NextResponse.json({ error: "Unable to authorize supplier call.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
    if (!supplier || !purchaseOrder || !supplierCall || !approval) {
      return NextResponse.json({ error: "Server approval is required before a supplier call can start.", code: "SERVER_APPROVAL_REQUIRED" }, { status: 409 });
    }
    if (purchaseOrder.supplierId !== supplier.id || supplierCall.supplierId !== supplier.id || supplierCall.purchaseOrderId !== purchaseOrder.id || approval.supplierId !== supplier.id || approval.purchaseOrderId !== purchaseOrder.id || approval.supplierCallId !== supplierCall.id) {
      return NextResponse.json({ error: "Supplier call is not eligible.", code: "INVALID_SERVER_STATE" }, { status: 409 });
    }
    if (supplierCall.status !== "draft") return NextResponse.json({ error: "Supplier call has already been claimed.", code: "SUPPLIER_CALL_ALREADY_CLAIMED" }, { status: 409 });

    let clock: { time: string; date: string };
    let callsToday: number;
    let openDispute: boolean;
    try {
      clock = getJakartaClock(input.demoClockIso ? new Date(input.demoClockIso) : dependencies.now?.() ?? new Date());
      [callsToday, openDispute] = await Promise.all([
        dependencies.repository.countCallsForPurchaseOrderOnDate(purchaseOrder.id, clock.date, input.demoSessionId),
        dependencies.repository.hasOpenDispute(purchaseOrder.id, input.demoSessionId),
      ]);
    } catch {
      return NextResponse.json({ error: "Unable to authorize supplier call.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
    const decision = evaluateSupplierCallEligibility({ supplier, purchaseOrder, approval, localTime: clock.time, callsToday, openDispute });
    if (!decision.allowed) return NextResponse.json({ error: "Supplier call is not eligible.", code: "SUPPLIER_CALL_INELIGIBLE", codes: decision.codes }, { status: 409 });

    let claim: SupplierCallClaimResult;
    try {
      claim = await dependencies.repository.claimSupplierCall({ ...input, idempotencyKey: input.callId, supplierLocalDate: clock.date, approvalCapability });
    } catch {
      return NextResponse.json({ error: "Unable to authorize supplier call.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
    if (!claim.ok) return claim.reason === "approval_required"
      ? NextResponse.json({ error: "Server approval is required before a supplier call can start.", code: "SERVER_APPROVAL_REQUIRED" }, { status: 409 })
      : NextResponse.json({ error: "Supplier call has already been claimed.", code: "SUPPLIER_CALL_ALREADY_CLAIMED" }, { status: 409 });

    const providerInput: CreateSupplierCallInput = {
      callId: supplierCall.id, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id, phone: supplier.phone,
      language: approval.language, scenario: supplierCall.scenario, disclosure: "Penelepon adalah asisten suara AI Arvanta.",
    };
    try {
      const provider = dependencies.providerFactory?.(providerMode) ?? defaultProvider(providerMode);
      const result = await provider.createCall(providerInput);
      const expectedProvider = providerMode === "live" ? "calle" : "mock";
      if (result.callId !== supplierCall.id || result.provider !== expectedProvider || !result.providerCallId.trim() || result.providerCallId.length > 200 || !["creating", "connecting"].includes(result.status)) {
        throw new SupplierCallProviderError("Supplier-call provider returned an invalid result.", "INVALID_PROVIDER_RESULT");
      }
      await dependencies.repository.recordCreatedCall(claim.claimId, input, result, clock.date);
      return NextResponse.json({ code: "SUPPLIER_CALL_CREATED", call: result }, { status: 201 });
    } catch {
      try { await dependencies.repository.recordFailedCallClaim(claim.claimId); } catch { /* Keep the original safe provider failure response; an unresolved claim remains fail-closed. */ }
      return NextResponse.json({ error: "Unable to create supplier call.", code: "SUPPLIER_CALL_PROVIDER_FAILURE" }, { status: 502 });
    }
  };
}
