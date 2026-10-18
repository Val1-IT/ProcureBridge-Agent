import { formatRupiahDto, parseRupiah } from "../../dealtwin/domain/money";
import { isStrictIsoDate, isStrictIsoInstant } from "../date-validation";
import type { ErpCommandResult, ErpError } from "../errors";
import { authorize } from "../permissions";
import type {
  CashMovementInput, CashReversalInput, ErpCashAccount, ErpCashMovement,
  ErpRole, ErpState, OpeningCashBalanceInput, Payment,
} from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

type CashBuildResult<T> = { ok: true; value: T } | { ok: false; error: ErpError };

function error(code: ErpError["code"], message: string): ErpError { return { code, message }; }
function reject<T>(state: ErpState, code: ErpError["code"], message: string): ErpCommandResult<T> {
  return rejectErpCommand(state, error(code, message));
}
function authorizeCash<T>(state: ErpState, role: ErpRole): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return reject(state, "INVALID_INPUT", "Active role is invalid.");
  return authorize(role, "finance.write") ? null : reject(state, "FORBIDDEN", "Finance or Admin role is required for cash mutations.");
}
function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
function canonicalRevision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}
function canonicalNonNegativeMoney(value: unknown): value is string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return false;
  try { return parseRupiah(value) >= 0n; } catch { return false; }
}
function canonicalPositiveMoney(value: unknown): value is string {
  return canonicalNonNegativeMoney(value) && parseRupiah(value) > 0n;
}
function activeAccount(state: ErpState, accountId?: string): ErpCashAccount | undefined {
  return (state.cashAccounts ?? []).find((account) => account.active && (accountId === undefined || account.id === accountId));
}
function hasExactlyOneActiveAccount(state: ErpState): boolean {
  return (state.cashAccounts ?? []).filter((account) => account.active).length === 1;
}
function movementChronology(event: Pick<ErpCashMovement, "effectiveDate" | "sameDayOrder" | "id">): string {
  return `${event.effectiveDate}:${String(event.sameDayOrder).padStart(16, "0")}:${event.id}`;
}
function validateMovementInput(state: ErpState, input: CashMovementInput, now: string): ErpError | null {
  if (!hasExactlyOneActiveAccount(state)) return error("INVALID_STATE", "Cash ledger must have exactly one active account.");
  if (!isStrictIsoInstant(now)) return error("INVALID_INPUT", "Command time is invalid.");
  if (!canonicalText(input.accountId) || !canonicalText(input.sourceType) || !canonicalText(input.sourceId)
    || !canonicalRevision(input.sourceRevision) || !canonicalText(input.actorId) || !canonicalText(input.reason)) {
    return error("INVALID_INPUT", "Cash movement provenance is invalid.");
  }
  if (!isStrictIsoDate(input.effectiveDate) || !Number.isSafeInteger(input.sameDayOrder) || input.sameDayOrder <= 0) {
    return error("INVALID_INPUT", "Cash movement date or same-day order is invalid.");
  }
  if (input.direction !== "inflow" && input.direction !== "outflow") return error("INVALID_INPUT", "Cash movement direction is invalid.");
  if (!canonicalPositiveMoney(input.amountRupiah)) return error("INVALID_INPUT", "Cash movement amount must be a positive canonical rupiah integer.");
  const account = activeAccount(state, input.accountId);
  if (!account || account.currency !== "IDR") return error("INVALID_INPUT", "Active IDR cash account was not found.");
  if (input.effectiveDate < account.openingBalanceDate || (input.effectiveDate === account.openingBalanceDate && input.sameDayOrder === 0)) {
    return error("INVALID_INPUT", "Cash movement must occur after the opening anchor.");
  }
  if ((state.cashMovements ?? []).some((item) => item.sourceType === input.sourceType && item.sourceId === input.sourceId)) {
    return error("INVALID_STATE", "Cash movement source provenance already exists.");
  }
  return null;
}
function buildOriginalMovement(state: ErpState, role: ErpRole, input: CashMovementInput, now: string): CashBuildResult<ErpCashMovement> {
  const invalid = validateMovementInput(state, input, now);
  if (invalid) return { ok: false, error: invalid };
  return { ok: true, value: {
    id: `cash-movement-${state.revision + 1}-${(state.cashMovements ?? []).length + 1}`,
    accountId: input.accountId, effectiveDate: input.effectiveDate, sameDayOrder: input.sameDayOrder,
    direction: input.direction, amountRupiah: formatRupiahDto(parseRupiah(input.amountRupiah)),
    entryKind: "original", reversesMovementId: null, sourceType: input.sourceType, sourceId: input.sourceId,
    sourceRevision: input.sourceRevision, actorRole: role, actorId: input.actorId, reason: input.reason,
    createdAt: now, updatedAt: now,
  } };
}
function buildReversal(state: ErpState, role: ErpRole, input: CashReversalInput, now: string, allowPaymentSource: boolean): CashBuildResult<ErpCashMovement> {
  const allowedInputKeys = new Set(["originalMovementId", "effectiveDate", "sameDayOrder", "actorId", "reason"]);
  if (Object.keys(input).some((key) => !allowedInputKeys.has(key))) {
    return { ok: false, error: error("INVALID_INPUT", "Cash reversal fields derived from the original movement cannot be overridden.") };
  }
  if (!isStrictIsoInstant(now) || !isStrictIsoDate(input.effectiveDate) || !Number.isSafeInteger(input.sameDayOrder) || input.sameDayOrder <= 0
    || !canonicalText(input.originalMovementId) || !canonicalText(input.actorId) || !canonicalText(input.reason)) {
    return { ok: false, error: error("INVALID_INPUT", "Cash reversal input is invalid.") };
  }
  const original = (state.cashMovements ?? []).find((item) => item.id === input.originalMovementId);
  if (!original) return { ok: false, error: error("NOT_FOUND", "Original cash movement was not found.") };
  if (original.entryKind !== "original") return { ok: false, error: error("INVALID_STATE", "A reversal cannot reverse another reversal.") };
  if (!allowPaymentSource && original.sourceType === "erp_payment") return { ok: false, error: error("INVALID_STATE", "Linked ERP payments must be cancelled through the payment command.") };
  if ((state.cashMovements ?? []).some((item) => item.reversesMovementId === original.id)) return { ok: false, error: error("INVALID_STATE", "Cash movement has already been reversed.") };
  if (!hasExactlyOneActiveAccount(state) || !activeAccount(state, original.accountId) || !canonicalPositiveMoney(original.amountRupiah)
    || (original.direction !== "inflow" && original.direction !== "outflow")) {
    return { ok: false, error: error("INVALID_STATE", "Original cash movement evidence is invalid.") };
  }
  const proposedKey = `${input.effectiveDate}:${String(input.sameDayOrder).padStart(16, "0")}:~`;
  if (proposedKey <= movementChronology(original)) return { ok: false, error: error("INVALID_INPUT", "Cash reversal must follow the original movement.") };
  return { ok: true, value: {
    id: `cash-reversal-${state.revision + 1}-${(state.cashMovements ?? []).length + 1}`,
    accountId: original.accountId, effectiveDate: input.effectiveDate, sameDayOrder: input.sameDayOrder,
    direction: original.direction === "inflow" ? "outflow" : "inflow", amountRupiah: original.amountRupiah,
    entryKind: "reversal", reversesMovementId: original.id, sourceType: "cash_movement_reversal", sourceId: original.id,
    sourceRevision: String(state.revision + 1), actorRole: role, actorId: input.actorId, reason: input.reason,
    createdAt: now, updatedAt: now,
  } };
}

