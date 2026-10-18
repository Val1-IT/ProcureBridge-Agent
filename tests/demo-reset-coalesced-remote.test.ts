import { describe, expect, it } from "vitest";
import { DEMO_STORAGE_KEY } from "../lib/demo/persistence";
import {
  createDemoStoreEnvelope,
  DemoPersistenceCoordinator,
  serializeDemoStoreEnvelope,
  type DemoStoreEnvelope,
  type DemoStoreLockManager,
} from "../lib/demo/persistence-coordinator";
import { handleValidatedDemoStorageEvent } from "../lib/demo/provider-lifecycle";
import { createSeedState } from "../lib/demo/seed";

function postResetMutation(): DemoStoreEnvelope {
  return createDemoStoreEnvelope(createSeedState("demo_coalesced_remote_reset_123"), {
    kind: "mutation",
    resetGeneration: 2,
    writeSequence: 6,
    commitId: "commit-after-remote-reset",
  });
}

describe("coalesced remote reset lineage", () => {
  it("accepts a higher-generation mutation event as a remote reset and clears judge state", () => {
    const current = createDemoStoreEnvelope(createSeedState("demo_coalesced_current_123456"), {
      resetGeneration: 1,
      writeSequence: 4,
      commitId: "commit-current",
    });
    const incoming = postResetMutation();
    const accepted: DemoStoreEnvelope[] = [];
    let conflicts = 0;
    let judgeClears = 0;

    const classification = handleValidatedDemoStorageEvent(current, incoming, {
      accept: (envelope) => accepted.push(envelope),
      conflict: () => { conflicts += 1; },
      clearJudgeSession: () => { judgeClears += 1; },
    });

    expect(classification).toBe("remote_reset");
    expect(accepted).toEqual([incoming]);
    expect(conflicts).toBe(0);
    expect(judgeClears).toBe(1);
  });

  it("adopts a higher-generation mutation reread under the reset lock without invalidating again", async () => {
    const current = createDemoStoreEnvelope(createSeedState("demo_coalesced_reset_current_123"), {
      resetGeneration: 1,
      writeSequence: 4,
      commitId: "commit-current",
    });
    const incoming = postResetMutation();
    let persisted = serializeDemoStoreEnvelope(incoming);
    let invalidations = 0;
    let writes = 0;
    const locks: DemoStoreLockManager = {
      request: async (_name, _options, callback) => callback(),
    };
    const coordinator = new DemoPersistenceCoordinator({
      getItem: (key) => key === DEMO_STORAGE_KEY ? persisted : null,
      setItem: (_key, value) => {
        writes += 1;
        persisted = value;
      },
    }, locks, current, () => "must-not-create-commit");

    const result = await coordinator.reset(current, async () => {
      invalidations += 1;
      return { ok: true };
    });

    expect(result).toEqual({ ok: true, envelope: incoming, source: "remote_reset" });
    expect(invalidations).toBe(0);
    expect(writes).toBe(0);
    expect(persisted).toBe(serializeDemoStoreEnvelope(incoming));
  });
});
