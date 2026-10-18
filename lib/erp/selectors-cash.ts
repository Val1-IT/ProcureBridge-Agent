import { isoDate, type IsoDate } from "../dealtwin/domain/date";
import { parseRupiah, rupiah, type Rupiah } from "../dealtwin/domain/money";
import type { Result } from "../dealtwin/domain/result";
import { inspectCashLedger } from "./cash-ledger";
import type { ErpState } from "./types";

function failure(code: string, message: string): Result<Rupiah> { return { ok: false, error: { code, message } }; }

export function selectCurrentCashBalance(state: ErpState, accountId: string, through: IsoDate): Result<Rupiah> {
  try { isoDate(through); } catch { return failure("INVALID_CASH_DATE", "Cash balance date is invalid."); }
  const ledger = inspectCashLedger(state);
  if (!ledger.ok) {
    if (ledger.error.code === "CASH_NOT_CONFIGURED") return failure("CASH_NOT_CONFIGURED", ledger.error.message);
    return failure("INVALID_CASH_EVIDENCE", ledger.error.message);
  }
  if (ledger.value.account.id !== accountId) return failure("CASH_NOT_CONFIGURED", "Active IDR cash account was not found.");
  if (through < ledger.value.account.openingBalanceDate) return failure("INVALID_CASH_DATE", "Cash balance date precedes the opening anchor.");
  let balance = ledger.value.openingBalanceRupiah;
  for (const movement of ledger.value.movements) {
    if (movement.effectiveDate > through) continue;
    const amount = parseRupiah(movement.amountRupiah);
    balance = rupiah(balance + (movement.direction === "inflow" ? amount : -amount));
  }
  return { ok: true, value: balance };
}
