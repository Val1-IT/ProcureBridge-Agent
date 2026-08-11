"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { demoReducer, type DemoAction } from "@/lib/demo/reducer";
import { createSeedState } from "@/lib/demo/seed";
import {
  DEMO_STORAGE_KEY,
  loadDemoStateFromStorage,
  type DemoRecoveryReason,
} from "@/lib/demo/persistence";
import {
  createDemoStoreEnvelope,
  DemoPersistenceCoordinator,
  deserializeDemoStoreEnvelope,
  type DemoStoreCommitKind,
  type DemoStoreCommitResult,
  type DemoStoreEnvelope,
  type DemoStoreLockManager,
} from "@/lib/demo/persistence-coordinator";
import {
  createFreshRecoveryEnvelope,
  handleValidatedDemoStorageEvent,
  runDemoResetLifecycle,
} from "@/lib/demo/provider-lifecycle";
import type { DemoState } from "@/lib/domain/types";
import type { ErpState } from "@/lib/erp/types";
import { ErpCommandProvider, type ErpProviderCommitResult } from "./erp-command-provider";
import { JUDGE_SESSION_KEY, JudgeDemoProvider } from "./judge-demo-provider";

type PublicDemoAction = Exclude<DemoAction, { type: "RESET" }>;
type PersistedCommitKind = Exclude<DemoStoreCommitKind, "legacy">;

interface DemoStoreValue {
  state: DemoState;
  dispatch: (action: PublicDemoAction) => void;
  hydrated: boolean;
  recoveryReason: DemoRecoveryReason;
  dismissRecovery: () => void;
  persistenceConflict: string | null;
  dismissPersistenceConflict: () => void;
}

