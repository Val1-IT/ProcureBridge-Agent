import { describe, expect, it } from "vitest";
import { DEMO_STORAGE_KEY } from "../lib/demo/persistence";
import {
  createDemoStoreEnvelope,
  DemoPersistenceCoordinator,
  serializeDemoStoreEnvelope,
  type DemoStoreLockManager,
} from "../lib/demo/persistence-coordinator";
import { runDemoResetLifecycle } from "../lib/demo/provider-lifecycle";
import { createSeedState } from "../lib/demo/seed";

describe("demo reset lifecycle atomic coordinator binding", () => {
  it("delegates the whole reset lifecycle to the coordinator without a boolean lock preflight", async () => {
    const current = createDemoStoreEnvelope(createSeedState("demo_reset_lifecycle_atomic_123"), {
      writeSequence: 3,
      commitId: "commit-current",
    });
    let persisted = serializeDemoStoreEnvelope(current);
    const locks: DemoStoreLockManager = {
      request: async (_name, _options, callback) => callback(),
    };
    const coordinator = new DemoPersistenceCoordinator({
      getItem: (key) => key === DEMO_STORAGE_KEY ? persisted : null,
      setItem: (_key, value) => { persisted = value; },
    }, locks, current, () => "commit-reset");
    let invalidations = 0;

    const result = await runDemoResetLifecycle({
      current,
      reset: (expected, invalidateServer) => coordinator.reset(expected, invalidateServer),
      invalidateServer: async (demoSessionId) => {
        invalidations += 1;
        expect(demoSessionId).toBe("demo_reset_lifecycle_atomic_123");
        return { ok: true };
      },
    });

    expect(result).toMatchObject({
      ok: true,
      source: "local_reset",
      envelope: { lineage: { resetGeneration: 1, writeSequence: 4, commitId: "commit-reset" } },
    });
    expect(invalidations).toBe(1);
  });
});
