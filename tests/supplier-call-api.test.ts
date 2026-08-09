import { describe, expect, it } from "vitest";
import { createErpSeedState } from "../lib/erp/seed";
import {
  createCreateSupplierCallHandler,
  DemoSupplierCallAuthorizationRepository,
  type SupplierCallAuthorizationRepository,
} from "../lib/server/supplier-call-authorization";
import type { PurchaseOrder, Supplier, SupplierCall, SupplierCallApproval } from "../lib/erp/types";
import type { CreateSupplierCallInput, SupplierCallProvider } from "../lib/supplier-call/types";

const seed = createErpSeedState();
const supplier = seed.suppliers[0];
const purchaseOrder = seed.purchaseOrders[0];
const supplierCall: SupplierCall = {
  id: "supplier-call-po-1", supplierId: supplier.id, purchaseOrderId: purchaseOrder.id, status: "draft", scenario: "delivery_commitment",
  provider: null, providerCallId: null, calledLocalDate: null, createdAt: "2026-08-09T01:00:00.000Z", updatedAt: "2026-08-09T01:00:00.000Z",
};
const approval: SupplierCallApproval = {
  id: "supplier-approval-call-po-1", supplierCallId: supplierCall.id, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id, status: "approved",
  objective: "Confirm delivery date", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20", partialDeliveryAllowed: true,
  maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", callTime: "10:00", approvedBy: "Nadia Pratama",
  createdAt: "2026-08-09T01:00:00.000Z", updatedAt: "2026-08-09T01:00:00.000Z",
};

class FakeRepository implements SupplierCallAuthorizationRepository {
  authorizationMode: "demo" | "production" = "demo";
  repositoryCapability: "demo" | "production" = "demo";
  supplier: Supplier | null = supplier;
  purchaseOrder: PurchaseOrder | null = purchaseOrder;
  supplierCall: SupplierCall | null = supplierCall;
  approval: SupplierCallApproval | null = approval;
  callsToday = 0;
  openDispute = false;
  failLoad = false;
  claimAllowed = true;
  claims = 0;
  failedClaims = 0;
  recorded = 0;
  async getSupplier() { if (this.failLoad) throw new Error("secret repository connection"); return this.supplier; }
  async getPurchaseOrder() { return this.purchaseOrder; }
  async getSupplierCall() { return this.supplierCall; }
  async getApproval() { return this.approval; }
  async countCallsForPurchaseOrderOnDate() { return this.callsToday; }
  async hasOpenDispute() { return this.openDispute; }
  async claimSupplierCall() { this.claims += 1; return this.claimAllowed ? { ok: true as const, claimId: `claim-${this.claims}` } : { ok: false as const }; }
  async recordFailedCallClaim() { this.failedClaims += 1; }
  async recordCreatedCall() { this.recorded += 1; }
}

