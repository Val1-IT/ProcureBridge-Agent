import { describe, expect, it } from "vitest";
import { createSeedState } from "../lib/demo/seed";
import { demoReducer } from "../lib/demo/reducer";
import { createErpSeedState } from "../lib/erp/seed";
import { authorize } from "../lib/erp/permissions";
import {
  setActiveRole,
  upsertCustomer,
  upsertProduct,
  upsertSupplier,
  type CustomerInput,
  type ProductInput,
  type SupplierInput,
} from "../lib/erp/commands/master-data";

const fixedNow = "2026-08-09T10:00:00.000Z";

const productInput: ProductInput = {
  sku: "SKU-KEYBOARD-01",
  name: "Keyboard Ergonomis",
  unit: "unit",
  salePrice: 725_000,
  purchasePrice: 500_000,
  reorderPoint: 12,
  active: true,
};

const supplierInput: SupplierInput = {
  code: "SUP-BARU",
  name: "PT Pemasok Baru",
  phone: "+62 811 9999 0000",
  email: "sales@pemasokbaru.demo",
  address: "Jakarta",
  paymentTermDays: 30,
  doNotContact: false,
  active: true,
};

const customerInput: CustomerInput = {
  code: "CUS-BARU",
  name: "PT Pelanggan Baru",
  contactName: "Dewi Lestari",
  phone: "+62 812 4444 5555",
  email: "dewi@pelangganbaru.demo",
  address: "Bandung",
  creditLimit: 10_000_000,
  active: true,
};

describe("ERP command boundary", () => {
  it("rejects a warehouse user changing supplier master data without mutation or audit", () => {
    const before = createErpSeedState();

    const result = upsertSupplier(before, "warehouse", supplierInput, fixedNow);

    expect(result).toEqual({
      ok: false,
      state: before,
      error: { code: "FORBIDDEN", message: "You do not have permission to manage suppliers." },
    });
    expect(result.state.auditLogs).toHaveLength(before.auditLogs.length);
  });

  it("increments revision exactly once and appends one safe audit for a successful atomic command", () => {
    const before = createErpSeedState();

    const result = upsertProduct(before, "admin", productInput, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revision).toBe(before.revision + 1);
    expect(result.state.products).toHaveLength(before.products.length + 1);
    expect(result.state.auditLogs).toMatchObject([
      { action: "product.upserted", actorRole: "admin", detail: { sku: productInput.sku } },
    ]);
    expect(result.state.auditLogs[0].detail).not.toHaveProperty("phone");
    expect(result.state.auditLogs[0].detail).not.toHaveProperty("email");
  });

  it("allows operational roles only their explicitly assigned permissions", () => {
    expect(authorize("admin", "finance.write")).toBe(true);
    expect(authorize("procurement", "purchase.write")).toBe(true);
    expect(authorize("warehouse", "stock.adjust")).toBe(true);
    expect(authorize("sales", "sales.write")).toBe(true);
    expect(authorize("finance", "finance.write")).toBe(true);
    expect(authorize("approver", "purchase.approve")).toBe(true);
    expect(authorize("warehouse", "master.manage")).toBe(false);
    expect(authorize("sales", "purchase.write")).toBe(false);
  });

  it("rejects invalid master data without changing the revision or audit", () => {
    const before = createErpSeedState();

    const duplicateSku = upsertProduct(before, "admin", { ...productInput, sku: before.products[0].sku }, fixedNow);
    const invalidSupplier = upsertSupplier(before, "admin", { ...supplierInput, email: "not-an-email" }, fixedNow);
    const invalidCustomer = upsertCustomer(before, "admin", { ...customerInput, phone: "invalid" }, fixedNow);

    for (const result of [duplicateSku, invalidSupplier, invalidCustomer]) {
      expect(result.ok).toBe(false);
      expect(result.state).toBe(before);
      expect(result.state.revision).toBe(before.revision);
      expect(result.state.auditLogs).toHaveLength(before.auditLogs.length);
    }
  });

  it("switches to a valid role with one audited atomic commit", () => {
    const before = createErpSeedState();

    const result = setActiveRole(before, "warehouse", fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({ revision: 1, activeRole: "warehouse" });
    expect(result.state.auditLogs).toMatchObject([
      { action: "demo.role_switched", actorRole: "warehouse", detail: { previousRole: "admin", nextRole: "warehouse" } },
    ]);
  });

  it("rejects invalid role values without mutation", () => {
    const before = createErpSeedState();

    const result = setActiveRole(before, "operator" as never, fixedNow);

    expect(result).toEqual({
      ok: false,
      state: before,
      error: { code: "INVALID_INPUT", message: "Active role is invalid." },
    });
  });

  it("persists only a commit based on the current ERP revision", () => {
    const before = createSeedState();
    const command = upsertProduct(before.erp, "admin", productInput, fixedNow);
    expect(command.ok).toBe(true);
    if (!command.ok) return;

    const stale = demoReducer(before, { type: "ERP_COMMIT", expectedRevision: 1, erp: command.state });
    const committed = demoReducer(before, { type: "ERP_COMMIT", expectedRevision: before.erp.revision, erp: command.state });

    expect(stale).toBe(before);
    expect(committed.erp).toEqual(command.state);
    expect(committed.calls).toBe(before.calls);
  });
});
