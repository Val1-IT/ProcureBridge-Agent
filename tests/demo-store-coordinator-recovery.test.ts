import { describe, expect, it } from "vitest";
import { createDemoStoreEnvelope, DemoPersistenceCoordinator, deserializeDemoStoreEnvelope, type DemoStoreLockManager } from "../lib/demo/persistence-coordinator";
import { createSeedState } from "../lib/demo/seed";

const immediateLocks: DemoStoreLockManager = {
  request: async (_name, _options, callback) => callback(),
};

describe("demo-store coordinator recovery", () => {
  it("allows only an explicit reset to recover corrupted persisted content under the lock", async () => {
    let persisted = "{corrupt";
    const storage = {
      getItem: () => persisted,
      setItem: (_key: string, value: string) => { persisted = value; },
    };
    const initial = createDemoStoreEnvelope(createSeedState("demo_recovery_origin_session_123"), {
      resetGeneration: 4,
      writeSequence: 8,
      commitId: "initial",
    });
    const coordinator = new DemoPersistenceCoordinator(storage, immediateLocks, initial, () => "reset-commit");
    let invalidations = 0;

    const result = await coordinator.reset(initial, async (demoSessionId) => {
      invalidations += 1;
      expect(demoSessionId).toBe("demo_recovery_origin_session_123");
      return { ok: true };
    });

    expect(result).toMatchObject({
      ok: true,
      source: "local_reset",
      envelope: {
        kind: "reset",
        lineage: { resetGeneration: 5, writeSequence: 9, commitId: "reset-commit" },
      },
    });
    expect(result.ok && result.envelope.state.demoSessionId).not.toBe(initial.state.demoSessionId);
    expect(invalidations).toBe(1);
    expect(deserializeDemoStoreEnvelope(persisted).envelope?.lineage).toMatchObject({
      resetGeneration: 5,
      writeSequence: 9,
      commitId: "reset-commit",
    });
  });

  it("does not let an ordinary mutation overwrite corrupted persisted content", async () => {
    let writes = 0;
    const storage = {
      getItem: () => "{corrupt",
      setItem: () => { writes += 1; },
    };
    const initial = createDemoStoreEnvelope(createSeedState("demo_recovery_mutation_session_123"), { commitId: "initial" });
    const coordinator = new DemoPersistenceCoordinator(storage, immediateLocks, initial, () => "mutation-commit");
    const next = structuredClone(initial.state);
    next.erp.activeRole = "finance";

    await expect(coordinator.commit(initial.lineage, next, "mutation")).resolves.toEqual({
      ok: false,
      reason: "INVALID_PERSISTED_STATE",
      current: initial,
    });
    expect(writes).toBe(0);
    expect(storage.getItem()).toBe("{corrupt");
  });
});
