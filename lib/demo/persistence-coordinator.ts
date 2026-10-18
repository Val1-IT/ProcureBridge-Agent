import type { DemoState } from "../domain/types";
import {
  DEMO_STORAGE_KEY,
  isValidDemoState,
  migrateDemoState,
  type DemoRecoveryReason,
} from "./persistence";
import { isValidDemoSessionId } from "./session";
import { demoReducer } from "./reducer";

export type DemoStoreCommitKind =
  | "mutation"
  | "reset"
  | "guide_start"
  | "guide_restart"
  | "guide_exit"
  | "legacy";

export interface DemoStoreLineage {
  demoSessionId: string;
  resetGeneration: number;
  writeSequence: number;
  commitId: string;
}

export interface DemoStoreEnvelope {
  envelopeVersion: 1;
  kind: DemoStoreCommitKind;
  lineage: DemoStoreLineage;
  state: DemoState;
}

export interface DemoStoreLockManager {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => T | Promise<T>): Promise<T>;
}

export interface DemoStoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type DemoStoreCommitResult =
  | { ok: true; envelope: DemoStoreEnvelope }
  | { ok: false; reason: "LOCK_UNAVAILABLE" | "STALE_STATE" | "INVALID_STATE" | "INVALID_PERSISTED_STATE"; current: DemoStoreEnvelope };

export type DemoServerResetResult =
  | { ok: true }
  | { ok: false; reason: string };

export type DemoStoreResetResult =
  | { ok: true; envelope: DemoStoreEnvelope; source: "local_reset" | "remote_reset" }
  | { ok: false; reason: string; current: DemoStoreEnvelope };

const commitKinds: readonly DemoStoreCommitKind[] = ["mutation", "reset", "guide_start", "guide_restart", "guide_exit", "legacy"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isValidLineage(value: unknown): value is DemoStoreLineage {
  return isRecord(value)
    && isValidDemoSessionId(value.demoSessionId)
    && isSafeCounter(value.resetGeneration)
    && isSafeCounter(value.writeSequence)
    && typeof value.commitId === "string"
    && value.commitId.trim().length > 0
    && value.commitId.length <= 200;
}

function sameLineage(left: DemoStoreLineage, right: DemoStoreLineage): boolean {
  return left.demoSessionId === right.demoSessionId
    && left.resetGeneration === right.resetGeneration
    && left.writeSequence === right.writeSequence
    && left.commitId === right.commitId;
}

function isValidEnvelope(value: unknown): value is DemoStoreEnvelope {
  if (!isRecord(value) || value.envelopeVersion !== 1 || !commitKinds.includes(value.kind as DemoStoreCommitKind)) return false;
  if (!isValidLineage(value.lineage) || !isValidDemoState(value.state)) return false;
  return value.lineage.demoSessionId === value.state.demoSessionId;
}

export function createDemoStoreEnvelope(
  state: DemoState,
  options: Partial<Omit<DemoStoreLineage, "demoSessionId">> & { kind?: DemoStoreCommitKind } = {},
): DemoStoreEnvelope {
  if (!isValidDemoState(state)) throw new Error("Cannot create a persistence envelope from invalid demo state.");
  const lineage: DemoStoreLineage = {
    demoSessionId: state.demoSessionId,
    resetGeneration: options.resetGeneration ?? 0,
    writeSequence: options.writeSequence ?? 0,
    commitId: options.commitId ?? `compat-${state.demoSessionId}-${state.erp.revision}`,
  };
  if (!isValidLineage(lineage)) throw new Error("Cannot create a persistence envelope with invalid lineage.");
  return { envelopeVersion: 1, kind: options.kind ?? "legacy", lineage, state };
}

export function serializeDemoStoreEnvelope(envelope: DemoStoreEnvelope): string {
  if (!isValidEnvelope(envelope)) throw new Error("Cannot serialize an invalid demo-store envelope.");
  return JSON.stringify(envelope);
}

export function deserializeDemoStoreEnvelope(value: string | null): {
  envelope: DemoStoreEnvelope | null;
  recoveryReason: DemoRecoveryReason;
} {
  if (!value) return { envelope: null, recoveryReason: null };
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed) && Object.hasOwn(parsed, "envelopeVersion")) {
      if (isValidEnvelope(parsed)) return { envelope: parsed, recoveryReason: null };
      if (parsed.envelopeVersion === 1 && commitKinds.includes(parsed.kind as DemoStoreCommitKind) && isValidLineage(parsed.lineage)) {
        const migrated = migrateDemoState(parsed.state);
        if (migrated && migrated.demoSessionId === parsed.lineage.demoSessionId) {
          return { envelope: { envelopeVersion: 1, kind: parsed.kind as DemoStoreCommitKind, lineage: parsed.lineage, state: migrated }, recoveryReason: null };
        }
      }
      return { envelope: null, recoveryReason: "INVALID_SCHEMA" };
    }
    const migrated = migrateDemoState(parsed);
    return migrated
      ? { envelope: createDemoStoreEnvelope(migrated), recoveryReason: null }
      : { envelope: null, recoveryReason: "INVALID_SCHEMA" };
  } catch {
    return { envelope: null, recoveryReason: "INVALID_JSON" };
  }
}

