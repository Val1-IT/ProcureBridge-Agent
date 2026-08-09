"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useDemoStore } from "./demo-store-provider";
import type { ErpCommandResult } from "@/lib/erp/errors";
import type { ErpState } from "@/lib/erp/types";

export type ErpCommand<T> = (state: ErpState) => ErpCommandResult<T>;

interface ErpCommandContextValue {
  run: <T,>(command: ErpCommand<T>) => ErpCommandResult<T>;
}

const ErpCommandContext = createContext<ErpCommandContextValue | null>(null);

export function ErpCommandProvider({ children }: { children: React.ReactNode }) {
  const { dispatch, getLatestState } = useDemoStore();
  const run = useCallback(<T,>(command: ErpCommand<T>): ErpCommandResult<T> => {
    const before = getLatestState().erp;
    const result = command(before);
    if (!result.ok) return result;
    if (result.state.revision !== before.revision + 1) {
      return {
        ok: false,
        state: before,
        error: { code: "INVALID_STATE", message: "Successful ERP commands must advance the revision exactly once." },
      };
    }
    dispatch({ type: "ERP_COMMIT", expectedRevision: before.revision, erp: result.state });
    return result;
  }, [dispatch, getLatestState]);
  const value = useMemo(() => ({ run }), [run]);
  return <ErpCommandContext.Provider value={value}>{children}</ErpCommandContext.Provider>;
}

export function useErpCommands(): ErpCommandContextValue {
  const value = useContext(ErpCommandContext);
  if (!value) throw new Error("useErpCommands must be used inside ErpCommandProvider.");
  return value;
}
