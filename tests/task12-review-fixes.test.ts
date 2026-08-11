import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SupplierFollowUpBriefPage from "../app/supplier-follow-up/[purchaseOrderId]/page";
import {
  resetErpDemo,
  startErpJudgeSession,
  startPresentationFallback,
  type ErpJudgeSession,
} from "../lib/demo/erp-judge-mode";
import { createSeedState } from "../lib/demo/seed";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import type { DemoState } from "../lib/domain/types";
import {
  createCreateSupplierCallHandler,
  DemoSupplierCallAuthorizationRepository,
} from "../lib/server/supplier-call-authorization";
import { MockSupplierCallProvider } from "../lib/supplier-call/mock-provider";

const harness = vi.hoisted(() => ({ state: null as DemoState | null, session: null as ErpJudgeSession | null }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ purchaseOrderId: "po-router-replenishment" }),
  useRouter: () => ({ push: () => undefined }),
}));

vi.mock("@/components/demo-store-provider", () => ({
  useDemoStore: () => ({ state: harness.state, hydrated: true }),
}));

vi.mock("@/components/erp-command-provider", () => ({
  useErpCommands: () => ({ run: () => { throw new Error("Render test must not execute commands."); } }),
}));

vi.mock("@/components/judge-demo-provider", () => ({
  useJudgeDemo: () => ({ session: harness.session }),
}));

const serverApprovalCapability = "test_approval_capability_12345678901234567890";
const supplierApprovalInput = {
  supplierCallId: "supplier-call-po-1", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment",
  scenario: "delivery_commitment" as const, objective: "Confirm delivery date", permittedProductIds: ["product-router"],
  maximumDeliveryDate: "2026-08-20", partialDeliveryAllowed: true, maximumUnitPriceIncreasePercent: 0,
  language: "Bahasa Indonesia", approvedBy: "Nadia Pratama",
};

async function registerServerApproval(repository: DemoSupplierCallAuthorizationRepository, demoSessionId: string): Promise<void> {
  const result = await repository.registerSupplierCallApproval({
    demoSessionId, approvedAt: "2026-08-09T01:00:00.000Z", approval: supplierApprovalInput,
  }, serverApprovalCapability);
  if (!result.ok) throw new Error("Unable to register the test supplier-call approval.");
}

function approvedState(): DemoState {
  const state = createSeedState("demo_review_clock_session_12345");
  state.erp.activeRole = "approver";
  const result = saveSupplierCallApproval(state.erp, "approver", supplierApprovalInput, "2026-08-09T01:00:00.000Z");
  if (!result.ok) throw new Error(result.error.message);
  state.erp = result.state;
  return state;
}

function mockRequest(demoSessionId: string, demoClockIso?: string, forceMock = true): Request {
  return new Request(`https://app.example/api/supplier-calls${forceMock ? "?forceMock=1" : ""}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-supplier-call-approval": serverApprovalCapability },
    body: JSON.stringify({
      callId: "supplier-call-po-1",
      supplierId: "supplier-utama",
      purchaseOrderId: "po-router-replenishment",
      demoSessionId,
      ...(demoClockIso ? { demoClockIso } : {}),
    }),
  });
}

describe("Task 12 deterministic after-hours demo clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T14:00:00.000Z")); // 21:00 Jakarta
    harness.state = approvedState();
    harness.session = null;
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["guided ERP", startErpJudgeSession],
    ["Presentation Fallback", startPresentationFallback],
  ])("binds %s to a clearly labeled mock-only business-time clock", (_label, start) => {
    const started = start(harness.state!);
    harness.session = started.session;

    const html = renderToStaticMarkup(createElement(SupplierFollowUpBriefPage));

    expect(started.session.demoClockIso).toBe("2026-08-10T03:00:00.000Z");
    expect(html).toContain("Demo clock / guardrail simulation");
    expect(html).toContain("10:00 Jakarta");
    expect(html).toContain("8/8 PASS");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Start Call<\/button>/);
  });

  it("allows the session clock only through forced mock demo authorization", async () => {
    const repository = new DemoSupplierCallAuthorizationRepository();
    const demoSessionId = "demo_review_clock_api_123456";
    await registerServerApproval(repository, demoSessionId);
    const handler = createCreateSupplierCallHandler({
      repository,
      now: () => new Date("2026-08-09T14:00:00.000Z"),
      providerFactory: () => new MockSupplierCallProvider(),
    });

    const response = await handler(mockRequest(demoSessionId, "2026-08-10T03:00:00.000Z"));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ code: "SUPPLIER_CALL_CREATED", call: { provider: "mock" } });
  });

  it("keeps an ordinary forced-mock call blocked by authoritative after-hours time", async () => {
    const repository = new DemoSupplierCallAuthorizationRepository();
    const demoSessionId = "demo_review_real_clock_12345";
    await registerServerApproval(repository, demoSessionId);
    const handler = createCreateSupplierCallHandler({
      repository,
      now: () => new Date("2026-08-09T14:00:00.000Z"),
      providerFactory: () => new MockSupplierCallProvider(),
    });

    const response = await handler(mockRequest(demoSessionId));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Supplier call is not eligible.", code: "SUPPLIER_CALL_INELIGIBLE", codes: expect.arrayContaining(["OUTSIDE_CALLING_HOURS"]) });
  });

  it.each([
    ["without forced mock", false, false],
    ["with production repository capability", true, true],
  ])("rejects a client demo clock %s", async (_label, forceMock, productionRepository) => {
    const repository = new DemoSupplierCallAuthorizationRepository();
    if (productionRepository) {
      Object.defineProperty(repository, "authorizationMode", { value: "production" });
      Object.defineProperty(repository, "repositoryCapability", { value: "production" });
    }
    const handler = createCreateSupplierCallHandler({ repository, providerFactory: () => new MockSupplierCallProvider() });

    const response = await handler(mockRequest(`demo_review_reject_${forceMock}_${productionRepository}_12345`, "2026-08-10T03:00:00.000Z", forceMock));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Demo clock is not allowed for this request.", code: "DEMO_CLOCK_NOT_ALLOWED" });
  });
});

describe("Task 12 reset session identity", () => {
  it("returns deterministic seed content with an injected fresh valid session ID", () => {
    const changed = approvedState();
    const freshId = "demo_injected_reset_session_12345";

    const reset = resetErpDemo(changed, () => freshId);

    expect(reset.demoSessionId).toBe(freshId);
    expect({ ...reset, demoSessionId: "ignored" }).toEqual({ ...createSeedState(), demoSessionId: "ignored" });
  });
});
