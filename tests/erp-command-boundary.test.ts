import { describe, expect, it } from "vitest";
import { createSeedState } from "../lib/demo/seed";
import { demoReducer, type DemoAction } from "../lib/demo/reducer";
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
import { createErpCommandExecutor } from "../lib/erp/command-intents";

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
    expect(authorize("approver", "stock.adjust.approve")).toBe(true);
    expect(authorize("approver", "stock.receive")).toBe(false);
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

  it("rejects deactivating a product that has inventory history without mutation", () => {
    const before = createErpSeedState();
    const current = before.products[0];

    const result = upsertProduct(before, "admin", { ...current, active: false }, fixedNow);

    expect(result).toEqual({
      ok: false,
      state: before,
      error: { code: "INVALID_STATE", message: "Products with inventory records cannot be deactivated." },
    });
  });

  it("switches to a valid role with one audited atomic commit", () => {
    const before = createErpSeedState();

    const result = setActiveRole(before, "warehouse", fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toMatchObject({ revision: 1, activeRole: "warehouse" });
    expect(result.state.auditLogs).toMatchObject([
      { action: "demo.role_switched", actorRole: "admin", detail: { previousRole: "admin", nextRole: "warehouse" } },
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

  it("does not accept raw ERP snapshot actions through the demo reducer", () => {
    const before = createSeedState();
    const command = upsertProduct(before.erp, "admin", productInput, fixedNow);
    expect(command.ok).toBe(true);
    if (!command.ok) return;

    const forgedSnapshotAction = { type: "ERP_COMMIT", expectedRevision: before.erp.revision, erp: command.state } as never;
    const next = demoReducer(before, forgedSnapshotAction);

    expect(next).toBe(before);
  });

  it("keeps ERP snapshots outside the reducer action type", () => {
    const before = createSeedState();
    type ReducerAction = Parameters<typeof demoReducer>[1];

    // @ts-expect-error ERP snapshots are not reducer actions.
    const forgedAction: ReducerAction = { type: "ERP_COMMIT", expectedRevision: before.erp.revision, erp: before.erp };

    expect(forgedAction).toBeDefined();
  });

  it("keeps ordinary legacy actions available through the public dispatcher action type", () => {
    const action: DemoAction = { type: "SET_FAST_MODE", value: false };

    const next = demoReducer(createSeedState(), action);

    expect(next.demo.simulationSpeed).toBe("real_time");
  });

  it("exposes only closed named commands and derives authorization from current state", () => {
    const before = createErpSeedState();
    before.activeRole = "warehouse";
    let current = before;
    const commands = createErpCommandExecutor(
      () => current,
      (_expectedRevision, next) => { current = next; return true; },
    );

    expect("run" in commands).toBe(false);
    const forged = commands.upsertProduct({ ...productInput, role: "admin" } as typeof productInput, fixedNow);

    expect(forged).toEqual({
      ok: false,
      state: before,
      error: { code: "FORBIDDEN", message: "You do not have permission to manage products." },
    });
    expect(current).toBe(before);
  });

  it("rejects a forged public callback and whole-state hydration without mutation", () => {
    const before = createSeedState();
    const commands = createErpCommandExecutor(() => before.erp, () => { throw new Error("forged commit must not run"); });
    const forgedRun = (commands as unknown as { run?: (input: unknown) => unknown }).run;
    const forgedHydrate = demoReducer(before, { type: "HYDRATE", state: { ...before, erp: { ...before.erp, activeRole: "admin" } } } as never);

    expect(forgedRun).toBeUndefined();
    expect(forgedHydrate).toBe(before);
  });

  it("commits a named mutation only with rev+1, one authoritative audit, and a valid v10 state", () => {
    const before = createErpSeedState();
    let current = before;
    const commands = createErpCommandExecutor(
      () => current,
      (_expectedRevision, next) => { current = next; return true; },
    );

    const result = commands.upsertProduct(productInput, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revision).toBe(1);
    expect(result.state.auditLogs).toHaveLength(1);
    expect(result.state.auditLogs[0]).toMatchObject({ action: "product.upserted", actorRole: "admin" });
    expect(current).toBe(result.state);
  });

  it("fails closed before revision overflow", () => {
    const before = createErpSeedState();
    before.revision = Number.MAX_SAFE_INTEGER;
    let committed = false;
    const commands = createErpCommandExecutor(
      () => before,
      () => { committed = true; return true; },
    );

    const result = commands.upsertProduct(productInput, fixedNow);

    expect(result).toEqual({
      ok: false,
      state: before,
      error: { code: "INVALID_STATE", message: "ERP revision cannot advance safely." },
    });
    expect(committed).toBe(false);
  });

  it("rejects a named master-data command with a malformed command time without mutation", () => {
    const before = createErpSeedState();
    let committed = false;
    const commands = createErpCommandExecutor(
      () => before,
      () => { committed = true; return true; },
    );

    const result = commands.upsertProduct(productInput, "not-an-iso-time");

    expect(result).toMatchObject({
      ok: false,
      state: before,
      error: {
        code: "INVALID_INPUT",
      },
    });
    expect(result.state).toBe(before);
    expect(result.state.products).toHaveLength(before.products.length);
    expect(result.state.auditLogs).toHaveLength(before.auditLogs.length);
    expect(committed).toBe(false);
  });

  it("rejects an unsafe supplier payment term without mutation", () => {
    const before = createErpSeedState();

    const result = upsertSupplier(before, "admin", {
      ...supplierInput,
      paymentTermDays: Number.MAX_SAFE_INTEGER + 1,
    }, fixedNow);

    expect(result.ok).toBe(false);
    expect(result.state).toBe(before);
    expect(result.state.revision).toBe(before.revision);
    expect(result.state.auditLogs).toHaveLength(before.auditLogs.length);
  });

  it("rejects a named command when its next audit id would duplicate persisted evidence", () => {
    const before = createErpSeedState();
    before.auditLogs = [{
      id: "erp-audit-1",
      entityType: "demo_workspace",
      entityId: "legacy-evidence",
      action: "legacy.evidence_preserved",
      actorRole: "system",
      actorId: "system:migration",
      detail: {},
      createdAt: fixedNow,
      updatedAt: fixedNow,
    }];
    let committed = false;
    const commands = createErpCommandExecutor(
      () => before,
      () => { committed = true; return true; },
    );

    const result = commands.upsertProduct(productInput, fixedNow);

    expect(result).toMatchObject({
      ok: false,
      state: before,
      error: {
        code: "INVALID_STATE",
      },
    });
    expect(result.state).toBe(before);
    expect(committed).toBe(false);
  });
});
