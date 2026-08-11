import { describe, expect, it } from "vitest";
import { createDemoStoreEnvelope, DemoPersistenceCoordinator, type DemoStoreLockManager } from "../lib/demo/persistence-coordinator";
import { createSeedState } from "../lib/demo/seed";

const locks: DemoStoreLockManager = {
  request: async (_name, _options, callback) => callback(),
};

describe("demo-store late corruption recovery", () => {
  it("resets from the latest trusted lineage even when corruption happened after earlier commits", async () => {
    let persisted = "{corrupt";
    const storage = {
      getItem: () => persisted,
      setItem: (_key: string, value: string) => { persisted = value; },
    };
    const initial = createDemoStoreEnvelope(createSeedState("demo_late_corrupt_origin_12345"), {
      resetGeneration: 2,
      writeSequence: 3,
      commitId: "initial",
    });
    const latest = createDemoStoreEnvelope(structuredClone(initial.state), {
      resetGeneration: 2,
      writeSequence: 7,
      commitId: "latest-before-corruption",
    });
    const coordinator = new DemoPersistenceCoordinator(storage, locks, initial, () => "reset-after-corruption");
    let invalidations = 0;

    const result = await coordinator.reset(latest, async (demoSessionId) => {
      invalidations += 1;
      expect(demoSessionId).toBe("demo_late_corrupt_origin_12345");
      return { ok: true };
    });

    expect(result).toMatchObject({
      ok: true,
      source: "local_reset",
      envelope: {
        lineage: {
          resetGeneration: 3,
          writeSequence: 8,
          commitId: "reset-after-corruption",
        },
      },
    });
    expect(result.ok && result.envelope.state.demoSessionId).not.toBe(latest.state.demoSessionId);
    expect(invalidations).toBe(1);
  });
});
