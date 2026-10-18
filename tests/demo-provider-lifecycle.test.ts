import { describe, expect, it } from "vitest";
import { DEMO_STORAGE_KEY } from "../lib/demo/persistence";
import { createSeedState } from "../lib/demo/seed";
import {
  createDemoStoreEnvelope,
  DemoPersistenceCoordinator,
  serializeDemoStoreEnvelope,
  type DemoStoreEnvelope,
  type DemoStoreLockManager,
} from "../lib/demo/persistence-coordinator";
import {
  createFreshRecoveryEnvelope,
  handleValidatedDemoStorageEvent,
  runGuideReplayTransition,
  runDemoResetLifecycle,
} from "../lib/demo/provider-lifecycle";

const immediateLocks: DemoStoreLockManager = {
  request: async (_name, _options, callback) => callback(),
};

describe("demo provider lifecycle", () => {
  it("keeps local state unchanged when server reset fails", async () => {
    const current = createDemoStoreEnvelope(createSeedState("demo_reset_server_failure_123"));
    let persisted = serializeDemoStoreEnvelope(current);
    let writes = 0;
    const coordinator = new DemoPersistenceCoordinator({
      getItem: (key) => key === DEMO_STORAGE_KEY ? persisted : null,
      setItem: (_key, value) => {
        writes += 1;
        persisted = value;
      },
    }, immediateLocks, current, () => "commit-reset");

    const result = await runDemoResetLifecycle({
      current,
      invalidateServer: async (demoSessionId) => {
        expect(demoSessionId).toBe("demo_reset_server_failure_123");
        return { ok: false, reason: "SUPPLIER_CALL_RESET_BUSY" };
      },
      reset: (expected, invalidateServer) => coordinator.reset(expected, invalidateServer),
    });

    expect(result).toEqual({ ok: false, reason: "SUPPLIER_CALL_RESET_BUSY", current });
    expect(writes).toBe(0);
    expect(persisted).toBe(serializeDemoStoreEnvelope(current));
  });

  it("accepts a newer remote reset under the lock without server invalidation or a local write", async () => {
    const current = createDemoStoreEnvelope(createSeedState("demo_reset_race_current_12345"), { resetGeneration: 1, writeSequence: 4, commitId: "commit-current" });
    const remote = createDemoStoreEnvelope(createSeedState("demo_reset_race_remote_123456"), { kind: "reset", resetGeneration: 2, writeSequence: 5, commitId: "commit-remote" });
    let persisted = serializeDemoStoreEnvelope(remote);
    let invalidations = 0;
    let writes = 0;
    const coordinator = new DemoPersistenceCoordinator({
      getItem: (key) => key === DEMO_STORAGE_KEY ? persisted : null,
      setItem: (_key, value) => {
        writes += 1;
        persisted = value;
      },
    }, immediateLocks, current, () => "must-not-create-commit");

    const result = await runDemoResetLifecycle({
      current,
      invalidateServer: async () => { invalidations += 1; return { ok: true }; },
      reset: (expected, invalidateServer) => coordinator.reset(expected, invalidateServer),
    });

    expect(result).toEqual({ ok: true, envelope: remote, source: "remote_reset" });
    expect(invalidations).toBe(0);
    expect(writes).toBe(0);
    expect(persisted).toBe(serializeDemoStoreEnvelope(remote));
  });

  it("accepts a newer remote reset and clears the judge envelope", async () => {
    const current = createDemoStoreEnvelope(createSeedState("demo_remote_current_session_123"), { resetGeneration: 1, writeSequence: 4, commitId: "commit-current" });
    const remote = createDemoStoreEnvelope(createSeedState("demo_remote_reset_session_12345"), { kind: "reset", resetGeneration: 2, writeSequence: 5, commitId: "commit-remote" });
    const accepted: DemoStoreEnvelope[] = [];
    let cleared = 0;

    const classification = handleValidatedDemoStorageEvent(current, remote, {
      accept: (envelope) => accepted.push(envelope),
      conflict: () => { throw new Error("remote reset must not conflict"); },
      clearJudgeSession: () => { cleared += 1; },
    });

    expect(classification).toBe("remote_reset");
    expect(accepted).toEqual([remote]);
    expect(cleared).toBe(1);
  });

  it("ignores stale events and surfaces fork conflicts without accepting either", () => {
    const current = createDemoStoreEnvelope(createSeedState("demo_event_current_session_123"), { writeSequence: 4, commitId: "commit-current" });
    const stale: DemoStoreEnvelope = { ...current, lineage: { ...current.lineage, writeSequence: 3, commitId: "commit-stale" } };
    const fork: DemoStoreEnvelope = { ...current, lineage: { ...current.lineage, commitId: "commit-fork" } };
    const accepted: DemoStoreEnvelope[] = [];
    let conflicts = 0;
    const handlers = { accept: (envelope: DemoStoreEnvelope) => accepted.push(envelope), conflict: () => { conflicts += 1; }, clearJudgeSession: () => undefined };

    expect(handleValidatedDemoStorageEvent(current, stale, handlers)).toBe("ignore");
    expect(handleValidatedDemoStorageEvent(current, fork, handlers)).toBe("conflict");
    expect(accepted).toEqual([]);
    expect(conflicts).toBe(1);
  });

  it("uses a fresh valid session when recovering corrupt persisted data", () => {
    const first = createFreshRecoveryEnvelope();
    const second = createFreshRecoveryEnvelope();

    expect(first.state.schemaVersion).toBe(11);
    expect(first.state.demoSessionId).not.toBe(second.state.demoSessionId);
    expect(first.lineage.demoSessionId).toBe(first.state.demoSessionId);
  });

  it("awaits supplier replay reset before applying a guide transition", async () => {
    const order: string[] = [];

    const result = await runGuideReplayTransition({
      restartServer: async () => {
        await Promise.resolve();
        order.push("server-reset");
        return { ok: true };
      },
      transition: async () => {
        order.push("local-transition");
        return true;
      },
      reportConflict: () => { throw new Error("successful replay must not report a conflict"); },
    });

    expect(result).toBe(true);
    expect(order).toEqual(["server-reset", "local-transition"]);
  });

  it("fails closed without applying a guide transition when replay reset fails", async () => {
    let transitions = 0;
    const conflicts: string[] = [];

    const result = await runGuideReplayTransition({
      restartServer: async () => ({ ok: false, error: "Supplier call replay is busy." }),
      transition: async () => { transitions += 1; return true; },
      reportConflict: (message) => conflicts.push(message),
    });

    expect(result).toBe(false);
    expect(transitions).toBe(0);
    expect(conflicts).toEqual(["Supplier call replay is busy."]);
  });
});
