import { describe, expect, it } from "vitest";
import { startErpJudgeSession } from "../lib/demo/erp-judge-mode";
import {
  createErpJudgeSessionEnvelope,
  deserializeJudgeSessionEnvelope,
} from "../lib/demo/judge-session-envelope";
import { createSeedState } from "../lib/demo/seed";

describe("judge session envelope", () => {
  it("round trips only a versioned session bound to its v10 snapshot and reset generation", () => {
    const before = createSeedState("demo_judge_bound_session_12345");
    const started = startErpJudgeSession(before);
    const envelope = createErpJudgeSessionEnvelope(started.session, {
      demoSessionId: before.demoSessionId,
      resetGeneration: 4,
    }, "guide-opaque-123");

    const restored = deserializeJudgeSessionEnvelope(JSON.stringify(envelope), {
      demoSessionId: before.demoSessionId,
      resetGeneration: 4,
    });

    expect(restored).toEqual(envelope);
    expect(restored?.session.preDemoSnapshot).toEqual(before);
  });

  it.each([
    ["raw unversioned session", (value: unknown) => (value as { session: unknown }).session],
    ["pre-v10 snapshot", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { schemaVersion: number } } }; copy.session.preDemoSnapshot.schemaVersion = 9; return copy; }],
    ["zero product sale price", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { erp: { products: Array<{ salePrice: number }> } } } }; copy.session.preDemoSnapshot.erp.products[0].salePrice = 0; return copy; }],
    ["zero product purchase price", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { erp: { products: Array<{ purchasePrice: number }> } } } }; copy.session.preDemoSnapshot.erp.products[0].purchasePrice = 0; return copy; }],
    ["negative product reorder point", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { erp: { products: Array<{ reorderPoint: number }> } } } }; copy.session.preDemoSnapshot.erp.products[0].reorderPoint = -1; return copy; }],
    ["negative customer credit limit", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { erp: { customers: Array<{ creditLimit: number }> } } } }; copy.session.preDemoSnapshot.erp.customers[0].creditLimit = -1; return copy; }],
    ["unsafe supplier payment term", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { erp: { suppliers: Array<{ paymentTermDays: number }> } } } }; copy.session.preDemoSnapshot.erp.suppliers[0].paymentTermDays = Number.MAX_SAFE_INTEGER + 1; return copy; }],
    ["forged snapshot", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { erp: { revision: number } } } }; copy.session.preDemoSnapshot.erp.revision = -1; return copy; }],
    ["forged legacy collection item", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { customers: unknown[] } } }; copy.session.preDemoSnapshot.customers = [null]; return copy; }],
    ["forged ERP entity timestamp", (value: unknown) => { const copy = structuredClone(value) as { session: { preDemoSnapshot: { erp: { products: Array<{ createdAt: string }> } } } }; copy.session.preDemoSnapshot.erp.products[0].createdAt = "not-an-iso-time"; return copy; }],
  ])("rejects a %s", (_label, mutate) => {
    const before = createSeedState("demo_judge_reject_session_12345");
    const started = startErpJudgeSession(before);
    const envelope = createErpJudgeSessionEnvelope(started.session, { demoSessionId: before.demoSessionId, resetGeneration: 1 }, "guide-opaque-123");

    expect(deserializeJudgeSessionEnvelope(JSON.stringify(mutate(envelope)), { demoSessionId: before.demoSessionId, resetGeneration: 1 })).toBeNull();
  });

  it("invalidates an old snapshot after a remote reset generation", () => {
    const before = createSeedState("demo_judge_old_session_123456");
    const started = startErpJudgeSession(before);
    const envelope = createErpJudgeSessionEnvelope(started.session, { demoSessionId: before.demoSessionId, resetGeneration: 2 }, "guide-opaque-123");

    const restored = deserializeJudgeSessionEnvelope(JSON.stringify(envelope), {
      demoSessionId: "demo_judge_reset_session_12345",
      resetGeneration: 3,
    });

    expect(restored).toBeNull();
  });
});