function setup(options: { repository?: SupplierCallAuthorizationRepository; providerMode?: "mock" | "live"; resultProvider?: "mock" | "calle"; failProvider?: boolean; env?: Record<string, string> } = {}) {
  const repository = options.repository ?? new FakeRepository();
  const inputs: CreateSupplierCallInput[] = [];
  const modes: string[] = [];
  let activeMode: "mock" | "live" = "mock";
  const provider: SupplierCallProvider = {
    async createCall(value) {
      inputs.push(value);
      if (options.failProvider) throw new Error("secret-key provider detail");
      return { callId: value.callId, providerCallId: `supplier_mock_${value.callId}`, status: "connecting", provider: options.resultProvider ?? (activeMode === "live" ? "calle" : "mock") };
    },
    async getCall(callId) { return { callId, status: "active", durationSeconds: 0 }; },
    async endCall() {},
    async getTranscript() { return []; },
  };
  const handler = createCreateSupplierCallHandler({
    repository,
    providerMode: options.providerMode,
    env: options.env,
    now: () => new Date("2026-08-09T03:00:00.000Z"),
    providerFactory: (mode) => { activeMode = mode; modes.push(mode); return provider; },
  });
  const request = (query = "", body: unknown = { callId: supplierCall.id, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id }) => new Request(`https://app.example/api/supplier-calls${query}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { handler, request, repository, inputs, modes };
}

describe("POST /api/supplier-calls", () => {
  it("returns a stable 400 code for malformed or snapshot-bearing payloads", async () => {
    const context = setup();
    const response = await context.handler(context.request("", { callId: supplierCall.id, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id, supplier: { phone: "123", secret: "must-not-reflect" } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid supplier call request.", code: "INVALID_REQUEST" });
    expect(context.inputs).toHaveLength(0);
  });

  it("loads eligible call data from the server repository and defaults to mock with zero keys", async () => {
    const repository = new FakeRepository();
    repository.authorizationMode = "production";
    repository.repositoryCapability = "production";
    const context = setup({ repository, env: {} });
    const response = await context.handler(context.request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      code: "SUPPLIER_CALL_CREATED",
      call: { callId: supplierCall.id, providerCallId: `supplier_mock_${supplierCall.id}`, status: "connecting", provider: "mock" },
    });
    expect(context.modes).toEqual(["mock"]);
    expect(context.inputs[0]).toMatchObject({ phone: supplier.phone, scenario: "delivery_commitment", disclosure: expect.stringMatching(/AI/) });
    expect(repository.recorded).toBe(1);
  });

  it("uses the resettable demo repository in mock mode", async () => {
    const context = setup({ repository: new DemoSupplierCallAuthorizationRepository() });
    const response = await context.handler(context.request());
    expect(response.status).toBe(201);
    expect(context.modes).toEqual(["mock"]);
  });

  it("atomically allows only one concurrent provider invocation for the same supplier PO and local date", async () => {
    const repository = new DemoSupplierCallAuthorizationRepository();
    let invocations = 0;
    let releaseProvider!: () => void;
    let markProviderStarted!: () => void;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const providerStarted = new Promise<void>((resolve) => { markProviderStarted = resolve; });
    const handler = createCreateSupplierCallHandler({
      repository,
      now: () => new Date("2026-08-09T03:00:00.000Z"),
      providerFactory: () => ({
        async createCall(value) {
          invocations += 1;
          markProviderStarted();
          await providerGate;
          return { callId: value.callId, providerCallId: `supplier_mock_${value.callId}`, status: "connecting", provider: "mock" };
        },
        async getCall(callId) { return { callId, status: "active", durationSeconds: 0 }; },
        async endCall() {}, async getTranscript() { return []; },
      }),
    });
    const makeRequest = () => new Request("https://app.example/api/supplier-calls", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ callId: supplierCall.id, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id }),
    });

    const first = handler(makeRequest());
    await providerStarted;
    const second = await handler(makeRequest());
    releaseProvider();
    const firstResponse = await first;

    expect(invocations).toBe(1);
    expect(firstResponse.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "Supplier call has already been claimed.", code: "SUPPLIER_CALL_ALREADY_CLAIMED" });
  });

  it("returns the same stable duplicate 409 after the first request has finalized", async () => {
    const repository = new DemoSupplierCallAuthorizationRepository();
    const context = setup({ repository });
    expect((await context.handler(context.request())).status).toBe(201);
    const duplicate = await context.handler(context.request());
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "Supplier call has already been claimed.", code: "SUPPLIER_CALL_ALREADY_CLAIMED" });
    expect(context.inputs).toHaveLength(1);
  });

  it("returns the stable duplicate 409 when the atomic repository claim loses", async () => {
    const repository = new FakeRepository();
    repository.claimAllowed = false;
    const context = setup({ repository });
    const response = await context.handler(context.request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Supplier call has already been claimed.", code: "SUPPLIER_CALL_ALREADY_CLAIMED" });
    expect(context.inputs).toHaveLength(0);
  });

  it("forces mock even when live mode was explicitly configured", async () => {
    const context = setup({ providerMode: "live" });
    const response = await context.handler(context.request("?forceMock=1"));
    expect(response.status).toBe(201);
    expect(context.modes).toEqual(["mock"]);
  });

  it("does not let credentials activate live mode", async () => {
    const context = setup({ env: { CALLE_API_URL: "https://api.example", CALLE_API_KEY: "must-not-leak", CALLE_AGENT_ID: "agent" } });
    const response = await context.handler(context.request());
    expect(response.status).toBe(201);
    expect(context.modes).toEqual(["mock"]);
  });

  it.each([
    ["demo authorization", "demo", "production"],
    ["demo repository capability", "production", "demo"],
  ] as const)("fails closed for live mode with %s", async (_label, authorizationMode, repositoryCapability) => {
    const repository = new FakeRepository();
    repository.authorizationMode = authorizationMode;
    repository.repositoryCapability = repositoryCapability;
    const context = setup({ repository, providerMode: "live" });
    const response = await context.handler(context.request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Live supplier calls are not authorized.", code: "LIVE_PROVIDER_NOT_AUTHORIZED" });
    expect(context.modes).toHaveLength(0);
    expect(context.inputs).toHaveLength(0);
  });

  it("permits future live provider selection only with explicit production authorization and repository capability", async () => {
    const repository = new FakeRepository();
    repository.authorizationMode = "production";
    repository.repositoryCapability = "production";
    const context = setup({ repository, providerMode: "live" });
    const response = await context.handler(context.request());
    expect(response.status).toBe(201);
    expect(context.modes).toEqual(["live"]);
  });

  it("rejects a provider-mode mismatch instead of silently falling back from live to mock", async () => {
    const repository = new FakeRepository();
    repository.authorizationMode = "production";
    repository.repositoryCapability = "production";
    const context = setup({ repository, providerMode: "live", resultProvider: "mock" });
    const response = await context.handler(context.request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Unable to create supplier call.", code: "SUPPLIER_CALL_PROVIDER_FAILURE" });
    expect(repository.recorded).toBe(0);
  });

  it("returns stable 409 guardrail codes before provider invocation", async () => {
    const repository = new FakeRepository();
    repository.openDispute = true;
    const context = setup({ repository });
    const response = await context.handler(context.request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Supplier call is not eligible.", code: "SUPPLIER_CALL_INELIGIBLE", codes: expect.arrayContaining(["OPEN_DISPUTE"]) });
    expect(context.inputs).toHaveLength(0);
  });

  it("rejects inconsistent server-owned entity links without reflecting repository data", async () => {
    const repository = new FakeRepository();
    repository.purchaseOrder = { ...purchaseOrder, supplierId: "secret-other-supplier" };
    const context = setup({ repository });
    const response = await context.handler(context.request());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({ error: "Supplier call is not eligible.", code: "INVALID_SERVER_STATE" });
    expect(JSON.stringify(body)).not.toContain("secret-other-supplier");
  });

  it("returns a stable safe 502 without secrets and does not record failure as success", async () => {
    const repository = new FakeRepository();
    const context = setup({ repository, failProvider: true });
    const response = await context.handler(context.request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({ error: "Unable to create supplier call.", code: "SUPPLIER_CALL_PROVIDER_FAILURE" });
    expect(JSON.stringify(body)).not.toMatch(/secret-key|must-not-leak/);
    expect(repository.recorded).toBe(0);
    expect(repository.failedClaims).toBe(1);
  });

  it("contains repository failures in a safe stable 502 response", async () => {
    const repository = new FakeRepository();
    repository.failLoad = true;
    const context = setup({ repository });
    const response = await context.handler(context.request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({ error: "Unable to authorize supplier call.", code: "SUPPLIER_CALL_AUTHORIZATION_FAILURE" });
    expect(JSON.stringify(body)).not.toContain("secret repository connection");
    expect(context.inputs).toHaveLength(0);
  });
});
