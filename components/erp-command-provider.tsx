"use client";

import { createContext, useContext, useMemo } from "react";
import { createErpCommandExecutor, type ErpCommandExecutor } from "@/lib/erp/command-intents";
import type { ErpCommandResult, ErpErrorCode } from "@/lib/erp/errors";
import type { ErpState } from "@/lib/erp/types";

type AsyncCommand<Command> = Command extends (...args: infer Args) => infer Result
  ? (...args: Args) => Promise<Result>
  : never;

export type AsyncErpCommandExecutor = {
  [Name in keyof ErpCommandExecutor]: AsyncCommand<ErpCommandExecutor[Name]>;
};

export type ErpProviderCommitResult =
  | { ok: true }
  | {
    ok: false;
    reason: "LOCK_UNAVAILABLE" | "STALE_STATE" | "INVALID_STATE" | "INVALID_PERSISTED_STATE";
    state: ErpState;
  };

export type CommitErpAfterCas = (
  expectedRevision: number,
  erp: ErpState,
) => Promise<ErpProviderCommitResult>;

const ErpCommandContext = createContext<AsyncErpCommandExecutor | null>(null);

interface ErpCommandProviderProps {
  children?: React.ReactNode;
  getLatestErp: () => ErpState;
  commitErp: CommitErpAfterCas;
}

type CommitFailure = Exclude<ErpProviderCommitResult, { ok: true }>;

function commitFailureCode(reason: CommitFailure["reason"]): ErpErrorCode {
  if (reason === "LOCK_UNAVAILABLE") return "LOCK_UNAVAILABLE";
  if (reason === "STALE_STATE") return "STALE_STATE";
  return "INVALID_STATE";
}

function commitFailureMessage(reason: CommitFailure["reason"]): string {
  switch (reason) {
    case "LOCK_UNAVAILABLE": return "Browser persistence lock is unavailable; no changes were saved.";
    case "STALE_STATE": return "ERP state changed before the command could be committed.";
    case "INVALID_STATE": return "ERP state failed persistence validation; no changes were saved.";
    case "INVALID_PERSISTED_STATE": return "Persisted demo state is invalid. Reset Demo Data before continuing.";
  }
}

function createAsyncErpCommandExecutor(
  getLatestErp: () => ErpState,
  commitErp: CommitErpAfterCas,
): AsyncErpCommandExecutor {
  const template = createErpCommandExecutor(getLatestErp, () => false);
  const entries = (Object.keys(template) as Array<keyof ErpCommandExecutor>).map((name) => {
    const invoke = async (...args: unknown[]): Promise<ErpCommandResult<unknown>> => {
      const captured: { value: { expectedRevision: number; state: ErpState } | null } = { value: null };
      const executor = createErpCommandExecutor(getLatestErp, (expectedRevision, state) => {
        captured.value = { expectedRevision, state };
        return true;
      });
      const result = (executor[name] as (...commandArgs: unknown[]) => ErpCommandResult<unknown>)(...args);
      if (!result.ok) return result;
      const pending = captured.value;
      if (!pending) {
        return { ok: false, state: getLatestErp(), error: { code: "INVALID_STATE", message: "Validated command did not produce a committable ERP state." } };
      }
      const commit = await commitErp(pending.expectedRevision, pending.state);
      if (commit.ok) return result;
      return {
        ok: false,
        state: commit.state,
        error: { code: commitFailureCode(commit.reason), message: commitFailureMessage(commit.reason) },
      };
    };
    return [name, invoke] as const;
  });
  return Object.fromEntries(entries) as AsyncErpCommandExecutor;
}

export function ErpCommandProvider({ children, getLatestErp, commitErp }: ErpCommandProviderProps) {
  const value = useMemo(() => createAsyncErpCommandExecutor(getLatestErp, commitErp), [commitErp, getLatestErp]);
  return <ErpCommandContext.Provider value={value}>{children}</ErpCommandContext.Provider>;
}

export function useErpCommands(): AsyncErpCommandExecutor {
  const value = useContext(ErpCommandContext);
  if (!value) throw new Error("useErpCommands must be used inside ErpCommandProvider.");
  return value;
}
