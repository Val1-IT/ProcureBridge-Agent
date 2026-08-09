import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoState } from "../lib/domain/types";
import { createSeedState } from "../lib/demo/seed";
import SuppliersPage from "../app/suppliers/page";
import PurchaseRequestsPage from "../app/purchasing/requests/page";

const harness = vi.hoisted(() => ({ query: "", state: null as DemoState | null }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(harness.query),
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

describe("purchasing linked destination pages", () => {
  beforeEach(() => {
    harness.state = createSeedState();
    harness.query = "";
  });

  it("consumes supplierId and renders only the exact linked supplier as current", () => {
    harness.query = "supplierId=supplier-kertas";

    const html = renderToStaticMarkup(createElement(SuppliersPage));

    expect(html).toContain("CV Kertas Nusantara");
    expect(html).not.toContain("PT Teknologi Utama");
    expect(html).toContain('aria-current="true"');
  });

  it("consumes purchaseRequestId and renders only the exact linked request as current", () => {
    harness.state!.erp.purchaseRequests = [
      { id: "request-router", requestNumber: "PR-2026-0001", requesterRole: "procurement", status: "draft", lines: [{ productId: "product-router", quantity: 2, unitPrice: 1_050_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z" },
      { id: "request-paper", requestNumber: "PR-2026-0002", requesterRole: "procurement", status: "approved", lines: [{ productId: "product-paper", quantity: 100, unitPrice: 11_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z" },
    ];
    harness.query = "purchaseRequestId=request-paper";

    const html = renderToStaticMarkup(createElement(PurchaseRequestsPage));

    expect(html).toContain("PR-2026-0002");
    expect(html).not.toContain("PR-2026-0001");
    expect(html).toContain('aria-current="true"');
  });
});
