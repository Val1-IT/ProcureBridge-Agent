"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { demoReducer, type DemoAction } from "@/lib/demo/reducer";
import { createSeedState } from "@/lib/demo/seed";
import { DEMO_STORAGE_KEY, deserializeDemoState, loadDemoStateFromStorage, serializeDemoState } from "@/lib/demo/persistence";
import type { DemoState } from "@/lib/domain/types";

interface DemoStoreValue {
  state: DemoState;
  dispatch: React.Dispatch<DemoAction>;
  hydrated: boolean;
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, undefined, createSeedState);
  const [hydrated, setHydrated] = useState(false);

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

  const value = useMemo(() => ({ state, dispatch, hydrated }), [state, hydrated]);
  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>;
}

export function useDemoStore(): DemoStoreValue {
  const value = useContext(DemoStoreContext);
  if (!value) throw new Error("useDemoStore must be used inside DemoStoreProvider.");
  return value;
}
