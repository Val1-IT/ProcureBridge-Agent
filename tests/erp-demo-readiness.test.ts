import { describe, expect, it } from "vitest";
import {
  advanceErpJudgeSession,
  exitErpJudgeSession,
  resetErpDemo,
  startErpJudgeSession,
  startPresentationFallback,
} from "../lib/demo/erp-judge-mode";
import { createSeedState } from "../lib/demo/seed";

describe("ERP judge demo session", () => {
  it("starts the seeded shortage journey in fast mock mode", () => {
    const before = createSeedState("demo_operator_changes_12345");
    before.erp.activeRole = "sales";

    const started = startErpJudgeSession(before);

    expect(started.session).toMatchObject({
      active: true,
      simulationSpeed: "fast_demo",
      providerMode: "mock",
      presentationFallback: false,
      step: "sales_shortage",
    });
    expect(started.state).toMatchObject({
      demo: { simulationSpeed: "fast_demo" },
      erp: { activeRole: "admin" },
    });
    expect(started.state.erp.salesOrders).toEqual([
      expect.objectContaining({ id: "so-router-shortage", status: "draft" }),
    ]);
  });

  it("advances from authoritative ERP state and otherwise stays on the current step", () => {
    const started = startErpJudgeSession(createSeedState());
    expect(advanceErpJudgeSession(started.session, started.state)).toBe(started.session);

    const state = structuredClone(started.state);
    state.erp.purchaseRequests.push({
      id: "purchase-request-shortage",
      requestNumber: "PR-2026-0001",
      requesterRole: "sales",
      sourceSalesOrderId: "so-router-shortage",
      status: "approved",
      lines: [{ productId: "product-router", quantity: 5, unitPrice: 1_050_000 }],
      createdAt: "2026-08-09T01:00:00.000Z",
      updatedAt: "2026-08-09T01:00:00.000Z",
    });

    expect(advanceErpJudgeSession(started.session, state).step).toBe("purchase_order_approval");
  });

  it("restores the exact pre-demo snapshot and resets deterministic content with a fresh session", () => {
    const before = createSeedState("demo_operator_changes_12345");
    before.erp.activeRole = "warehouse";
    before.erp.products[0].name = "Operator-adjusted router";
    const started = startErpJudgeSession(before);
    started.state.erp.products[0].name = "Demo journey mutation";

    expect(exitErpJudgeSession(started.session)).toEqual(before);
    const reset = resetErpDemo(started.state, () => "demo_readiness_reset_session_12345");
    expect(reset.demoSessionId).toBe("demo_readiness_reset_session_12345");
    expect({ ...reset, demoSessionId: "ignored" }).toEqual({ ...createSeedState(), demoSessionId: "ignored" });
  });

  it("keeps Presentation Fallback deterministic and on the mock provider", () => {
    const fallback = startPresentationFallback(createSeedState());

    expect(fallback.session).toMatchObject({
      active: true,
      simulationSpeed: "instant",
      providerMode: "mock",
      presentationFallback: true,
      step: "sales_shortage",
    });
    expect(fallback.state.demo.simulationSpeed).toBe("instant");
  });
});
