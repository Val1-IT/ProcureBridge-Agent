"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { demoReducer, type DemoAction } from "@/lib/demo/reducer";
import { createSeedState } from "@/lib/demo/seed";
import { DEMO_STORAGE_KEY, deserializeDemoState, loadDemoStateFromStorage, serializeDemoState } from "@/lib/demo/persistence";
import type { DemoState } from "@/lib/domain/types";
import type { ErpState } from "@/lib/erp/types";
import { ErpCommandProvider } from "./erp-command-provider";

interface DemoStoreValue {
  state: DemoState;
  dispatch: React.Dispatch<DemoAction>;
  hydrated: boolean;
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, reactDispatch] = useReducer(demoReducer, undefined, createSeedState);
  const latestStateRef = useRef(state);
  const [hydrated, setHydrated] = useState(false);
  latestStateRef.current = state;

  const dispatchInternal = useCallback((action: Parameters<typeof demoReducer>[1]) => {
    latestStateRef.current = demoReducer(latestStateRef.current, action);
    reactDispatch(action);
  }, []);
  const dispatch = useCallback((action: DemoAction) => dispatchInternal(action), [dispatchInternal]);
  const getLatestErp = useCallback(() => latestStateRef.current.erp, []);
  const commitErp = useCallback((expectedRevision: number, erp: ErpState) => {
    dispatchInternal({ type: "ERP_COMMIT", expectedRevision, erp });
  }, [dispatchInternal]);

  useEffect(() => {
    dispatch({ type: "HYDRATE", state: loadDemoStateFromStorage(window.localStorage).state });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DEMO_STORAGE_KEY, serializeDemoState(state));
  }, [hydrated, state]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === DEMO_STORAGE_KEY && event.newValue) {
        dispatch({ type: "HYDRATE", state: deserializeDemoState(event.newValue) });
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const value = useMemo(() => ({ state, dispatch, hydrated }), [state, dispatch, hydrated]);
  return <DemoStoreContext.Provider value={value}><ErpCommandProvider getLatestErp={getLatestErp} commitErp={commitErp}>{children}</ErpCommandProvider></DemoStoreContext.Provider>;
}

export function useDemoStore(): DemoStoreValue {
  const value = useContext(DemoStoreContext);
  if (!value) throw new Error("useDemoStore must be used inside DemoStoreProvider.");
  return value;
}
