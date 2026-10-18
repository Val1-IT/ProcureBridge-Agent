export const DEALTWIN_REASON_CODES = [
  "INVALID_CONSTRAINT",
  "DUPLICATE_CONSTRAINT",
  "CONFLICTING_CONSTRAINTS",
  "INVALID_CASH_EVENT",
  "DUPLICATE_CASH_EVENT",
  "UNRESOLVED_SAME_DAY_ORDER",
  "MINIMUM_CASH_VIOLATION",
  "CUSTOMER_DEPOSIT_LIMIT",
  "NEW_BORROWING_PROHIBITED",
  "PROTECTED_OBLIGATION",
  "INSUFFICIENT_INVENTORY",
  "APPROVAL_REQUIRED",
  "PROOF_NOT_CURRENT",
  "LEGACY_SALES_ORDER_VALUE_OUT_OF_RANGE",
  "LIQUIDITY_COLLISION",
  "NO_FEASIBLE_AMENDMENT",
] as const;

export type DealTwinReasonCode = (typeof DEALTWIN_REASON_CODES)[number];

export function isDealTwinReasonCode(value: unknown): value is DealTwinReasonCode {
  return typeof value === "string" && (DEALTWIN_REASON_CODES as readonly string[]).includes(value);
}
