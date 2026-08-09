import { NextResponse } from "next/server";
import { saveSupplierCallApproval } from "../erp/commands/supplier-calls";
import { evaluateSupplierCallEligibility } from "../erp/guardrails/supplier-call";
import { createErpSeedState } from "../erp/seed";
import type { ErpState, PurchaseOrder, Supplier, SupplierCall, SupplierCallApproval } from "../erp/types";
import { MockSupplierCallProvider } from "../supplier-call/mock-provider";
import type { CreateSupplierCallInput, CreateSupplierCallResult, SupplierCallProvider, SupplierCallProviderMode } from "../supplier-call/types";
import { SupplierCallProviderError } from "../supplier-call/types";

export interface CreateSupplierCallRequest { callId: string; supplierId: string; purchaseOrderId: string }
export interface SupplierCallClaimRequest extends CreateSupplierCallRequest { idempotencyKey: string; supplierLocalDate: string }
export type SupplierCallClaimResult = { ok: true; claimId: string } | { ok: false };

export interface SupplierCallEnvironment {
  CALLE_API_URL?: string;
  CALLE_API_KEY?: string;
  CALLE_AGENT_ID?: string;
}

export interface SupplierCallAuthorizationRepository {
  readonly authorizationMode: "demo" | "production";
  readonly repositoryCapability: "demo" | "production";
  getSupplier(supplierId: string): Promise<Supplier | null>;
  getPurchaseOrder(purchaseOrderId: string): Promise<PurchaseOrder | null>;
  getSupplierCall(callId: string): Promise<SupplierCall | null>;
  getApproval(callId: string): Promise<SupplierCallApproval | null>;
  countCallsForPurchaseOrderOnDate(purchaseOrderId: string, supplierLocalDate: string): Promise<number>;
  hasOpenDispute(purchaseOrderId: string): Promise<boolean>;
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
  status: "reserved" | "failed" | "completed";
}

export class DemoSupplierCallAuthorizationRepository implements SupplierCallAuthorizationRepository {
  readonly authorizationMode = "demo" as const;
  readonly repositoryCapability = "demo" as const;
  private state: ErpState;
  private claimTail: Promise<void> = Promise.resolve();
  private readonly claims = new Map<string, DemoSupplierCallClaim>();
  private readonly claimsByIdempotency = new Map<string, string>();
  private readonly claimsByDailyKey = new Map<string, string>();

  constructor() {
    const seed = createErpSeedState();
    const saved = saveSupplierCallApproval(seed, "approver", {
      supplierCallId: "supplier-call-po-1", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment", scenario: "delivery_commitment",
      objective: "Confirm delivery date", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20",
      partialDeliveryAllowed: true, maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", callTime: "10:00", approvedBy: "Demo server policy",
    }, "2026-08-09T01:00:00.000Z");
    if (!saved.ok) throw new Error("Unable to initialize demo supplier-call authorization.");
    this.state = saved.state;
  }

  async getSupplier(supplierId: string) { return this.state.suppliers.find((item) => item.id === supplierId) ?? null; }
  async getPurchaseOrder(purchaseOrderId: string) { return this.state.purchaseOrders.find((item) => item.id === purchaseOrderId) ?? null; }
  async getSupplierCall(callId: string) { return this.state.supplierCalls.find((item) => item.id === callId) ?? null; }
  async getApproval(callId: string) { return this.state.supplierApprovals.find((item) => item.supplierCallId === callId) ?? null; }
  async countCallsForPurchaseOrderOnDate(purchaseOrderId: string, supplierLocalDate: string) {
    return this.state.supplierCalls.filter((item) => item.purchaseOrderId === purchaseOrderId && item.calledLocalDate === supplierLocalDate).length;
  }
  async hasOpenDispute(purchaseOrderId: string) {
    return this.state.disputes.some((item) => item.purchaseOrderId === purchaseOrderId && (item.status === "open" || item.status === "investigating"));
  }

