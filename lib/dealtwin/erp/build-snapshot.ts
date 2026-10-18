import { sortCashEvents, validateCashEventOrdering, type DatedCashEvent } from "../domain/cash-event";
import { canonicalCashEventDto, hashCanonicalCashEvents } from "../domain/canonical-event";
import { isSelfReservation, type CommitmentStatus, type LiquidityCommitment, type SelfReservationIdentity } from "../domain/commitment";
import { isoDate, type IsoDate } from "../domain/date";
import { rupiah, type Rupiah } from "../domain/money";
import type { Result } from "../domain/result";
import { sha256Canonical, type CanonicalJsonValue } from "../domain/canonical-json";
import type { ErpState } from "../../erp/types";
import type { CashPositionEvidence, NormalizedObligation, NormalizedReceipt } from "./adapter-types";
import { dependencyKey, type DependencyManifest, type SnapshotHash } from "./dependency-manifest";
import {
  QUERY_ACTIVE_COMMITMENTS_KEY,
  QUERY_CASH_KEY,
  QUERY_OPEN_AP_KEY,
  QUERY_OPEN_AR_KEY,
  QUERY_STOCK_KEY,
  dealtwinCommitmentKey,
  erpCustomerKey,
  erpSupplierKey,
} from "./dependency-keys";
import { normalizeInventory, type InventoryPosition } from "./normalize-inventory";
import { normalizeCash } from "./normalize-cash";
import { normalizePayables } from "./normalize-payables";
import { normalizeReceivables } from "./normalize-receivables";
import type { SourceDependency } from "./adapter-types";

export interface SnapshotInput {
  readonly state: ErpState;
  readonly tenantId: string;
  readonly asOfDate: IsoDate;
  readonly requestedHorizonEnd: IsoDate;
  readonly adapterVersion: string;
  readonly commitments: readonly LiquidityCommitment[];
  readonly self: SelfReservationIdentity | null;
}

export interface CanonicalErpSnapshot {
  readonly tenantId: string;
  readonly erpRevision: number;
  readonly asOfDate: IsoDate;
  readonly requestedHorizonEnd: IsoDate;
  readonly adapterVersion: string;
  readonly openingBalanceRupiah: Rupiah;
  readonly cash: CashPositionEvidence;
  readonly obligations: readonly NormalizedObligation[];
  readonly receipts: readonly NormalizedReceipt[];
  readonly inventory: readonly InventoryPosition[];
  readonly supplierTerms: readonly { readonly supplierId: string; readonly paymentTermDays: number; readonly dependency: SourceDependency }[];
  readonly customerTerms: readonly { readonly customerId: string; readonly creditLimitRupiah: Rupiah; readonly dependency: SourceDependency }[];
  readonly cashEvents: readonly DatedCashEvent[];
  readonly dependencyManifest: DependencyManifest;
  readonly stateHash: SnapshotHash;
}

export interface ErpStateAdapter { buildSnapshot(input: SnapshotInput): Result<CanonicalErpSnapshot>; }

type CommitmentWithEvents = LiquidityCommitment & { readonly events?: readonly DatedCashEvent[] };

function failure<T>(code: string, message: string): Result<T> { return { ok: false, error: { code, message } }; }
function canonicalText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.trim() === value; }
const ACTIVE_COMMITMENT_STATUSES = new Set<CommitmentStatus>(["reserved", "committed"]);
const COMMITMENT_LIFECYCLE_STATUSES = new Set<CommitmentStatus>(["reserved", "committed", "released", "expired", "cancelled"]);

