import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupplierFollowUpBriefPage from "../app/supplier-follow-up/[purchaseOrderId]/page";
import SupplierCallPage from "../app/supplier-calls/[callId]/page";
import SupplierCallResultPage from "../app/supplier-calls/[callId]/result/page";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import { completeSupplierCallSimulation, recordSupplierCallStarted } from "../lib/erp/commands/supplier-results";
import { createSeedState } from "../lib/demo/seed";
import type { DemoState } from "../lib/domain/types";

const harness = vi.hoisted(() => ({ callId: "supplier-call-po-1", purchaseOrderId: "po-router-replenishment", state: null as DemoState | null }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ callId: harness.callId, purchaseOrderId: harness.purchaseOrderId }),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

vi.mock("@/components/demo-store-provider", () => ({
  useDemoStore: () => {
    if (!harness.state) throw new Error("Test DemoState was not configured.");
    return { state: harness.state };
  },
}));

vi.mock("@/components/erp-command-provider", () => ({
  useErpCommands: () => ({ run: () => { throw new Error("Render test must not execute commands."); } }),
}));

function approvedDemoState(): DemoState {
  const state = createSeedState();
  state.erp.activeRole = "approver";
  const approved = saveSupplierCallApproval(state.erp, "approver", {
    supplierCallId: "supplier-call-po-1", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment", scenario: "partial_delivery",
    objective: "Confirm partial delivery dates", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20",
    partialDeliveryAllowed: true, maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", callTime: "10:00", approvedBy: "Nadia Pratama",
  }, "2026-08-09T01:00:00.000Z");
  if (!approved.ok) throw new Error(approved.error.message);
  state.erp = approved.state;
  return state;
}

function completedDemoState(): DemoState {
  const state = approvedDemoState();
  const started = recordSupplierCallStarted(state.erp, "approver", "supplier-call-po-1", {
    callId: "supplier-call-po-1", providerCallId: "supplier_mock_supplier-call-po-1", provider: "mock", status: "connecting",
  }, "2026-08-09", "2026-08-09T03:00:00.000Z");
  if (!started.ok) throw new Error(started.error.message);
  const completed = completeSupplierCallSimulation(started.state, "approver", "supplier-call-po-1", "2026-08-09T03:01:00.000Z");
  if (!completed.ok) throw new Error(completed.error.message);
  state.erp = completed.state;
  return state;
}

describe("supplier call workflow UI", () => {
  beforeEach(() => { harness.state = createSeedState(); });

  it("renders the full supplier brief and keeps Start Call locked before valid approval", () => {
    const html = renderToStaticMarkup(createElement(SupplierFollowUpBriefPage));
    expect(html).toContain("Supplier Brief");
    expect(html).toContain("Customer impact");
    expect(html).toContain("Supplier history");
    expect(html).toContain("Stock shortage");
    expect(html).toContain("Negotiation boundaries");
    expect(html).toContain("Mandatory confirmations");
    expect(html.match(/data-guardrail=/g)).toHaveLength(8);
    expect(html).toContain("Demo Data");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Start Call<\/button>/);
  });

  it("unlocks Start Call only when the saved approval and all eight guardrails pass", () => {
    harness.state = approvedDemoState();
    const html = renderToStaticMarkup(createElement(SupplierFollowUpBriefPage));
    expect(html.match(/data-guardrail-status="pass"/g)).toHaveLength(8);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Start Call<\/button>/);
    expect(html).toContain("Mock provider");
    expect(html).toContain("Simulation");
  });

  it("renders the persistent mock console with explicit speed and simulation labels", () => {
    const state = approvedDemoState();
    const started = recordSupplierCallStarted(state.erp, "approver", "supplier-call-po-1", {
      callId: "supplier-call-po-1", providerCallId: "supplier_mock_supplier-call-po-1", provider: "mock", status: "connecting",
    }, "2026-08-09", "2026-08-09T03:00:00.000Z");
    if (!started.ok) throw new Error(started.error.message);
    state.erp = started.state;
    harness.state = state;
    const html = renderToStaticMarkup(createElement(SupplierCallPage));
    expect(html).toContain("Supplier Call Console");
    expect(html).toContain("SIMULATION");
    expect(html).toContain("MockSupplierCallProvider");
    expect(html).toContain("Real-time");
    expect(html).toContain("30–45 sec");
    expect(html).toContain("Fast Demo");
    expect(html).toContain("12–18 sec");
    expect(html).toContain("Instant Result");
    expect(html).toContain("Live transcript");
  });

  it("renders structured result fields and all four command-backed decisions", () => {
    harness.state = completedDemoState();
    const html = renderToStaticMarkup(createElement(SupplierCallResultPage));
    expect(html).toContain("Structured Supplier Result");
    expect(html).toContain("Simulation");
    expect(html).toContain("Sentiment");
    expect(html).toContain("Detected entities");
    expect(html).toContain("Approve");
    expect(html).toContain("Edit");
    expect(html).toContain("Reject");
    expect(html).toContain("Human Review");
    expect(html).toContain("No stock, invoice, or payment change occurs before approval");
  });
});
