"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { ErpCommandResult } from "@/lib/erp/errors";
import type { ErpState } from "@/lib/erp/types";

export type ErpCommand<T> = (state: ErpState) => ErpCommandResult<T>;

interface ErpCommandContextValue {
  run: <T,>(command: ErpCommand<T>) => ErpCommandResult<T>;
}

const ErpCommandContext = createContext<ErpCommandContextValue | null>(null);

interface ErpCommandProviderProps {
  children: React.ReactNode;
  getLatestErp: () => ErpState;
  commitErp: (expectedRevision: number, erp: ErpState) => boolean;
}

export function ErpCommandProvider({ children, getLatestErp, commitErp }: ErpCommandProviderProps) {
  const run = useCallback(<T,>(command: ErpCommand<T>): ErpCommandResult<T> => {
    const before = getLatestErp();
    const result = command(before);
    if (!result.ok) return result;
    if (result.state.revision !== before.revision + 1) {
      return {
        ok: false,
        state: before,
        error: { code: "INVALID_STATE", message: "Successful ERP commands must advance the revision exactly once." },
      };
    }
    if (!commitErp(before.revision, result.state)) {
      return {
        ok: false,
        state: getLatestErp(),
        error: { code: "STALE_STATE", message: "ERP state changed before the command could be committed." },
      };
    }
    return result;
  }, [commitErp, getLatestErp]);
  const value = useMemo(() => ({ run }), [run]);
  return <ErpCommandContext.Provider value={value}>{children}</ErpCommandContext.Provider>;
}

export function useErpCommands(): ErpCommandContextValue {
  const value = useContext(ErpCommandContext);
  if (!value) throw new Error("useErpCommands must be used inside ErpCommandProvider.");
  return value;
}
