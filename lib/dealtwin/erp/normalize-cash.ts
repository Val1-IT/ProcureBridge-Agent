import { isoDate, type IsoDate } from "../domain/date";
import { parseRupiah, rupiah } from "../domain/money";
import type { Result } from "../domain/result";
import { inspectCashLedger } from "../../erp/cash-ledger";
import type { ErpState } from "../../erp/types";
import { createFinancialSourceReference, type CashPositionEvidence, type SourceDependency } from "./adapter-types";

function failure(code: string, message: string): Result<CashPositionEvidence> { return { ok: false, error: { code, message } }; }

export function normalizeCash(state: ErpState, asOfDate: IsoDate): Result<CashPositionEvidence> {
  try { isoDate(asOfDate); } catch { return failure("INVALID_AS_OF_DATE", "Cash as-of date is invalid."); }
  const ledger = inspectCashLedger(state);
  if (!ledger.ok) {
    if (ledger.error.code === "CASH_NOT_CONFIGURED") return failure("CASH_NOT_CONFIGURED", ledger.error.message);
    if (ledger.error.code === "DUPLICATE_FINANCIAL_SOURCE") return failure("DUPLICATE_FINANCIAL_SOURCE", ledger.error.message);
    return failure("INVALID_FINANCIAL_STATE", ledger.error.message);
  }
  const account = ledger.value.account;
  if (account.openingBalanceDate > asOfDate) return failure("AS_OF_BEFORE_CASH_OPENING", "Cash as-of date precedes the opening anchor.");
  const openingSource = createFinancialSourceReference("cash_account", account.id, account.openingSourceRevision, {
    id: account.id, currency: account.currency, openingBalanceRupiah: account.openingBalanceRupiah, openingBalanceDate: account.openingBalanceDate,
    openingSourceType: account.openingSourceType, openingSourceId: account.openingSourceId, openingSourceRevision: account.openingSourceRevision, active: account.active,
  });
  const dependencies: SourceDependency[] = [openingSource];
  let openingBalance = ledger.value.openingBalanceRupiah;
  const confirmedMovements = [];
  for (const movement of ledger.value.movements) {
    const amount = parseRupiah(movement.amountRupiah);
    const source = createFinancialSourceReference("cash_movement", movement.id, movement.sourceRevision, {
      id: movement.id, accountId: movement.accountId, effectiveDate: movement.effectiveDate, sameDayOrder: movement.sameDayOrder,
      direction: movement.direction, amountRupiah: movement.amountRupiah, entryKind: movement.entryKind,
      reversesMovementId: movement.reversesMovementId, sourceType: movement.sourceType, sourceId: movement.sourceId, sourceRevision: movement.sourceRevision,
    });
    dependencies.push(source);
    if (movement.effectiveDate < asOfDate) {
      openingBalance = rupiah(openingBalance + (movement.direction === "inflow" ? amount : -amount));
    } else {
      confirmedMovements.push({
        eventId: `cash:${movement.id}`, dependencyKey: source.key, date: isoDate(movement.effectiveDate), sameDayOrder: movement.sameDayOrder,
        direction: movement.direction, amountRupiah: amount, certainty: "confirmed" as const, eventClass: "cash_movement" as const,
        orderingSource: "explicit" as const, material: true,
      });
    }
  }
  if (openingBalance < 0n) {
    return failure("INVALID_FINANCIAL_STATE", "Rolled cash opening cannot be negative.");
  }
  return { ok: true, value: { accountId: account.id, asOfDate, openingBalanceRupiah: rupiah(openingBalance), openingSource, confirmedMovements, dependencies } };
}