export interface DemoStorePrivateAuthority {
  state: DemoState;
  envelope: DemoStoreEnvelope;
  hydrated: boolean;
  dispatch: (action: PublicDemoAction) => Promise<boolean>;
  replaceState: (state: DemoState, kind: "guide_start" | "guide_restart" | "guide_exit") => Promise<boolean>;
  reset: () => Promise<boolean>;
  reportConflict: (message: string) => void;
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

function browserLocks(): DemoStoreLockManager | null {
  if (typeof navigator === "undefined") return null;
  const candidate = navigator as Navigator & { locks?: DemoStoreLockManager };
  return candidate.locks ?? null;
}

function createCommitId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `commit-${uuid}` : `commit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function conflictCopy(reason: Exclude<DemoStoreCommitResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "LOCK_UNAVAILABLE": return "Safe browser locking is unavailable. No changes were saved.";
    case "STALE_STATE": return "Another tab changed Demo Data first. This view was refreshed without overwriting it.";
    case "INVALID_STATE": return "The proposed Demo Data failed validation and was not saved.";
    case "INVALID_PERSISTED_STATE": return "Persisted Demo Data is invalid. Use Reset Demo Data to recover safely.";
  }
}

function loadInitialEnvelope(storage: Storage): { envelope: DemoStoreEnvelope; recoveryReason: DemoRecoveryReason } {
  const current = deserializeDemoStoreEnvelope(storage.getItem(DEMO_STORAGE_KEY));
  if (current.envelope) return { envelope: current.envelope, recoveryReason: current.recoveryReason };
  if (current.recoveryReason) return { envelope: createFreshRecoveryEnvelope(), recoveryReason: current.recoveryReason };
  const legacy = loadDemoStateFromStorage(storage);
  return { envelope: createDemoStoreEnvelope(legacy.state), recoveryReason: legacy.recoveryReason };
}

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [envelope, setEnvelope] = useState(() => createDemoStoreEnvelope(createSeedState()));
  const latestEnvelopeRef = useRef(envelope);
  const coordinatorRef = useRef<DemoPersistenceCoordinator | null>(null);
  const hydratedRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [hydrated, setHydrated] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState<DemoRecoveryReason>(null);
  const [persistenceConflict, setPersistenceConflict] = useState<string | null>(null);
  latestEnvelopeRef.current = envelope;

  const commitState = useCallback(async (nextState: DemoState, kind: PersistedCommitKind): Promise<DemoStoreCommitResult> => {
    const current = latestEnvelopeRef.current;
    const coordinator = coordinatorRef.current;
    if (!hydratedRef.current || !coordinator) {
      const unavailable = { ok: false as const, reason: "LOCK_UNAVAILABLE" as const, current };
      setPersistenceConflict(conflictCopy(unavailable.reason));
      return unavailable;
    }
    const result = await coordinator.commit(current.lineage, nextState, kind);
    if (result.ok) {
      latestEnvelopeRef.current = result.envelope;
      setEnvelope(result.envelope);
      setRecoveryReason(null);
      setPersistenceConflict(null);
      return result;
    }
    if (result.reason === "STALE_STATE") {
      latestEnvelopeRef.current = result.current;
      setEnvelope(result.current);
    }
    setPersistenceConflict(conflictCopy(result.reason));
    return result;
  }, []);

  const enqueueAction = useCallback((action: PublicDemoAction): Promise<boolean> => {
    const operation = queueRef.current.then(async () => {
      const current = latestEnvelopeRef.current;
      const next = demoReducer(current.state, action);
      if (next === current.state) return true;
      return (await commitState(next, "mutation")).ok;
    });
    queueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [commitState]);

  const dispatch = useCallback((action: PublicDemoAction) => {
    void enqueueAction(action);
  }, [enqueueAction]);

  const getLatestErp = useCallback(() => latestEnvelopeRef.current.state.erp, []);
  const commitErp = useCallback(async (expectedRevision: number, erp: ErpState): Promise<ErpProviderCommitResult> => {
    const current = latestEnvelopeRef.current;
    if (current.state.erp.revision !== expectedRevision || erp.revision !== expectedRevision + 1) {
      return { ok: false, reason: "STALE_STATE", state: current.state.erp };
    }
    const next = { ...current.state, erp, updatedAt: new Date().toISOString() };
    const result = await commitState(next, "mutation");
    return result.ok ? { ok: true } : { ok: false, reason: result.reason, state: result.current.state.erp };
  }, [commitState]);

  const replaceState = useCallback(async (state: DemoState, kind: "guide_start" | "guide_restart" | "guide_exit") => {
    return (await commitState(state, kind)).ok;
  }, [commitState]);

  const reset = useCallback(async (): Promise<boolean> => {
    const current = latestEnvelopeRef.current;
    const coordinator = coordinatorRef.current;
    if (!hydratedRef.current || !coordinator) {
      setPersistenceConflict("Safe browser locking is unavailable. Reset was not applied.");
      return false;
    }
    const result = await runDemoResetLifecycle({
      current,
      invalidateServer: async (demoSessionId) => {
        const response = await fetch("/api/supplier-calls/session", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ demoSessionId }),
        });
        if (response.status === 204) return { ok: true };
        return { ok: false, reason: response.status === 409 ? "SUPPLIER_CALL_RESET_BUSY" : "SERVER_RESET_FAILED" };
      },
      reset: (expected, invalidateServer) => coordinator.reset(expected, invalidateServer),
    });
    if (result.ok) {
      latestEnvelopeRef.current = result.envelope;
      setEnvelope(result.envelope);
      setRecoveryReason(null);
      setPersistenceConflict(null);
      if (result.source === "remote_reset") window.sessionStorage.removeItem(JUDGE_SESSION_KEY);
      return true;
    }
    setPersistenceConflict(result.reason === "SUPPLIER_CALL_RESET_BUSY"
      ? "Supplier call claim is busy. Reset was not applied; retry after the active claim finishes."
      : result.reason === "LOCK_UNAVAILABLE"
        ? "Safe browser locking is unavailable. Reset was not applied."
        : result.reason === "STALE_STATE"
          ? "Another tab changed Demo Data during reset. No state was overwritten."
          : "Server or browser persistence reset failed. Local Demo Data was left unchanged.");
    return false;
  }, []);

  useEffect(() => {
    const loaded = loadInitialEnvelope(window.localStorage);
    const locks = browserLocks();
    const coordinator = new DemoPersistenceCoordinator(window.localStorage, locks, loaded.envelope, createCommitId);
    coordinatorRef.current = coordinator;
    latestEnvelopeRef.current = loaded.envelope;
    setEnvelope(loaded.envelope);
    setRecoveryReason(loaded.recoveryReason);
    hydratedRef.current = true;
    setHydrated(true);

    const sync = (event: StorageEvent) => {
      if (event.key !== DEMO_STORAGE_KEY || !event.newValue) return;
      const incoming = deserializeDemoStoreEnvelope(event.newValue);
      if (!incoming.envelope) {
        setRecoveryReason(incoming.recoveryReason ?? "INVALID_SCHEMA");
        setPersistenceConflict("Another tab wrote invalid Demo Data. This tab kept its last validated state.");
        return;
      }
      handleValidatedDemoStorageEvent(latestEnvelopeRef.current, incoming.envelope, {
        accept: (accepted) => {
          latestEnvelopeRef.current = accepted;
          setEnvelope(accepted);
          setRecoveryReason(null);
          setPersistenceConflict(null);
        },
        conflict: () => setPersistenceConflict("Conflicting Demo Data history was detected in another tab. No state was overwritten."),
        clearJudgeSession: () => window.sessionStorage.removeItem(JUDGE_SESSION_KEY),
      });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const dismissRecovery = useCallback(() => setRecoveryReason(null), []);
  const dismissPersistenceConflict = useCallback(() => setPersistenceConflict(null), []);
  const reportConflict = useCallback((message: string) => setPersistenceConflict(message), []);
  const value = useMemo(() => ({ state: envelope.state, dispatch, hydrated, recoveryReason, dismissRecovery, persistenceConflict, dismissPersistenceConflict }), [envelope.state, dispatch, hydrated, recoveryReason, dismissRecovery, persistenceConflict, dismissPersistenceConflict]);
  const authority = useMemo<DemoStorePrivateAuthority>(() => ({ state: envelope.state, envelope, hydrated, dispatch: enqueueAction, replaceState, reset, reportConflict }), [envelope, hydrated, enqueueAction, replaceState, reset, reportConflict]);

  return <DemoStoreContext.Provider value={value}>
    <ErpCommandProvider getLatestErp={getLatestErp} commitErp={commitErp}>
      <JudgeDemoProvider authority={authority}>{children}</JudgeDemoProvider>
    </ErpCommandProvider>
  </DemoStoreContext.Provider>;
}

export function useDemoStore(): DemoStoreValue {
  const value = useContext(DemoStoreContext);
  if (!value) throw new Error("useDemoStore must be used inside DemoStoreProvider.");
  return value;
}