  private async withClaimLock<T>(operation: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.claimTail;
    this.claimTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  async claimSupplierCall(input: SupplierCallClaimRequest): Promise<SupplierCallClaimResult> {
    return this.withClaimLock(() => {
      const dailyKey = `${input.supplierId}:${input.purchaseOrderId}:${input.supplierLocalDate}`;
      if (this.claimsByIdempotency.has(input.idempotencyKey) || this.claimsByDailyKey.has(dailyKey)
        || this.state.supplierCalls.some((call) => call.supplierId === input.supplierId && call.purchaseOrderId === input.purchaseOrderId && call.calledLocalDate === input.supplierLocalDate)) return { ok: false };
      const claimId = `supplier-call-claim-${input.idempotencyKey}`;
      const claim: DemoSupplierCallClaim = { id: claimId, idempotencyKey: input.idempotencyKey, dailyKey, callId: input.callId, status: "reserved" };
      this.claims.set(claimId, claim);
      this.claimsByIdempotency.set(input.idempotencyKey, claimId);
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
      const expectedDailyKey = `${input.supplierId}:${input.purchaseOrderId}:${supplierLocalDate}`;
      if (!claim || claim.status !== "reserved" || claim.callId !== input.callId || claim.dailyKey !== expectedDailyKey || result.callId !== input.callId) throw new Error("Supplier call claim does not match the created call.");
      const now = new Date().toISOString();
      const callExists = this.state.supplierCalls.some((call) => call.id === input.callId && call.status === "draft");
      if (!callExists) throw new Error("Supplier call draft is no longer eligible.");
      this.state = {
        ...this.state,
        revision: this.state.revision + 1,
        supplierCalls: this.state.supplierCalls.map((call) => call.id === input.callId ? {
          ...call, status: "active", provider: result.provider, providerCallId: result.providerCallId, calledLocalDate: supplierLocalDate, updatedAt: now,
        } : call),
        auditLogs: [...this.state.auditLogs, {
          id: `erp-audit-${this.state.revision + 1}`, entityType: "supplier_call", entityId: input.callId, action: "supplier_call.created",
          actorRole: "system", actorId: "system:supplier-call-api", detail: { supplierId: input.supplierId, purchaseOrderId: input.purchaseOrderId, provider: result.provider }, createdAt: now, updatedAt: now,
        }],
      };
      this.claims.set(claimId, { ...claim, status: "completed" });
    });
  }
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
  const keys = ["callId", "supplierId", "purchaseOrderId"] as const;
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key as typeof keys[number]))) return null;
  if (keys.some((key) => typeof value[key] !== "string" || !String(value[key]).trim() || String(value[key]).length > 160)) return null;
  return { callId: String(value.callId), supplierId: String(value.supplierId), purchaseOrderId: String(value.purchaseOrderId) };
}

function jakartaClock(now: Date): { time: string; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { time: `${part("hour")}:${part("minute")}`, date: `${part("year")}-${part("month")}-${part("day")}` };
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

    const forceMock = new URL(request.url).searchParams.get("forceMock") === "1";
    const providerMode: SupplierCallProviderMode = forceMock ? "mock" : dependencies.providerMode ?? "mock";
    if (providerMode === "live" && (dependencies.repository.authorizationMode !== "production" || dependencies.repository.repositoryCapability !== "production")) {
      return NextResponse.json({ error: "Live supplier calls are not authorized.", code: "LIVE_PROVIDER_NOT_AUTHORIZED" }, { status: 409 });
    }

    let supplier: Supplier | null;
    let purchaseOrder: PurchaseOrder | null;
    let supplierCall: SupplierCall | null;
    let approval: SupplierCallApproval | null;
    try {
      [supplier, purchaseOrder, supplierCall, approval] = await Promise.all([
        dependencies.repository.getSupplier(input.supplierId),
        dependencies.repository.getPurchaseOrder(input.purchaseOrderId),
        dependencies.repository.getSupplierCall(input.callId),
        dependencies.repository.getApproval(input.callId),
      ]);
    } catch {
      return NextResponse.json({ error: "Unable to authorize supplier call.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
    if (!supplier || !purchaseOrder || !supplierCall || purchaseOrder.supplierId !== supplier.id
      || supplierCall.supplierId !== supplier.id || supplierCall.purchaseOrderId !== purchaseOrder.id
      || approval?.supplierId !== supplier.id || approval.purchaseOrderId !== purchaseOrder.id || approval.supplierCallId !== supplierCall.id) {
      return NextResponse.json({ error: "Supplier call is not eligible.", code: "INVALID_SERVER_STATE" }, { status: 409 });
    }
    if (supplierCall.status !== "draft") return NextResponse.json({ error: "Supplier call has already been claimed.", code: "SUPPLIER_CALL_ALREADY_CLAIMED" }, { status: 409 });

    let clock: { time: string; date: string };
    let callsToday: number;
    let openDispute: boolean;
    try {
      clock = jakartaClock(dependencies.now?.() ?? new Date());
      [callsToday, openDispute] = await Promise.all([
        dependencies.repository.countCallsForPurchaseOrderOnDate(purchaseOrder.id, clock.date),
        dependencies.repository.hasOpenDispute(purchaseOrder.id),
      ]);
    } catch {
      return NextResponse.json({ error: "Unable to authorize supplier call.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
    const decision = evaluateSupplierCallEligibility({ supplier, purchaseOrder, approval, localTime: clock.time, callsToday, openDispute });
    if (!decision.allowed) return NextResponse.json({ error: "Supplier call is not eligible.", code: "SUPPLIER_CALL_INELIGIBLE", codes: decision.codes }, { status: 409 });

    let claim: SupplierCallClaimResult;
    try {
      claim = await dependencies.repository.claimSupplierCall({ ...input, idempotencyKey: input.callId, supplierLocalDate: clock.date });
    } catch {
      return NextResponse.json({ error: "Unable to authorize supplier call.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" }, { status: 502 });
    }
    if (!claim.ok) return NextResponse.json({ error: "Supplier call has already been claimed.", code: "SUPPLIER_CALL_ALREADY_CLAIMED" }, { status: 409 });

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