export function setOpeningCashBalance(state: ErpState, role: ErpRole, input: OpeningCashBalanceInput, now: string): ErpCommandResult<ErpCashAccount> {
  const authorization = authorizeCash<ErpCashAccount>(state, role);
  if (authorization) return authorization;
  if (!isStrictIsoInstant(now) || !canonicalText(input.accountId) || !canonicalText(input.code) || !canonicalText(input.name)
    || !canonicalNonNegativeMoney(input.openingBalanceRupiah) || !isStrictIsoDate(input.openingBalanceDate)
    || !canonicalText(input.sourceType) || !canonicalText(input.sourceId) || !canonicalRevision(input.sourceRevision) || !canonicalText(input.actorId)) {
    return reject(state, "INVALID_INPUT", "Opening cash account input is invalid.");
  }
  const accounts = state.cashAccounts ?? [];
  if (accounts.some((account) => account.active)) return reject(state, "INVALID_STATE", "An active IDR cash account already exists.");
  if (accounts.some((account) => account.id === input.accountId || account.code === input.code)) return reject(state, "INVALID_STATE", "Cash account identity already exists.");
  const account: ErpCashAccount = {
    id: input.accountId, code: input.code, name: input.name, currency: "IDR",
    openingBalanceRupiah: formatRupiahDto(parseRupiah(input.openingBalanceRupiah)), openingBalanceDate: input.openingBalanceDate,
    openingSourceType: input.sourceType, openingSourceId: input.sourceId, openingSourceRevision: input.sourceRevision,
    active: true, createdAt: now, updatedAt: now,
  };
  const staged: ErpState = { ...state, cashAccounts: [...accounts, account], cashMovements: [...(state.cashMovements ?? [])] };
  const next = appendErpAudit(staged, { entityType: "cash_account", entityId: account.id, action: "cash_account.opened", actorRole: role, actorId: input.actorId,
    detail: { code: account.code, currency: account.currency, openingBalanceRupiah: account.openingBalanceRupiah, openingBalanceDate: account.openingBalanceDate, sourceType: account.openingSourceType, sourceId: account.openingSourceId } }, now);
  return commitErpState(state, next, account);
}
export function postCashMovement(state: ErpState, role: ErpRole, input: CashMovementInput, now: string): ErpCommandResult<ErpCashMovement> {
  const authorization = authorizeCash<ErpCashMovement>(state, role);
  if (authorization) return authorization;
  const built = buildOriginalMovement(state, role, input, now);
  if (!built.ok) return rejectErpCommand(state, built.error);
  const staged: ErpState = { ...state, cashAccounts: [...(state.cashAccounts ?? [])], cashMovements: [...(state.cashMovements ?? []), built.value] };
  const next = appendErpAudit(staged, { entityType: "cash_movement", entityId: built.value.id, action: "cash_movement.posted", actorRole: role, actorId: input.actorId,
    detail: { accountId: built.value.accountId, direction: built.value.direction, amountRupiah: built.value.amountRupiah, effectiveDate: built.value.effectiveDate, sourceType: built.value.sourceType, sourceId: built.value.sourceId } }, now);
  return commitErpState(state, next, built.value);
}
export function reverseCashMovement(state: ErpState, role: ErpRole, input: CashReversalInput, now: string): ErpCommandResult<ErpCashMovement> {
  const authorization = authorizeCash<ErpCashMovement>(state, role);
  if (authorization) return authorization;
  const built = buildReversal(state, role, input, now, false);
  if (!built.ok) return rejectErpCommand(state, built.error);
  const staged: ErpState = { ...state, cashMovements: [...(state.cashMovements ?? []), built.value] };
  const next = appendErpAudit(staged, { entityType: "cash_movement", entityId: built.value.id, action: "cash_movement.reversed", actorRole: role, actorId: input.actorId,
    detail: { originalMovementId: input.originalMovementId, accountId: built.value.accountId, direction: built.value.direction, amountRupiah: built.value.amountRupiah, effectiveDate: built.value.effectiveDate } }, now);
  return commitErpState(state, next, built.value);
}
export function createPaymentCashMovement(state: ErpState, role: ErpRole, payment: Payment, now: string): CashBuildResult<ErpCashMovement | null> {
  const account = activeAccount(state);
  if (!account) return { ok: true, value: null };
  if (!hasExactlyOneActiveAccount(state)) return { ok: false, error: error("INVALID_STATE", "Cash ledger must have exactly one active account.") };
  if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) return { ok: false, error: error("INVALID_STATE", "Payment amount cannot be converted to exact cash.") };
  return buildOriginalMovement(state, role, {
    accountId: account.id, effectiveDate: payment.paymentDate, sameDayOrder: payment.direction === "payable" ? 100 : 400,
    direction: payment.direction === "payable" ? "outflow" : "inflow", amountRupiah: BigInt(payment.amount).toString(),
    sourceType: "erp_payment", sourceId: payment.id, sourceRevision: String(state.revision + 1), actorId: `role:${role}`, reason: `Posted ${payment.paymentNumber}`,
  }, now);
}
export function createPaymentCashReversal(state: ErpState, role: ErpRole, payment: Payment, now: string): CashBuildResult<ErpCashMovement | null> {
  if (!activeAccount(state)) return { ok: true, value: null };
  if (!hasExactlyOneActiveAccount(state)) return { ok: false, error: error("INVALID_STATE", "Cash ledger must have exactly one active account.") };
  const linked = (state.cashMovements ?? []).filter((movement) => movement.entryKind === "original" && movement.sourceType === "erp_payment" && movement.sourceId === payment.id);
  if (linked.length !== 1) return { ok: false, error: error("INVALID_STATE", "Posted payment cash evidence is missing or duplicated.") };
  const reversalDate = now.slice(0, 10);
  const conservativeOrder = payment.direction === "payable" ? 400 : 100;
  const sameDayOrder = reversalDate === linked[0].effectiveDate ? Math.max(conservativeOrder, linked[0].sameDayOrder + 1) : conservativeOrder;
  return buildReversal(state, role, { originalMovementId: linked[0].id, effectiveDate: reversalDate,
    sameDayOrder, actorId: `role:${role}`, reason: `Cancelled ${payment.paymentNumber}` }, now, true);
}
