import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoState } from "../lib/domain/types";
import type { ErpJudgeSession } from "../lib/demo/erp-judge-mode";
import { startErpJudgeSession } from "../lib/demo/erp-judge-mode";
import { createSeedState } from "../lib/demo/seed";
import { ErpDemoGuide } from "../components/erp-demo-guide";

const harness = vi.hoisted(() => ({
  state: null as DemoState | null,
  session: null as ErpJudgeSession | null,
}));

vi.mock("@/components/demo-store-provider", () => ({
  useDemoStore: () => ({ state: harness.state }),
}));

vi.mock("@/components/judge-demo-provider", () => ({
  useJudgeDemo: () => ({
    session: harness.session,
    next: () => undefined,
    exit: () => undefined,
    restart: () => undefined,
    canAdvance: true,
  }),
}));

describe("ERP guided-flow copy and destinations", () => {
  beforeEach(() => {
    const started = startErpJudgeSession(createSeedState("demo_guide_copy_session_12345"));
    harness.state = started.state;
    harness.session = started.session;
  });

  it("opens the shortage SO and tells the judge to inspect its exact pre-approved PR", () => {
    const html = renderToStaticMarkup(createElement(ErpDemoGuide));

    expect(html).toContain('href="/sales/orders/so-router-shortage"');
    expect(html).toContain("pre-approved Demo Data PR-2026-0001");
    expect(html).not.toContain("then create its linked Purchase Request");
  });

  it("opens the linked PO and identifies the same five-unit PR demand", () => {
    harness.session = { ...harness.session!, step: "purchase_order_approval" };
    const html = renderToStaticMarkup(createElement(ErpDemoGuide));

    expect(html).toContain('href="/purchasing/orders/po-router-replenishment"');
    expect(html).toContain("same five-unit demand from PR-2026-0001");
    expect(html).toContain("Approve PO-2026-0001");
    expect(html).not.toContain("is released for supplier follow-up");
  });

  it("keeps receipt instructions within the linked five-unit PO quantity", () => {
    harness.session = { ...harness.session!, step: "goods_receipt" };
    const html = renderToStaticMarkup(createElement(ErpDemoGuide));

    expect(html).toContain('href="/purchasing/receipts?purchaseOrderId=po-router-replenishment"');
    expect(html).toContain("Receive the five linked routers");
    expect(html).not.toContain("Receive 10 routers");
  });
});