export function classifyDemoStorageEvent(
  current: DemoStoreEnvelope,
  incoming: DemoStoreEnvelope,
): "ignore" | "conflict" | "apply" | "remote_reset" {
  const currentLineage = current.lineage;
  const incomingLineage = incoming.lineage;
  if (incomingLineage.resetGeneration < currentLineage.resetGeneration) return "ignore";
  if (incomingLineage.resetGeneration > currentLineage.resetGeneration) return "remote_reset";
  if (incomingLineage.demoSessionId !== currentLineage.demoSessionId) return "conflict";
  if (incomingLineage.writeSequence < currentLineage.writeSequence) return "ignore";
  if (incomingLineage.writeSequence === currentLineage.writeSequence) {
    return incomingLineage.commitId === currentLineage.commitId ? "ignore" : "conflict";
  }
  return "apply";
}

export class DemoPersistenceCoordinator {
  constructor(
    private readonly storage: DemoStoreStorage,
    private readonly locks: DemoStoreLockManager | null,
    private readonly initial: DemoStoreEnvelope,
    private readonly createCommitId: () => string,
  ) {}

  async commit(
    expected: DemoStoreLineage,
    nextState: DemoState,
    kind: Exclude<DemoStoreCommitKind, "legacy">,
  ): Promise<DemoStoreCommitResult> {
    if (!this.locks) return { ok: false, reason: "LOCK_UNAVAILABLE", current: this.initial };
    return this.locks.request(DEMO_STORAGE_KEY, { mode: "exclusive" }, async (): Promise<DemoStoreCommitResult> => {
      const loaded = deserializeDemoStoreEnvelope(this.storage.getItem(DEMO_STORAGE_KEY));
      const recoveringReset = Boolean(loaded.recoveryReason) && kind === "reset";
      if (loaded.recoveryReason && !recoveringReset) return { ok: false, reason: "INVALID_PERSISTED_STATE", current: this.initial };
      const current = loaded.envelope ?? this.initial;
      if (!isValidLineage(expected)) return { ok: false, reason: "INVALID_STATE", current };
      if (!recoveringReset && !sameLineage(current.lineage, expected)) return { ok: false, reason: "STALE_STATE", current };
      if (!isValidDemoState(nextState)) return { ok: false, reason: "INVALID_STATE", current };
      const baseLineage = recoveringReset ? expected : current.lineage;
      if (baseLineage.writeSequence >= Number.MAX_SAFE_INTEGER || baseLineage.resetGeneration >= Number.MAX_SAFE_INTEGER) {
        return { ok: false, reason: "INVALID_STATE", current };
      }
      const reset = kind === "reset";
      if (!reset && nextState.demoSessionId !== baseLineage.demoSessionId) {
        return { ok: false, reason: "INVALID_STATE", current };
      }
      const envelope = createDemoStoreEnvelope(nextState, {
        kind,
        resetGeneration: baseLineage.resetGeneration + (reset ? 1 : 0),
        writeSequence: baseLineage.writeSequence + 1,
        commitId: this.createCommitId(),
      });
      this.storage.setItem(DEMO_STORAGE_KEY, serializeDemoStoreEnvelope(envelope));
      return { ok: true, envelope };
    }).catch(() => ({ ok: false as const, reason: "LOCK_UNAVAILABLE" as const, current: this.initial }));
  }

  async reset(
    expected: DemoStoreEnvelope,
    invalidateServer: (demoSessionId: string) => Promise<DemoServerResetResult>,
  ): Promise<DemoStoreResetResult> {
    const trusted = isValidEnvelope(expected) ? expected : this.initial;
    if (!this.locks) return { ok: false, reason: "LOCK_UNAVAILABLE", current: trusted };

    return this.locks.request(DEMO_STORAGE_KEY, { mode: "exclusive" }, async (): Promise<DemoStoreResetResult> => {
      if (!isValidEnvelope(expected)) return { ok: false, reason: "INVALID_STATE", current: trusted };

      const loaded = deserializeDemoStoreEnvelope(this.storage.getItem(DEMO_STORAGE_KEY));
      const recoveringReset = Boolean(loaded.recoveryReason);
      const persisted = loaded.envelope ?? this.initial;
      let base = expected;

      if (!recoveringReset && !sameLineage(persisted.lineage, expected.lineage)) {
        const classification = classifyDemoStorageEvent(expected, persisted);
        if (classification === "remote_reset") {
          return { ok: true, envelope: persisted, source: "remote_reset" };
        }
        if (classification !== "apply") {
          return { ok: false, reason: "STALE_STATE", current: persisted };
        }
        base = persisted;
      } else if (!recoveringReset) {
        base = persisted;
      }

      if (base.lineage.writeSequence >= Number.MAX_SAFE_INTEGER || base.lineage.resetGeneration >= Number.MAX_SAFE_INTEGER) {
        return { ok: false, reason: "INVALID_STATE", current: base };
      }

      const nextState = demoReducer(base.state, { type: "RESET" });
      const envelope = createDemoStoreEnvelope(nextState, {
        kind: "reset",
        resetGeneration: base.lineage.resetGeneration + 1,
        writeSequence: base.lineage.writeSequence + 1,
        commitId: this.createCommitId(),
      });
      const serialized = serializeDemoStoreEnvelope(envelope);

      let invalidation: DemoServerResetResult;
      try {
        invalidation = await invalidateServer(base.state.demoSessionId);
      } catch {
        return { ok: false, reason: "SERVER_RESET_FAILED", current: base };
      }
      if (!invalidation.ok) return { ok: false, reason: invalidation.reason, current: base };

      this.storage.setItem(DEMO_STORAGE_KEY, serialized);
      return { ok: true, envelope, source: "local_reset" };
    }).catch(() => ({ ok: false as const, reason: "LOCK_UNAVAILABLE" as const, current: trusted }));
  }
}