export function normalizeExternalCommitments(rows: readonly LiquidityCommitment[], self: SelfReservationIdentity | null): Result<readonly DatedCashEvent[]> {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return failure("DUPLICATE_COMMITMENT", "Commitment IDs must be unique.");
  const events: DatedCashEvent[] = [];
  for (const row of [...rows].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0) as CommitmentWithEvents[]) {
    if (!canonicalText(row.id) || !canonicalText(row.proofId) || !canonicalText(row.dealVersionId) || !canonicalText(row.canonicalEventHash)) {
      return failure("INVALID_COMMITMENT", "Commitment identity is invalid.");
    }
    if (!COMMITMENT_LIFECYCLE_STATUSES.has(row.status)) {
      return failure("INVALID_COMMITMENT", "Commitment lifecycle status is invalid.");
    }
    if (!ACTIVE_COMMITMENT_STATUSES.has(row.status)) continue;
    if (!Array.isArray(row.events) || row.events.length === 0) return failure("INVALID_COMMITMENT", "Active commitment must carry canonical reserved cash events.");
    const candidates = row.events.every((event) => event.eventClass === "projected"
      && (event.certainty === "expected" || event.certainty === "assumption") && event.dependencyKey === `deal:event:${event.eventId}`);
    if (!candidates && row.events.some((event) => event.eventClass !== "commitment" || event.certainty !== "reserved" || event.dependencyKey !== dealtwinCommitmentKey(row.id))) {
      return failure("INVALID_COMMITMENT", "Commitment event provenance is invalid.");
    }
    const validated = validateCashEventOrdering(row.events);
    if (!validated.ok) return failure(validated.error.code, validated.error.message);
    if (hashCanonicalCashEvents(validated.value) !== row.canonicalEventHash) {
      return failure("COMMITMENT_HASH_MISMATCH", "Canonical commitment event hash does not match the reserved event payload.");
    }
    if (self && isSelfReservation(row, self)) continue;
    if (self && row.proofId === self.proofId) {
      return failure("SELF_RESERVATION_MISMATCH", "Possible self reservation does not match its exact proof, version, and event hash tuple.");
    }
    // Hash the persisted source DTO BEFORE wrapping. Preserve the exact event dates, order and amounts.
    events.push(...(candidates ? validated.value.map((event): DatedCashEvent => ({ ...event, eventId: `${row.id}:${event.eventId}`,
      dependencyKey: dealtwinCommitmentKey(row.id), eventClass: "commitment", certainty: "reserved",
      // This order is inherited from validated immutable proof evidence, not recalculated for the wrapper class.
      orderingSource: "explicit" })) : validated.value));
  }
  const ordered = validateCashEventOrdering(events);
  return ordered.ok ? ordered : failure(ordered.error.code, ordered.error.message);
}

function queryDependency(key: string, payload: CanonicalJsonValue): SourceDependency {
  return { key, contentHash: sha256Canonical(payload) };
}
function moneyDto(value: Rupiah): string { return value.toString(); }

export function hashCanonicalSnapshotState(snapshot: {
  readonly tenantId: string;
  readonly asOfDate: IsoDate;
  readonly requestedHorizonEnd: IsoDate;
  readonly adapterVersion: string;
  readonly cashEvents: readonly DatedCashEvent[];
  readonly inventory: readonly InventoryPosition[];
  readonly supplierTerms: CanonicalErpSnapshot["supplierTerms"];
  readonly customerTerms: CanonicalErpSnapshot["customerTerms"];
  readonly dependencyManifest: DependencyManifest;
}): SnapshotHash {
  return sha256Canonical({
    tenantId: snapshot.tenantId,
    asOfDate: snapshot.asOfDate,
    requestedHorizonEnd: snapshot.requestedHorizonEnd,
    adapterVersion: snapshot.adapterVersion,
    events: sortCashEvents(snapshot.cashEvents).map(canonicalCashEventDto),
    inventory: snapshot.inventory.map((item) => ({
      productId: item.productId,
      warehouseId: item.warehouseId,
      physicalQuantity: item.physicalQuantity,
      reservedQuantity: item.reservedQuantity,
      availableQuantity: item.availableQuantity,
    })),
    supplierTerms: snapshot.supplierTerms.map((item) => ({ supplierId: item.supplierId, paymentTermDays: item.paymentTermDays })),
    customerTerms: snapshot.customerTerms.map((item) => ({ customerId: item.customerId, creditLimitRupiah: moneyDto(item.creditLimitRupiah) })),
    dependencies: [...snapshot.dependencyManifest.entries]
      .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
      .map((entry) => ({ key: entry.key, contentHash: entry.contentHash })),
  }) as SnapshotHash;
}

