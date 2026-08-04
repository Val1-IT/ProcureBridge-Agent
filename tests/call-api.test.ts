import { describe, expect, it } from "vitest";
import { createSeedState } from "../lib/demo/seed";
import { createCreateCallHandler, type CallAuthorizationRepository } from "../lib/server/call-authorization";
import type { CallApproval, Customer, Invoice } from "../lib/domain/types";
import type { CallProvider, CreateCallInput } from "../lib/calle/types";

const seed = createSeedState();
const validApproval: CallApproval = { callId: "call-sinar", objective: "Confirm payment", minimumPayment: 5_000_000, extensionAllowed: true, maximumFollowUpDate: "2026-08-14", language: "Bahasa Indonesia", callTime: "10:00", aiDisclosureApproved: true, dataConfirmed: true, approvedBy: "Nadia Pratama", approvedAt: "2026-08-04T02:59:00.000Z" };

class FakeAuthorizationRepository implements CallAuthorizationRepository {
  customer: Customer | null = seed.customers[0];
  invoice: Invoice | null = seed.invoices[0];
  approval: CallApproval | null = validApproval;
  callsToday = 0;
  openDispute = false;
  recorded = 0;
  async getCustomer() { return this.customer; }
  async getInvoice() { return this.invoice; }
  async getApproval() { return this.approval; }
  async countCallsForCustomerOnDate() { return this.callsToday; }
  async hasOpenDispute() { return this.openDispute; }
  async recordCreatedCall() { this.recorded += 1; }
}

function setup(repository = new FakeAuthorizationRepository(), options: { now?: Date; env?: Record<string, string> } = {}) {
  const inputs: CreateCallInput[] = [];
  const modes: string[] = [];
  const provider: CallProvider = {
    async createCall(input) { inputs.push(input); return { callId: input.callId, providerCallId: `mock_${input.callId}`, status: "connecting", provider: "mock" }; },
    async getCall(callId) { return { callId, status: "active", durationSeconds: 0 }; },
    async endCall() {}, async getTranscript() { return []; },
  };
  const handler = createCreateCallHandler({ repository, now: () => options.now ?? new Date("2026-08-04T03:00:00.000Z"), env: options.env ?? {}, providerFactory: (mode) => { modes.push(mode); return provider; } });
  const request = (query = "") => new Request(`https://app.example/api/calls${query}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callId: "call-sinar", customerId: "cust-sinar", invoiceId: "inv-sinar" }) });
  return { handler, request, inputs, modes, repository };
}

describe("POST /api/calls server authorization", () => {
  it("creates an eligible call from server-owned data", async () => {
    const context = setup();
    const response = await context.handler(context.request());
    expect(response.status).toBe(201);
    expect(context.inputs[0]).toMatchObject({ phone: seed.customers[0].phone, scenario: "promise_to_pay", disclosure: expect.stringMatching(/AI/) });
    expect(context.repository.recorded).toBe(1);
  });

  it.each([
    ["missing approval", (repo: FakeAuthorizationRepository) => { repo.approval = null; }, "APPROVAL_INCOMPLETE"],
    ["invalid consent", (repo: FakeAuthorizationRepository) => { repo.customer = { ...seed.customers[0], consentStatus: "revoked" }; }, "CONSENT_INVALID"],
    ["do not contact", (repo: FakeAuthorizationRepository) => { repo.customer = { ...seed.customers[0], doNotContact: true }; }, "DO_NOT_CONTACT"],
    ["open dispute", (repo: FakeAuthorizationRepository) => { repo.openDispute = true; }, "OPEN_DISPUTE"],
    ["daily call limit", (repo: FakeAuthorizationRepository) => { repo.callsToday = 1; }, "DAILY_CALL_LIMIT"],
  ])("blocks %s before provider invocation", async (_name, mutate, code) => {
    const repo = new FakeAuthorizationRepository();
    mutate(repo);
    const context = setup(repo);
    const response = await context.handler(context.request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Call is not eligible.", codes: expect.arrayContaining([code]) });
    expect(context.inputs).toHaveLength(0);
  });

  it("uses the customer's timezone and actual injected clock", async () => {
    const context = setup(new FakeAuthorizationRepository(), { now: new Date("2026-08-04T14:00:00.000Z") });
    const response = await context.handler(context.request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ codes: expect.arrayContaining(["OUTSIDE_CALLING_HOURS"]) });
  });

  it("rejects inconsistent or missing invoice data", async () => {
    const repo = new FakeAuthorizationRepository();
    repo.invoice = null;
    const response = await setup(repo).handler(setup(repo).request());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Call request references invalid data.", codes: ["INVALID_INVOICE"] });
  });

  it("forces mock mode even when live environment variables exist", async () => {
    const context = setup(new FakeAuthorizationRepository(), { env: { CALLE_API_URL: "https://api.example", CALLE_API_KEY: "test-key", CALLE_AGENT_ID: "agent" } });
    const response = await context.handler(context.request("?forceMock=1"));
    expect(response.status).toBe(201);
    expect(context.modes).toEqual(["mock"]);
  });

  it("returns a safe provider failure without leaking its message", async () => {
    const repo = new FakeAuthorizationRepository();
    const handler = createCreateCallHandler({ repository: repo, now: () => new Date("2026-08-04T03:00:00.000Z"), env: {}, providerFactory: () => ({ async createCall() { throw new Error("secret provider response"); }, async getCall() { throw new Error(); }, async endCall() {}, async getTranscript() { return []; } }) });
    const response = await handler(setup(repo).request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Unable to create call." });
    expect(repo.recorded).toBe(0);
  });
});
