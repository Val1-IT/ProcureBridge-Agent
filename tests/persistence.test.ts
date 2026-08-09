import { describe, expect, it } from "vitest";
import {
  DEMO_SCHEMA_VERSION,
  deserializeDemoState,
  loadDemoStateFromStorage,
  serializeDemoState,
} from "../lib/demo/persistence";
import { createSeedState } from "../lib/demo/seed";

describe("versioned demo persistence", () => {
  it("seeds all required scenarios", () => {
    const state = createSeedState();
    expect(state.schemaVersion).toBe(DEMO_SCHEMA_VERSION);
    expect(state.customers).toHaveLength(3);
    expect(state.invoices.map((invoice) => invoice.scenario)).toEqual([
      "promise_to_pay",
      "invoice_dispute",
      "failed_contact",
    ]);
  });

  it("round trips valid persisted state", () => {
    const state = createSeedState();
    expect(deserializeDemoState(serializeDemoState(state))).toEqual(state);
  });

  it("fails closed to fresh seed for invalid or stale data", () => {
    expect(deserializeDemoState("not-json")).toEqual(createSeedState());
    expect(deserializeDemoState('{"schemaVersion":0}')).toEqual(createSeedState());
  });

  it("migrates a browser-persisted v2 recovery state when no current schema state exists", () => {
    const legacy = { ...createSeedState(), schemaVersion: 2 } as Record<string, unknown>;
    delete legacy.erp;
    const values = new Map<string, string>([["arvanta-procurebridge-demo-v2", JSON.stringify(legacy)]]);

    const loaded = loadDemoStateFromStorage({ getItem: (key) => values.get(key) ?? null });

    expect(loaded.state.schemaVersion).toBe(DEMO_SCHEMA_VERSION);
    expect(loaded.state.erp.revision).toBe(0);
    expect(loaded.recoveryReason).toBeNull();
  });
});
