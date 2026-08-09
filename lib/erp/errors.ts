import type { ErpState } from "./types";

export type ErpErrorCode = "FORBIDDEN" | "INVALID_INPUT" | "INVALID_STATE" | "INSUFFICIENT_STOCK" | "STALE_STATE" | "NOT_FOUND";

export interface ErpError {
  code: ErpErrorCode;
  message: string;
  details?: Record<string, string | number>;
}

export type ErpCommandResult<T> =
  | { ok: true; state: ErpState; value: T }
  | { ok: false; state: ErpState; error: ErpError };
