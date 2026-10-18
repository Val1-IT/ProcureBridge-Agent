import type { Rupiah } from "./money";
import type { Result } from "./result";

export interface CompilerPolicy {
  readonly minimumCashRupiah: Rupiah;
  readonly newBorrowingAllowed: false;
  readonly defaultHorizonDays: number;
}

export function createCompilerPolicy(input: CompilerPolicy): Result<CompilerPolicy> {
  if (typeof input.minimumCashRupiah !== "bigint" || input.minimumCashRupiah < 0n
    || input.newBorrowingAllowed !== false
    || !Number.isSafeInteger(input.defaultHorizonDays) || input.defaultHorizonDays <= 0) {
    return { ok: false, error: { code: "INVALID_CONSTRAINT", message: "Compiler policy is invalid." } };
  }
  return { ok: true, value: { ...input } };
}
