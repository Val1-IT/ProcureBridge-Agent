import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { submitSupplierForm, submitWarehouseForm } from "../components/erp/entity-form";
import { GroupedNav } from "../components/erp/grouped-nav";
import { buildErpNavigation } from "../lib/erp/navigation";
import { createErpSeedState } from "../lib/erp/seed";
import type { SupplierInput } from "../lib/erp/commands/master-data";

const fixedNow = "2026-08-09T10:00:00.000Z";

const supplierFormFixture: SupplierInput = {
  code: "SUP-BARU",
  name: "PT Pemasok Baru",
  phone: "+62 811 9999 0000",
  email: "sales@pemasokbaru.demo",
  address: "Jakarta",
  paymentTermDays: 30,
  doNotContact: false,
  active: true,
};

describe("ERP navigation and master-data surfaces", () => {
  it("builds every approved navigation group with actionable routes", () => {
    const groups = buildErpNavigation("admin");

    expect(groups.map((group) => group.label)).toEqual([
      "Overview",
      "Purchasing",
      "Inventory",
      "Sales",
      "Finance",
      "Master Data",
      "Control",
    ]);
    expect(groups.flatMap((group) => group.items).every((item) => item.href.startsWith("/") && item.label.length > 0)).toBe(true);
  });

  it("rejects a rendered supplier submission when the active role lacks permission", () => {
    const before = createErpSeedState();

    const result = submitSupplierForm(before, "warehouse", supplierFormFixture, fixedNow);

    expect(result.ok).toBe(false);
    expect(result.state).toBe(before);
    expect(result.ok ? null : result.error.code).toBe("FORBIDDEN");
  });

  it("keeps the seeded warehouse read-only for operational roles but editable by Admin", () => {
    const before = createErpSeedState();
    const input = { ...before.warehouses[0], name: "Gudang Jakarta Utama" };

    const rejected = submitWarehouseForm(before, "procurement", input, fixedNow);
    const accepted = submitWarehouseForm(before, "admin", input, fixedNow);

    expect(rejected.ok).toBe(false);
    expect(rejected.ok ? null : rejected.error.code).toBe("FORBIDDEN");
    expect(accepted.ok).toBe(true);
    expect(accepted.ok ? accepted.value.name : null).toBe("Gudang Jakarta Utama");
  });

  it("keeps the sole version-one warehouse active when Admin submits an inactive value", () => {
    const before = createErpSeedState();

    const result = submitWarehouseForm(before, "admin", { ...before.warehouses[0], active: false }, fixedNow);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.active : null).toBe(true);
    expect(result.state.warehouses.filter((warehouse) => warehouse.active)).toHaveLength(1);
  });

  it("renders grouped links with an intentional index column and visible label", () => {
    const html = renderToStaticMarkup(createElement(GroupedNav, { pathname: "/dashboard", role: "admin" }));

    expect(html).toContain('<span class="nav-index">01</span><span>Dashboard</span>');
    expect(html).toContain('aria-label="ERP navigation"');
  });
});
