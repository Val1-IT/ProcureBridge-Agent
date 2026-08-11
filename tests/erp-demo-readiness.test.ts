import { describe, expect, it } from "vitest";
import {
  advanceErpJudgeSession,
  canAdvanceErpJudgeSession,
  exitErpJudgeSession,
  resetErpDemo,
  startErpJudgeSession,
  startPresentationFallback,
} from "../lib/demo/erp-judge-mode";
import { createErpCommandExecutor } from "../lib/erp/command-intents";
import { createSeedState } from "../lib/demo/seed";

describe("ERP judge demo session", () => {
  const shortageRequestId = "purchase-request-router-shortage";

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
    expect(started.state.demoSessionId).toBe(before.demoSessionId);
    expect(started.state.erp.salesOrders).toEqual([
      expect.objectContaining({ id: "so-router-shortage", status: "draft" }),
    ]);
  });

  it("seeds one exact shortage PR and links the guided PO to that same demand", () => {
    const started = startErpJudgeSession(createSeedState());
    const request = started.state.erp.purchaseRequests.find((item) => item.id === shortageRequestId);
    const order = started.state.erp.purchaseOrders.find((item) => item.id === "po-router-replenishment");

    expect(request).toMatchObject({
      sourceSalesOrderId: "so-router-shortage",
      status: "approved",
      lines: [{ productId: "product-router", quantity: 5, unitPrice: 1_050_000 }],
    });
    expect(order).toMatchObject({
      purchaseRequestId: shortageRequestId,
      status: "pending_approval",
      lines: [{ productId: "product-router", quantity: 5, unitPrice: 1_050_000 }],
    });
  });

  it("advances only through the exact PR-to-PO chain, not an unrelated active request or PO", () => {
    const started = startErpJudgeSession(createSeedState());
    expect(canAdvanceErpJudgeSession(started.session, started.state)).toBe(true);
    const purchaseStep = advanceErpJudgeSession(started.session, started.state);
    expect(purchaseStep.step).toBe("purchase_order_approval");
    expect(canAdvanceErpJudgeSession(purchaseStep, started.state)).toBe(false);

    let current = started.state.erp;
    const commands = createErpCommandExecutor(
      () => current,
      (_expectedRevision, next) => { current = next; return true; },
    );
    const approved = commands.purchaseOrderAction("approve", "po-router-replenishment", "2026-08-10T03:05:00.000Z");
    expect(approved.ok).toBe(true);
    const released = { ...started.state, erp: current };
    expect(released.erp.purchaseOrders[0].status).toBe("sent");
    expect(canAdvanceErpJudgeSession(purchaseStep, released)).toBe(true);

    const brokenOrderLink = structuredClone(started.state);
    brokenOrderLink.erp.purchaseOrders[0].purchaseRequestId = null;
    expect(canAdvanceErpJudgeSession(purchaseStep, brokenOrderLink)).toBe(false);

    const mismatchedDemand = structuredClone(started.state);
    mismatchedDemand.erp.purchaseOrders[0].lines[0].quantity = 6;
    expect(canAdvanceErpJudgeSession(purchaseStep, mismatchedDemand)).toBe(false);

    const substitutedRequest = structuredClone(started.state);
    substitutedRequest.erp.purchaseRequests[0] = {
      ...substitutedRequest.erp.purchaseRequests[0],
      id: "purchase-request-unrelated",
    };
    substitutedRequest.erp.purchaseOrders[0].purchaseRequestId = "purchase-request-unrelated";
    expect(canAdvanceErpJudgeSession(started.session, substitutedRequest)).toBe(false);
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
