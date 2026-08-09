"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { demoReducer, type DemoAction } from "@/lib/demo/reducer";
import { createSeedState } from "@/lib/demo/seed";
import { DEMO_STORAGE_KEY, loadDemoState, loadDemoStateFromStorage, serializeDemoState, type DemoRecoveryReason } from "@/lib/demo/persistence";
import type { DemoState } from "@/lib/domain/types";
import type { ErpState } from "@/lib/erp/types";
import { ErpCommandProvider } from "./erp-command-provider";

interface DemoStoreValue {
  state: DemoState;
  dispatch: React.Dispatch<DemoAction>;
  hydrated: boolean;
  recoveryReason: DemoRecoveryReason;
  dismissRecovery: () => void;
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(createSeedState);
  const latestStateRef = useRef(state);
  const [hydrated, setHydrated] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState<DemoRecoveryReason>(null);
  latestStateRef.current = state;

  const dispatchLegacy = useCallback((action: DemoAction) => {
    const next = demoReducer(latestStateRef.current, action);
    latestStateRef.current = next;
    setState(next);
  }, []);
  const dispatch = useCallback((action: DemoAction) => dispatchLegacy(action), [dispatchLegacy]);
  const getLatestErp = useCallback(() => latestStateRef.current.erp, []);
  const commitErp = useCallback((expectedRevision: number, erp: ErpState): boolean => {
    const current = latestStateRef.current;
    if (current.erp.revision !== expectedRevision || erp.revision !== expectedRevision + 1) return false;
    const next = { ...current, erp, updatedAt: new Date().toISOString() };
    latestStateRef.current = next;
    setState(next);
    return true;
  }, []);

  useEffect(() => {
    const loaded = loadDemoStateFromStorage(window.localStorage);
    dispatch({ type: "HYDRATE", state: loaded.state });
    setRecoveryReason(loaded.recoveryReason);
    setHydrated(true);
  }, [dispatch]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DEMO_STORAGE_KEY, serializeDemoState(state));
  }, [hydrated, state]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === DEMO_STORAGE_KEY && event.newValue) {
        const loaded = loadDemoState(event.newValue);
        dispatch({ type: "HYDRATE", state: loaded.state });
        setRecoveryReason(loaded.recoveryReason);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [dispatch]);

  const dismissRecovery = useCallback(() => setRecoveryReason(null), []);
  const value = useMemo(() => ({ state, dispatch, hydrated, recoveryReason, dismissRecovery }), [state, dispatch, hydrated, recoveryReason, dismissRecovery]);
  return <DemoStoreContext.Provider value={value}><ErpCommandProvider getLatestErp={getLatestErp} commitErp={commitErp}>{children}</ErpCommandProvider></DemoStoreContext.Provider>;
}

export function useDemoStore(): DemoStoreValue {
  const value = useContext(DemoStoreContext);
  if (!value) throw new Error("useDemoStore must be used inside DemoStoreProvider.");
  return value;
}
