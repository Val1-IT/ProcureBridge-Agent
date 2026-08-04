import { describe, expect, it } from "vitest";
import {
  DEMO_SCHEMA_VERSION,
  deserializeDemoState,
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
});
