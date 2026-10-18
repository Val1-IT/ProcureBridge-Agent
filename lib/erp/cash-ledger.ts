import { isoDate } from "../dealtwin/domain/date";
import { parseRupiah, rupiah } from "../dealtwin/domain/money";
import type { Result } from "../dealtwin/domain/result";
import type { ErpCashAccount, ErpCashMovement, ErpState } from "./types";

function failure<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}
function canonicalRevision(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}
function chronology(movement: Pick<ErpCashMovement, "effectiveDate" | "sameDayOrder" | "id">): string {
  return `${movement.effectiveDate}:${String(movement.sameDayOrder).padStart(16, "0")}:${movement.id}`;
}

export interface InspectedCashLedger {
  readonly account: ErpCashAccount;
  readonly openingBalanceRupiah: ReturnType<typeof rupiah>;
  readonly movements: readonly ErpCashMovement[];
}

export function inspectCashLedger(state: ErpState): Result<InspectedCashLedger> {
  const activeIdr = (state.cashAccounts ?? []).filter((account) => account.active && account.currency === "IDR");
  if (activeIdr.length === 0) return failure("CASH_NOT_CONFIGURED", "An active IDR cash account is required.");
  if (activeIdr.length !== 1) return failure("INVALID_CASH_EVIDENCE", "Cash ledger must have exactly one active IDR account.");
  const account = activeIdr[0];
  let opening;
  try { opening = parseRupiah(account.openingBalanceRupiah); } catch { return failure("INVALID_CASH_EVIDENCE", "Opening cash amount is invalid."); }
  if (opening < 0n || !canonicalRevision(account.openingSourceRevision)) return failure("INVALID_CASH_EVIDENCE", "Opening cash evidence is invalid.");
  try { isoDate(account.openingBalanceDate); } catch { return failure("INVALID_CASH_EVIDENCE", "Opening cash date is invalid."); }

  const movements = [...(state.cashMovements ?? [])];
  const ids = movements.map((row) => row.id);
  const sourceKeys = movements.map((row) => `${row.sourceType}:${row.sourceId}`);
  if (new Set(ids).size !== ids.length || new Set(sourceKeys).size !== sourceKeys.length) {
    return failure("DUPLICATE_FINANCIAL_SOURCE", "Cash movement identities and source provenance must be unique.");
  }

  const originals = new Map(movements.filter((row) => row.entryKind === "original").map((row) => [row.id, row]));
  const reversed = new Set<string>();
  const ordered = [...movements].sort((left, right) => chronology(left).localeCompare(chronology(right)));
  for (const movement of ordered) {
    let amount;
    try { amount = parseRupiah(movement.amountRupiah); } catch { return failure("INVALID_CASH_EVIDENCE", "Cash movement amount is invalid."); }
    try { isoDate(movement.effectiveDate); } catch { return failure("INVALID_CASH_EVIDENCE", "Cash movement date is invalid."); }
    if (movement.accountId !== account.id || amount <= 0n || !Number.isSafeInteger(movement.sameDayOrder) || movement.sameDayOrder <= 0
      || !canonicalRevision(movement.sourceRevision) || (movement.direction !== "inflow" && movement.direction !== "outflow")
      || (movement.entryKind !== "original" && movement.entryKind !== "reversal")) {
      return failure("INVALID_CASH_EVIDENCE", "Cash movement evidence is invalid.");
    }
    if (movement.effectiveDate < account.openingBalanceDate
      || (movement.effectiveDate === account.openingBalanceDate && movement.sameDayOrder <= 0)) {
      return failure("INVALID_CASH_EVIDENCE", "Cash movement conflicts with the opening anchor.");
    }
    if (movement.entryKind === "original") {
      if (movement.reversesMovementId !== null || movement.sourceType === "cash_movement_reversal") {
        return failure("INVALID_CASH_EVIDENCE", "Original cash movement evidence is invalid.");
      }
    } else {
      const original = movement.reversesMovementId ? originals.get(movement.reversesMovementId) : undefined;
      if (!original || reversed.has(original.id) || original.entryKind !== "original"
        || movement.sourceType !== "cash_movement_reversal" || movement.sourceId !== original.id
        || movement.accountId !== original.accountId || movement.amountRupiah !== original.amountRupiah
        || movement.direction === original.direction || chronology(movement) <= chronology(original)) {
        return failure("INVALID_CASH_EVIDENCE", "Cash reversal evidence is invalid.");
      }
      reversed.add(original.id);
    }
  }
  return { ok: true, value: { account, openingBalanceRupiah: rupiah(opening), movements: ordered } };
}