export function buildSnapshot(input: SnapshotInput): Result<CanonicalErpSnapshot> {
  if (!canonicalText(input.tenantId) || !canonicalText(input.adapterVersion) || !Number.isSafeInteger(input.state.revision) || input.state.revision < 0) {
    return failure("INVALID_SNAPSHOT_INPUT", "Snapshot identity or ERP revision is invalid.");
  }
  try { isoDate(input.asOfDate); isoDate(input.requestedHorizonEnd); } catch { return failure("INVALID_SNAPSHOT_INPUT", "Snapshot dates are invalid."); }
  if (input.requestedHorizonEnd < input.asOfDate) return failure("INVALID_SNAPSHOT_INPUT", "Requested horizon cannot precede the as-of date.");
  const cashResult = normalizeCash(input.state, input.asOfDate);
  if (!cashResult.ok) return cashResult;
  const payableResult = normalizePayables(input.state);
  if (!payableResult.ok) return payableResult;
  const receivableResult = normalizeReceivables(input.state);
  if (!receivableResult.ok) return receivableResult;
  const inventoryResult = normalizeInventory(input.state);
  if (!inventoryResult.ok) return inventoryResult;
  const commitmentResult = normalizeExternalCommitments(input.commitments, input.self);
  if (!commitmentResult.ok) return commitmentResult;

  const cash = cashResult.value;
  const obligations = payableResult.value;
  const receipts = receivableResult.value;
  const inventory = inventoryResult.value;
  if (input.state.suppliers.some((supplier) => !Number.isSafeInteger(supplier.paymentTermDays) || supplier.paymentTermDays < 0)) {
    return failure("INVALID_SUPPLIER_TERMS", "Supplier payment terms must be non-negative safe integers.");
  }
  if (input.state.customers.some((customer) => !Number.isSafeInteger(customer.creditLimit) || customer.creditLimit < 0)) {
    return failure("INVALID_CUSTOMER_TERMS", "Customer credit terms must be non-negative safe rupiah integers.");
  }
  const supplierTerms = [...input.state.suppliers].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((supplier) => {
    return { supplierId: supplier.id, paymentTermDays: supplier.paymentTermDays,
      dependency: queryDependency(erpSupplierKey(supplier.id), { supplierId: supplier.id, paymentTermDays: supplier.paymentTermDays }) };
  });
  const customerTerms = [...input.state.customers].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((customer) => {
    return { customerId: customer.id, creditLimitRupiah: rupiah(BigInt(customer.creditLimit)),
      dependency: queryDependency(erpCustomerKey(customer.id), { customerId: customer.id, creditLimit: customer.creditLimit }) };
  });
  const openingEvents: DatedCashEvent[] = cash.openingBalanceRupiah > 0n ? [{
    eventId: `cash-opening:${cash.accountId}:${input.asOfDate}`, dependencyKey: cash.openingSource.key, date: input.asOfDate, sameDayOrder: 0,
    direction: "inflow", amountRupiah: cash.openingBalanceRupiah, certainty: "confirmed", eventClass: "opening_balance", orderingSource: "explicit", material: true,
  }] : [];
  const obligationEvents: DatedCashEvent[] = obligations.map((item) => ({
    eventId: item.economicEventId, dependencyKey: item.sourceChain[item.sourceChain.length - 1].key, date: item.dueDate, sameDayOrder: item.sameDayOrder,
    direction: "outflow", amountRupiah: item.amountRupiah, certainty: "expected", eventClass: "projected", orderingSource: "conservative", material: true,
  }));
  const receiptEvents: DatedCashEvent[] = receipts.map((item) => ({
    eventId: item.economicEventId, dependencyKey: item.sourceChain[item.sourceChain.length - 1].key, date: item.expectedDate, sameDayOrder: item.sameDayOrder,
    direction: "inflow", amountRupiah: item.amountRupiah, certainty: "expected", eventClass: "projected", orderingSource: "conservative", material: true,
  }));
  const allEvents = sortCashEvents([...openingEvents, ...cash.confirmedMovements, ...obligationEvents, ...receiptEvents, ...commitmentResult.value]);
  const eventValidation = validateCashEventOrdering(allEvents);
  if (!eventValidation.ok) return failure(eventValidation.error.code, eventValidation.error.message);

  const queryEntries = [
    queryDependency(QUERY_OPEN_AP_KEY, obligations.map((item) => ({ id: item.economicEventId, date: item.dueDate, amountRupiah: moneyDto(item.amountRupiah) }))),
    queryDependency(QUERY_OPEN_AR_KEY, receipts.map((item) => ({ id: item.economicEventId, date: item.expectedDate, amountRupiah: moneyDto(item.amountRupiah) }))),
    queryDependency(QUERY_CASH_KEY, { accountId: cash.accountId, openingBalanceRupiah: moneyDto(cash.openingBalanceRupiah), events: cash.confirmedMovements.map(canonicalCashEventDto) }),
    queryDependency(QUERY_STOCK_KEY, inventory.map((item) => ({ productId: item.productId, warehouseId: item.warehouseId, physicalQuantity: item.physicalQuantity, reservedQuantity: item.reservedQuantity, availableQuantity: item.availableQuantity }))),
    queryDependency(QUERY_ACTIVE_COMMITMENTS_KEY, commitmentResult.value.map(canonicalCashEventDto)),
  ];
  const recordEntries = [
    ...cash.dependencies,
    ...obligations.flatMap((item) => item.sourceChain),
    ...receipts.flatMap((item) => item.sourceChain),
    ...inventory.flatMap((item) => item.dependencies),
    ...supplierTerms.map((item) => item.dependency), ...customerTerms.map((item) => item.dependency),
  ];
  const commitmentEntries = [...new Set(commitmentResult.value.map((event) => event.dependencyKey))].map((key) => {
    const events = commitmentResult.value.filter((event) => event.dependencyKey === key).map(canonicalCashEventDto);
    return queryDependency(key, events);
  });
  const byKey = new Map<string, SourceDependency>();
  for (const entry of [...queryEntries, ...recordEntries, ...commitmentEntries]) {
    const prior = byKey.get(entry.key);
    if (prior && prior.contentHash !== entry.contentHash) return failure("DEPENDENCY_HASH_CONFLICT", `Dependency ${entry.key} has conflicting material hashes.`);
    byKey.set(entry.key, entry);
  }
  const entries = [...byKey.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const dependencyManifest: DependencyManifest = { entries, keys: entries.map((entry) => dependencyKey(entry.key)) };
  const stateHash = hashCanonicalSnapshotState({
    tenantId: input.tenantId,
    asOfDate: input.asOfDate,
    requestedHorizonEnd: input.requestedHorizonEnd,
    adapterVersion: input.adapterVersion,
    cashEvents: eventValidation.value,
    inventory,
    supplierTerms,
    customerTerms,
    dependencyManifest,
  });
  return { ok: true, value: { tenantId: input.tenantId, erpRevision: input.state.revision, asOfDate: input.asOfDate,
    requestedHorizonEnd: input.requestedHorizonEnd, adapterVersion: input.adapterVersion, openingBalanceRupiah: cash.openingBalanceRupiah,
    cash, obligations, receipts, inventory, supplierTerms, customerTerms, cashEvents: eventValidation.value, dependencyManifest, stateHash } };
}
