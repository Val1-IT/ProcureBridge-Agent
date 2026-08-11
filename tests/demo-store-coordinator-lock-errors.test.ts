import { describe, expect, it } from "vitest";
import { createDemoStoreEnvelope, DemoPersistenceCoordinator, type DemoStoreLockManager } from "../lib/demo/persistence-coordinator";
import { createSeedState } from "../lib/demo/seed";

describe("demo-store persistence coordinator lock failures", () => {
  it("fails closed when Web Locks rejects and does not write", async () => {
    let writes = 0;
    const storage = {
      getItem: () => null,
      setItem: () => { writes += 1; },
    };
    const locks: DemoStoreLockManager = {
      request: async () => { throw new Error("lock service unavailable"); },
    };
    const initial = createDemoStoreEnvelope(createSeedState("demo_lock_error_session_12345"), { commitId: "initial" });
    const coordinator = new DemoPersistenceCoordinator(storage, locks, initial, () => "next");
    const next = structuredClone(initial.state);
    next.erp.activeRole = "finance";

    await expect(coordinator.commit(initial.lineage, next, "mutation")).resolves.toEqual({
      ok: false,
      reason: "LOCK_UNAVAILABLE",
      current: initial,
    });
    expect(writes).toBe(0);
  });
});
