import { describe, expect, it } from "vitest";
import { DEMO_STORAGE_KEY } from "../lib/demo/persistence";
import { createSeedState } from "../lib/demo/seed";
import {
  DemoPersistenceCoordinator,
  classifyDemoStorageEvent,
  createDemoStoreEnvelope,
  deserializeDemoStoreEnvelope,
  serializeDemoStoreEnvelope,
  type DemoStoreEnvelope,
  type DemoStoreLockManager,
} from "../lib/demo/persistence-coordinator";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  writes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes += 1; this.values.set(key, value); }
}

class SerialLocks implements DemoStoreLockManager {
  private tail: Promise<void> = Promise.resolve();
  async request<T>(_name: string, _options: { mode: "exclusive" }, callback: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await callback(); } finally { release(); }
  }
}

describe("demo-store persistence coordinator", () => {
  it("serializes two providers from the same version and fails the loser closed", async () => {
    const storage = new MemoryStorage();
    const locks = new SerialLocks();
    const initial = createDemoStoreEnvelope(createSeedState("demo_collision_session_12345"), { commitId: "commit-0" });
    storage.setItem(DEMO_STORAGE_KEY, serializeDemoStoreEnvelope(initial));
    const first = new DemoPersistenceCoordinator(storage, locks, initial, () => "commit-1");
    const second = new DemoPersistenceCoordinator(storage, locks, initial, () => "commit-2");
    const stateA = structuredClone(initial.state);
    stateA.erp.activeRole = "warehouse";
    const stateB = structuredClone(initial.state);
    stateB.erp.activeRole = "finance";

    const [winner, loser] = await Promise.all([
      first.commit(initial.lineage, stateA, "mutation"),
      second.commit(initial.lineage, stateB, "mutation"),
    ]);

    expect(winner.ok).toBe(true);
    expect(loser).toMatchObject({ ok: false, reason: "STALE_STATE" });
    const persisted = deserializeDemoStoreEnvelope(storage.getItem(DEMO_STORAGE_KEY));
    expect(persisted.envelope?.state.erp.activeRole).toBe("warehouse");
  });

  it("fails closed without Web Locks and performs no best-effort write", async () => {
    const storage = new MemoryStorage();
    const initial = createDemoStoreEnvelope(createSeedState("demo_no_locks_session_12345"), { commitId: "commit-0" });
    const coordinator = new DemoPersistenceCoordinator(storage, null, initial, () => "commit-1");
    const next = structuredClone(initial.state);
    next.erp.activeRole = "finance";

    const result = await coordinator.commit(initial.lineage, next, "mutation");

    expect(result).toEqual({ ok: false, reason: "LOCK_UNAVAILABLE", current: initial });
    expect(storage.writes).toBe(0);
  });

  it("ignores stale events, conflicts on forked commits, and accepts a newer remote reset", () => {
    const current = createDemoStoreEnvelope(createSeedState("demo_event_session_current_123"), {
      resetGeneration: 2,
      writeSequence: 4,
      commitId: "commit-current",
    });
    const stale: DemoStoreEnvelope = { ...current, lineage: { ...current.lineage, writeSequence: 3, commitId: "commit-stale" } };
    const fork: DemoStoreEnvelope = { ...current, lineage: { ...current.lineage, commitId: "commit-fork" } };
    const resetState = createSeedState("demo_event_session_reset_12345");
    const reset = createDemoStoreEnvelope(resetState, { resetGeneration: 3, writeSequence: 5, commitId: "commit-reset", kind: "reset" });

    expect(classifyDemoStorageEvent(current, stale)).toBe("ignore");
    expect(classifyDemoStorageEvent(current, fork)).toBe("conflict");
    expect(classifyDemoStorageEvent(current, reset)).toBe("remote_reset");
  });

  it("loads a raw valid v10 state as a generation-zero compatibility envelope", () => {
    const raw = createSeedState("demo_raw_v10_session_123456");

    const loaded = deserializeDemoStoreEnvelope(JSON.stringify(raw));

    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.envelope).toMatchObject({
      envelopeVersion: 1,
      lineage: { demoSessionId: raw.demoSessionId, resetGeneration: 0, writeSequence: 0 },
      state: raw,
    });
  });
});
