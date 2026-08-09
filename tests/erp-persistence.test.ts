import { describe, expect, it } from "vitest";
import type { DemoState } from "../lib/domain/types";
import { deserializeDemoState, loadDemoState } from "../lib/demo/persistence";
import { createSeedState } from "../lib/demo/seed";
import { createErpSeedState } from "../lib/erp/seed";
import { selectAvailableStock, selectIncomingStock } from "../lib/erp/selectors";

describe("ERP persistence foundation", () => {
  it("migrates schema v2 recovery data into schema v3 with a deterministic ERP slice", () => {
    const legacy = { ...createSeedState(), schemaVersion: 2 } as unknown as DemoState;
    delete (legacy as Partial<DemoState>).erp;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.erp.products.map((item) => item.sku)).toEqual(["SKU-ROUTER-01", "SKU-SCANNER-01", "SKU-PAPER-80"]);
    expect(migrated.erp.revision).toBe(0);
  });

  it("computes available and incoming quantities without storing derived totals", () => {
    const erp = createErpSeedState();

    expect(selectAvailableStock(erp, "product-router")).toBe(18);
    expect(selectIncomingStock(erp, "product-router")).toBe(40);
  });

  it("reports invalid stored data so the UI can offer a safe reset", () => {
    const loaded = loadDemoState("not-json");

    expect(loaded.state).toEqual(createSeedState());
    expect(loaded.recoveryReason).toBe("INVALID_JSON");
  });
});
