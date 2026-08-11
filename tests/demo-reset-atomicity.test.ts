import { describe, expect, it } from "vitest";
import { DEMO_STORAGE_KEY } from "../lib/demo/persistence";
import {
  createDemoStoreEnvelope,
  DemoPersistenceCoordinator,
  deserializeDemoStoreEnvelope,
  serializeDemoStoreEnvelope,
  type DemoStoreLockManager,
} from "../lib/demo/persistence-coordinator";
import { createSeedState } from "../lib/demo/seed";

describe("demo reset atomicity", () => {
  it("does not invalidate the server session when the actual Web Lock request rejects", async () => {
    const initial = createDemoStoreEnvelope(createSeedState("demo_reset_rejected_lock_12345"), {
      commitId: "commit-initial",
    });
    let invalidations = 0;
    let writes = 0;
    const locks: DemoStoreLockManager = {
      request: async () => { throw new Error("Web Locks service rejected the request"); },
    };
    const coordinator = new DemoPersistenceCoordinator({
      getItem: () => serializeDemoStoreEnvelope(initial),
      setItem: () => { writes += 1; },
    }, locks, initial, () => "commit-reset");

    const result = await coordinator.reset(initial, async () => {
      invalidations += 1;
      return { ok: true };
    });

    expect(result).toEqual({ ok: false, reason: "LOCK_UNAVAILABLE", current: initial });
    expect(invalidations).toBe(0);
    expect(writes).toBe(0);
  });

  it("adopts every newer same-session write under one lock before invalidating and resetting once", async () => {
    const initial = createDemoStoreEnvelope(createSeedState("demo_reset_many_writes_12345"), {
      writeSequence: 2,
      commitId: "commit-2",
    });
    const latest = createDemoStoreEnvelope(structuredClone(initial.state), {
      writeSequence: 9,
      commitId: "commit-9",
    });
    let persisted = serializeDemoStoreEnvelope(latest);
    const events: string[] = [];
    const locks: DemoStoreLockManager = {
      request: async (_name, _options, callback) => {
        events.push("lock-enter");
        return callback();
      },
    };
    const coordinator = new DemoPersistenceCoordinator({
      getItem: (key) => {
        expect(key).toBe(DEMO_STORAGE_KEY);
        events.push("storage-read");
        return persisted;
      },
      setItem: (key, value) => {
        expect(key).toBe(DEMO_STORAGE_KEY);
        events.push("storage-write");
        persisted = value;
      },
    }, locks, initial, () => "commit-reset");
    let invalidations = 0;

    const result = await coordinator.reset(initial, async (demoSessionId) => {
      invalidations += 1;
      events.push("server-invalidate");
      expect(demoSessionId).toBe("demo_reset_many_writes_12345");
      return { ok: true };
    });

    expect(result).toMatchObject({
      ok: true,
      source: "local_reset",
      envelope: {
        kind: "reset",
        lineage: {
          resetGeneration: 1,
          writeSequence: 10,
          commitId: "commit-reset",
        },
      },
    });
    expect(result.ok && result.envelope.state.demoSessionId).not.toBe(initial.state.demoSessionId);
    expect(invalidations).toBe(1);
    expect(events).toEqual(["lock-enter", "storage-read", "server-invalidate", "storage-write"]);
    expect(deserializeDemoStoreEnvelope(persisted).envelope).toEqual(result.ok ? result.envelope : null);
  });
});
