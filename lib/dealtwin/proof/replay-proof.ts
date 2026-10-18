import { compileDeal, type CompileInput, type CompileResult } from "../compiler/compile-deal";
import { sha256Canonical, type CanonicalJsonValue } from "../domain/canonical-json";
import { isoDate, type IsoDate } from "../domain/date";
import { createDealVersion } from "../domain/deal";
import type { DealTermsV1 } from "../domain/deal-terms";
import { parseRupiah, type Rupiah } from "../domain/money";
import { basisPoints } from "../domain/rate";
import { createCompilerPolicy, type CompilerPolicy } from "../domain/policy";
import type { Approval, ApprovalKind, ApprovalStatus } from "../domain/proof";
import type { Result } from "../domain/result";
import { validateConstraints, type CommercialConstraint, type ConstraintSet } from "../domain/constraint";
import type { DatedCashEvent } from "../domain/cash-event";
import { hashCanonicalSnapshotState, type CanonicalErpSnapshot } from "../erp/build-snapshot";
import type { FinancialSourceReference, SourceDependency } from "../erp/adapter-types";
import { dependencyKey, type SnapshotHash } from "../erp/dependency-manifest";
import { buildDealProof, type ProofAssumption, type RecordedStressRun } from "./build-proof";
import type { DealProofDto } from "./proof-dto";
import { CANONICALIZATION_VERSION, DEALTWIN_ENGINE_VERSION, NAMED_STRESS_ENGINE_VERSION, type DealTwinEngineVersion } from "./version";
import { runStressLab } from '../stress/run-stress-lab';
import { decodeStressScenario } from '../stress/stress-transform';

export interface ReplaySuccess {
  readonly resultHash: string;
  readonly recomputedResultHash: string;
  readonly proofHash: string;
}

export type ReplayResult = Result<ReplaySuccess>;
export type DealCompiler = (input: CompileInput) => CompileResult;

const SUPPORTED_ADAPTER_VERSION = "dealtwin-erp-adapter-v1";
const GENERATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_TYPES = [
  "purchase_order", "goods_receipt", "supplier_invoice", "sales_order", "delivery_order",
  "customer_invoice", "payment", "cash_account", "cash_movement",
] as const;

function fail<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

function jsonInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function isCanonicalJson(value: unknown, ancestors: Set<object> = new Set()): value is CanonicalJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => isCanonicalJson(item, ancestors));
    if (!isRecord(value) || Object.getOwnPropertySymbols(value).length > 0) return false;
    return Object.values(value).every((item) => isCanonicalJson(item, ancestors));
  } finally {
    ancestors.delete(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function money(value: unknown): Rupiah | null {
  if (typeof value !== "string") return null;
  try { return parseRupiah(value); } catch { return null; }
}

function date(value: unknown): IsoDate | null {
  if (typeof value !== "string") return null;
  try { return isoDate(value); } catch { return null; }
}

function hashedBody(dto: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(dto).filter(([key]) => key !== "proofHash"));
}

function decodeDependency(value: unknown): SourceDependency | null {
  if (!isRecord(value) || !canonicalText(value.key) || !isHash(value.contentHash)) return null;
  return { key: value.key, contentHash: value.contentHash };
}

function decodeSource(value: unknown): FinancialSourceReference | null {
  const dependency = decodeDependency(value);
  if (!dependency || !isRecord(value)) return null;
  if (!SOURCE_TYPES.includes(value.sourceType as FinancialSourceReference["sourceType"])) return null;
  if (!canonicalText(value.sourceId) || typeof value.sourceRevision !== "string") return null;
  return {
    key: dependency.key,
    contentHash: dependency.contentHash,
    sourceType: value.sourceType as FinancialSourceReference["sourceType"],
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
  };
}

function decodeCashEvent(value: unknown): DatedCashEvent | null {
  if (!isRecord(value)) return null;
  const amountRupiah = money(value.amountRupiah);
  const eventDate = date(value.date);
  if (!amountRupiah || !eventDate || !canonicalText(value.eventId) || !canonicalText(value.dependencyKey)) return null;
  const sameDayOrder = jsonInt(value.sameDayOrder);
  if (sameDayOrder === null || sameDayOrder < 0 || typeof value.material !== "boolean") return null;
  const base = {
    eventId: value.eventId,
    dependencyKey: value.dependencyKey,
    date: eventDate,
    sameDayOrder,
    amountRupiah,
    orderingSource: value.orderingSource,
    material: value.material,
  };
  if (value.eventClass === "opening_balance" && value.direction === "inflow" && value.certainty === "confirmed") {
    return { ...base, eventClass: "opening_balance", direction: "inflow", certainty: "confirmed", orderingSource: value.orderingSource as DatedCashEvent["orderingSource"] };
  }
  if (value.eventClass === "cash_movement" && (value.direction === "inflow" || value.direction === "outflow") && value.certainty === "confirmed") {
    return { ...base, eventClass: "cash_movement", direction: value.direction, certainty: "confirmed", orderingSource: value.orderingSource as DatedCashEvent["orderingSource"] };
  }
  if (value.eventClass === "commitment" && (value.direction === "inflow" || value.direction === "outflow") && value.certainty === "reserved") {
    return { ...base, eventClass: "commitment", direction: value.direction, certainty: "reserved", orderingSource: value.orderingSource as DatedCashEvent["orderingSource"] };
  }
  if (value.eventClass === "projected" && (value.direction === "inflow" || value.direction === "outflow") && (value.certainty === "expected" || value.certainty === "assumption")) {
    return { ...base, eventClass: "projected", direction: value.direction, certainty: value.certainty, orderingSource: value.orderingSource as DatedCashEvent["orderingSource"] };
  }
  return null;
}

function decodeSnapshot(value: CanonicalJsonValue): Result<CanonicalErpSnapshot> {
  if (!isRecord(value)) return fail("INVALID_PROOF", "Encoded snapshot is not a canonical object.");
  const openingBalanceRupiah = money(value.openingBalanceRupiah);
  const asOfDate = date(value.asOfDate);
  const requestedHorizonEnd = date(value.requestedHorizonEnd);
  const cash = isRecord(value.cash) ? value.cash : null;
  const openingSource = cash ? decodeSource(cash.openingSource) : null;
  const cashOpening = cash ? money(cash.openingBalanceRupiah) : null;
  const cashAsOf = cash ? date(cash.asOfDate) : null;
  const manifest = isRecord(value.dependencyManifest) && Array.isArray(value.dependencyManifest.entries)
    ? value.dependencyManifest.entries.map(decodeDependency)
    : null;
  const erpRevision = jsonInt(value.erpRevision);
  if (!canonicalText(value.tenantId) || !canonicalText(value.adapterVersion) || !isHash(value.stateHash)
    || erpRevision === null || erpRevision < 0 || openingBalanceRupiah === null || !asOfDate
    || !requestedHorizonEnd || !cash || !openingSource || cashOpening === null || !cashAsOf || !canonicalText(cash.accountId)
    || !Array.isArray(cash.confirmedMovements) || !Array.isArray(cash.dependencies) || !Array.isArray(value.obligations)
    || !Array.isArray(value.receipts) || !Array.isArray(value.inventory) || !Array.isArray(value.supplierTerms)
    || !Array.isArray(value.customerTerms) || !Array.isArray(value.cashEvents) || !manifest || manifest.some((item) => !item)) {
    return fail("INVALID_PROOF", "Encoded snapshot identity or money is invalid.");
  }
  const confirmedMovements = cash.confirmedMovements.map(decodeCashEvent);
  const cashEvents = value.cashEvents.map(decodeCashEvent);
  const cashDependencies = cash.dependencies.map(decodeDependency);
  if (confirmedMovements.some((item) => !item) || cashEvents.some((item) => !item) || cashDependencies.some((item) => !item)) {
    return fail("INVALID_PROOF", "Encoded snapshot cash events are invalid.");
  }
  const obligations = [];
  for (const item of value.obligations) {
    if (!isRecord(item)) return fail("INVALID_PROOF", "Encoded snapshot obligation is invalid.");
    const authority = item.authority;
    if (authority !== "purchase_order" && authority !== "supplier_invoice") {
      return fail("INVALID_PROOF", "Encoded snapshot obligation is invalid.");
    }
    if (!canonicalText(item.economicEventId) || !canonicalText(item.supplierId) || !canonicalText(item.purchaseOrderId)
      || item.sameDayOrder !== 300 || !Array.isArray(item.sourceChain)) {
      return fail("INVALID_PROOF", "Encoded snapshot obligation is invalid.");
    }
    const dueDate = date(item.dueDate);
    const amountRupiah = money(item.amountRupiah);
    const sourceChain = item.sourceChain.map(decodeSource);
    if (!dueDate || !amountRupiah || sourceChain.some((source) => !source)) {
      return fail("INVALID_PROOF", "Encoded snapshot obligation money is invalid.");
    }
    obligations.push({
      economicEventId: item.economicEventId, supplierId: item.supplierId, purchaseOrderId: item.purchaseOrderId,
      authority: authority === "purchase_order" ? "purchase_order" as const : "supplier_invoice" as const, dueDate, sameDayOrder: 300 as const, amountRupiah,
      sourceChain: sourceChain.filter((source): source is FinancialSourceReference => source !== null),
    });
  }
  const receipts = [];
  for (const item of value.receipts) {
    if (!isRecord(item) || !canonicalText(item.economicEventId) || !canonicalText(item.customerId) || !canonicalText(item.salesOrderId)
      || item.authority !== "customer_invoice" || item.sameDayOrder !== 500 || !Array.isArray(item.sourceChain)) {
      return fail("INVALID_PROOF", "Encoded snapshot receipt is invalid.");
    }
    const expectedDate = date(item.expectedDate);
    const amountRupiah = money(item.amountRupiah);
    const sourceChain = item.sourceChain.map(decodeSource);
    if (!expectedDate || !amountRupiah || sourceChain.some((source) => !source)) {
      return fail("INVALID_PROOF", "Encoded snapshot receipt money is invalid.");
    }
    receipts.push({
      economicEventId: item.economicEventId, customerId: item.customerId, salesOrderId: item.salesOrderId,
      authority: "customer_invoice" as const, expectedDate, sameDayOrder: 500 as const, amountRupiah,
      sourceChain: sourceChain.filter((source): source is FinancialSourceReference => source !== null),
    });
  }
  const inventory = [];
  for (const item of value.inventory) {
    if (!isRecord(item)) return fail("INVALID_PROOF", "Encoded snapshot inventory is invalid.");
    const physicalQuantity = jsonInt(item.physicalQuantity);
    const reservedQuantity = jsonInt(item.reservedQuantity);
    const availableQuantity = jsonInt(item.availableQuantity);
    if (!canonicalText(item.productId) || !canonicalText(item.warehouseId)
      || physicalQuantity === null || reservedQuantity === null || availableQuantity === null || !Array.isArray(item.dependencies)) {
      return fail("INVALID_PROOF", "Encoded snapshot inventory is invalid.");
    }
    const dependencies = item.dependencies.map(decodeDependency);
    if (dependencies.some((entry) => !entry)) return fail("INVALID_PROOF", "Encoded snapshot inventory dependencies are invalid.");
    inventory.push({
      productId: item.productId, warehouseId: item.warehouseId, physicalQuantity, reservedQuantity, availableQuantity,
      dependencies: dependencies.filter((entry): entry is SourceDependency => entry !== null),
    });
  }
  const supplierTerms = [];
  for (const item of value.supplierTerms) {
    if (!isRecord(item)) return fail("INVALID_PROOF", "Encoded snapshot supplier terms are invalid.");
    const paymentTermDays = jsonInt(item.paymentTermDays);
    if (!isRecord(item) || !canonicalText(item.supplierId) || paymentTermDays === null || paymentTermDays < 0) {
      return fail("INVALID_PROOF", "Encoded snapshot supplier terms are invalid.");
    }
    const dependency = decodeDependency(item.dependency);
    if (!dependency) return fail("INVALID_PROOF", "Encoded snapshot supplier dependency is invalid.");
    supplierTerms.push({ supplierId: item.supplierId, paymentTermDays, dependency });
  }
  const customerTerms = [];
  for (const item of value.customerTerms) {
    if (!isRecord(item) || !canonicalText(item.customerId)) return fail("INVALID_PROOF", "Encoded snapshot customer terms are invalid.");
    const creditLimitRupiah = money(item.creditLimitRupiah);
    const dependency = decodeDependency(item.dependency);
    if (!creditLimitRupiah || !dependency) return fail("INVALID_PROOF", "Encoded snapshot customer terms money is invalid.");
    customerTerms.push({ customerId: item.customerId, creditLimitRupiah, dependency });
  }
  const manifestEntries = manifest.filter((item): item is SourceDependency => item !== null);
  const keys = manifestEntries.map((item) => dependencyKey(item.key));
  const stateHashValue = value.stateHash;
  if (!isHash(stateHashValue)) return fail("INVALID_PROOF", "Encoded snapshot stateHash is invalid.");
  return {
    ok: true,
    value: {
      tenantId: value.tenantId,
      erpRevision,
      asOfDate,
      requestedHorizonEnd,
      adapterVersion: value.adapterVersion,
      openingBalanceRupiah,
      cash: {
        accountId: cash.accountId,
        asOfDate: cashAsOf,
        openingBalanceRupiah: cashOpening,
        openingSource,
        confirmedMovements: confirmedMovements.filter((item): item is DatedCashEvent => item !== null),
        dependencies: cashDependencies.filter((item): item is SourceDependency => item !== null),
      },
      obligations,
      receipts,
      inventory,
      supplierTerms,
      customerTerms,
      cashEvents: cashEvents.filter((item): item is DatedCashEvent => item !== null),
      dependencyManifest: {
        entries: manifestEntries,
        keys,
      },
      stateHash: stateHashValue as SnapshotHash,
    },
  };
}

export function decodeTerms(value: CanonicalJsonValue): Result<DealTermsV1> {
  if (!isRecord(value) || value.schemaVersion !== "dealtwin.deal-terms.v1" || value.currency !== "IDR"
    || !canonicalText(value.customerId) || !canonicalText(value.warehouseId) || !Array.isArray(value.productLines)
    || !Array.isArray(value.customerPaymentEvents) || value.customerPaymentEvents.length !== 2
    || !Array.isArray(value.directCostEvents)) {
    return fail("INVALID_PROOF", "Encoded deal terms are invalid.");
  }
  const acceptedDate = date(value.acceptedDate);
  if (!acceptedDate) return fail("INVALID_PROOF", "Encoded deal terms date is invalid.");
  try {
    const productLines = value.productLines.map((item) => {
      if (!isRecord(item) || !canonicalText(item.lineId) || !canonicalText(item.productId)) {
        throw new Error("line");
      }
      const quantity = jsonInt(item.quantity);
      const unitPriceRupiah = money(item.unitPriceRupiah);
      if (quantity === null || !unitPriceRupiah) throw new Error("price");
      return { lineId: item.lineId, productId: item.productId, quantity, unitPriceRupiah };
    });
    const [depositRaw, balanceRaw] = value.customerPaymentEvents;
    if (!isRecord(depositRaw) || !isRecord(balanceRaw)) throw new Error("payments");
    const decodePayment = (item: Record<string, unknown>, role: "customer_deposit" | "customer_balance") => {
      const effectiveDate = date(item.effectiveDate);
      const bps = jsonInt(item.basisPoints);
      const daysFromAcceptance = jsonInt(item.daysFromAcceptance);
      const sameDayOrder = jsonInt(item.sameDayOrder);
      if (!canonicalText(item.eventId) || item.role !== role || bps === null
        || daysFromAcceptance === null || sameDayOrder === null || !effectiveDate) {
        throw new Error("payment");
      }
      if (role === "customer_deposit") {
        if (daysFromAcceptance !== 0) throw new Error("payment");
        return {
          eventId: item.eventId,
          role: "customer_deposit" as const,
          basisPoints: basisPoints(bps),
          daysFromAcceptance: 0 as const,
          effectiveDate,
          sameDayOrder,
        };
      }
      return {
        eventId: item.eventId,
        role: "customer_balance" as const,
        basisPoints: basisPoints(bps),
        daysFromAcceptance,
        effectiveDate,
        sameDayOrder,
      };
    };
    const customerPaymentEvents = [
      decodePayment(depositRaw, "customer_deposit"),
      decodePayment(balanceRaw, "customer_balance"),
    ] as DealTermsV1["customerPaymentEvents"];
    const directCostEvents = value.directCostEvents.map((item) => {
      if (!isRecord(item) || !canonicalText(item.eventId) || item.role !== "direct_cost" || !Array.isArray(item.productLineIds)
        || !isRecord(item.provenance)) {
        throw new Error("cost");
      }
      const daysFromAcceptance = jsonInt(item.daysFromAcceptance);
      const sameDayOrder = jsonInt(item.sameDayOrder);
      const amountRupiah = money(item.amountRupiah);
      const effectiveDate = date(item.effectiveDate);
      if (daysFromAcceptance === null || sameDayOrder === null || !amountRupiah || !effectiveDate) throw new Error("cost-money");
      return {
        eventId: item.eventId, role: "direct_cost" as const,
        supplierId: item.supplierId === null ? null : String(item.supplierId),
        productLineIds: item.productLineIds.map((lineId) => String(lineId)),
        amountRupiah, daysFromAcceptance, effectiveDate, sameDayOrder,
        orderingSource: item.orderingSource as DealTermsV1["directCostEvents"][number]["orderingSource"],
        provenance: {
          sourceType: String(item.provenance.sourceType),
          sourceId: String(item.provenance.sourceId),
          sourceRevision: String(item.provenance.sourceRevision),
          evidence: String(item.provenance.evidence),
        },
      };
    });
    return {
      ok: true,
      value: {
        schemaVersion: "dealtwin.deal-terms.v1",
        currency: "IDR",
        customerId: value.customerId,
        warehouseId: value.warehouseId,
        acceptedDate,
        productLines,
        customerPaymentEvents,
        directCostEvents,
      },
    };
  } catch {
    return fail("INVALID_PROOF", "Encoded deal terms money is invalid.");
  }
}

export function decodeConstraints(value: CanonicalJsonValue): Result<ConstraintSet> {
  if (!Array.isArray(value)) return fail("INVALID_PROOF", "Encoded constraints are invalid.");
  const constraints: CommercialConstraint[] = [];
  for (const item of value) {
    if (!isRecord(item) || !canonicalText(item.id) || typeof item.kind !== "string") {
      return fail("INVALID_PROOF", "Encoded constraint identity is invalid.");
    }
    const base = {
      id: item.id,
      provenance: item.provenance,
      resolution: item.resolution,
      sourceText: item.sourceText === null ? null : item.sourceText,
    };
    if (item.kind === "minimum_cash_rupiah") {
      const parsed = money(item.value);
      if (parsed === null) return fail("INVALID_PROOF", "Encoded cash-floor constraint is invalid.");
      constraints.push({ ...base, kind: item.kind, operator: "gte", value: parsed } as CommercialConstraint);
      continue;
    }
    constraints.push(item as unknown as CommercialConstraint);
  }
  const validated = validateConstraints(constraints);
  if (!validated.ok) return fail("INVALID_PROOF", validated.error.message);
  return validated;
}

function decodePolicy(value: CanonicalJsonValue): Result<CompilerPolicy> {
  if (!isRecord(value) || value.newBorrowingAllowed !== false) {
    return fail("INVALID_PROOF", "Encoded compiler policy is invalid.");
  }
  const defaultHorizonDays = jsonInt(value.defaultHorizonDays);
  const minimumCashRupiah = money(value.minimumCashRupiah);
  if (minimumCashRupiah === null || defaultHorizonDays === null) return fail("INVALID_PROOF", "Encoded compiler policy money is invalid.");
  return createCompilerPolicy({ minimumCashRupiah, newBorrowingAllowed: false, defaultHorizonDays });
}

function decodeApprovals(value: CanonicalJsonValue, proofId: string, dealVersionId: string): Result<readonly Approval[]> {
  if (!Array.isArray(value)) return fail("INVALID_PROOF", "Encoded approvals are invalid.");
  const approvals: Approval[] = [];
  for (const item of value) {
    if (!isRecord(item) || !canonicalText(item.id) || !canonicalText(item.proofId) || !canonicalText(item.dealVersionId)
      || (item.kind !== "non_arithmetic_authorization" && item.kind !== "arithmetic_uncertainty")
      || (item.status !== "pending" && item.status !== "approved" && item.status !== "rejected")
      || (item.requirementCode!==undefined && (!canonicalText(item.requirementCode)||item.requirementCode.length>128))) {
      return fail("INVALID_PROOF", "Encoded approval identity is invalid.");
    }
    if (item.proofId !== proofId || item.dealVersionId !== dealVersionId) {
      return fail("APPROVAL_IDENTITY_MISMATCH", "Stored approval does not belong to this proof and Deal version.");
    }
    approvals.push({
      id: item.id, proofId: item.proofId, dealVersionId: item.dealVersionId,
      kind: item.kind as ApprovalKind, status: item.status as ApprovalStatus,
      ...(item.requirementCode!==undefined?{requirementCode:item.requirementCode as string}:{}),
    });
  }
  return { ok: true, value: approvals };
}

function decodeAssumptions(value: CanonicalJsonValue): Result<readonly ProofAssumption[]> {
  if (!Array.isArray(value)) return fail("INVALID_PROOF", "Encoded assumptions are invalid.");
  const assumptions: ProofAssumption[] = [];
  for (const item of value) {
    if (!isRecord(item) || !canonicalText(item.id) || !canonicalText(item.code) || !canonicalText(item.detail)) {
      return fail("INVALID_PROOF", "Encoded assumption evidence is invalid.");
    }
    assumptions.push({ id: item.id, code: item.code, detail: item.detail });
  }
  return { ok: true, value: assumptions };
}

function decodeStress(value: CanonicalJsonValue): Result<readonly RecordedStressRun[]> {
  if (!Array.isArray(value)) return fail("INVALID_PROOF", "Encoded stress evidence is invalid.");
  const runs: RecordedStressRun[] = [];
  for (const item of value) {
    if (!isRecord(item) || !canonicalText(item.id) || !canonicalText(item.transformType)) {
      return fail("INVALID_PROOF", "Encoded stress identity is invalid.");
    }
    if (!isCanonicalJson(item.parameters) || !isCanonicalJson(item.inputPayload) || !isCanonicalJson(item.resultPayload)) {
      return fail("INVALID_PROOF", "Encoded stress payload is invalid.");
    }
    runs.push({
      id: item.id,
      transformType: item.transformType,
      parameters: item.parameters,
      inputPayload: item.inputPayload,
      resultPayload: item.resultPayload,
    });
  }
  return { ok: true, value: runs };
}

function decodeCodes(value: CanonicalJsonValue): Result<readonly string[]> {
  if (!Array.isArray(value)) return fail("INVALID_PROOF", "Encoded approval codes are invalid.");
  const codes: string[] = [];
  for (const item of value) {
    if (!canonicalText(item)) return fail("INVALID_PROOF", "Encoded approval codes are invalid.");
    codes.push(item);
  }
  return { ok: true, value: codes };
}

function validateShape(dto: unknown): ReplayResult {
  if (!isRecord(dto)) {
    return fail("INVALID_PROOF", "Stored proof is not a canonical object.");
  }
  const dealVersion = jsonInt(dto.dealVersion);
  const erpRevision = jsonInt(dto.erpRevision);
  if (!canonicalText(dto.id) || !canonicalText(dto.dealId) || !canonicalText(dto.dealVersionId)
    || dealVersion === null || dealVersion <= 0
    || typeof dto.generatedAt !== "string" || !GENERATED_AT_PATTERN.test(dto.generatedAt)
    || !canonicalText(dto.engineVersion) || !canonicalText(dto.canonicalizationVersion) || !canonicalText(dto.adapterVersion)
    || erpRevision === null || erpRevision < 0
    || !["VALID", "CONDITIONALLY_VALID", "STALE", "INVALID"].includes(dto.status as string)) {
    return fail("INVALID_PROOF", "Stored proof identity or timestamp is invalid.");
  }
  if (!isHash(dto.proofHash) || !isHash(dto.inputHash) || !isHash(dto.resultHash)
    || !isHash(dto.snapshotHash) || !isHash(dto.canonicalEventHash)) {
    return fail("INVALID_PROOF", "Stored proof hashes are not canonical SHA-256 digests.");
  }
  if (!isRecord(dto.terms) || !isRecord(dto.snapshot) || !isRecord(dto.policy) || !isRecord(dto.dependencyManifest)
    || !isRecord(dto.baseResult) || !Array.isArray(dto.constraints) || !Array.isArray(dto.cashEvents)
    || !Array.isArray(dto.stressRuns) || !Array.isArray(dto.assumptions) || !Array.isArray(dto.approvals)
    || !Array.isArray(dto.approvedApprovalCodes)) {
    return fail("INVALID_PROOF", "Stored proof payload is missing canonical structured fields.");
  }
  return { ok: true, value: { resultHash: dto.resultHash, recomputedResultHash: dto.resultHash, proofHash: dto.proofHash } };
}

function prepareReplay(proof: DealProofDto): Result<{
  readonly proof: DealProofDto;
  readonly compileInput: CompileInput;
  readonly version: ReturnType<typeof createDealVersion>;
  readonly snapshot: CanonicalErpSnapshot;
  readonly constraints: ConstraintSet;
  readonly policy: CompilerPolicy;
  readonly approvals: readonly Approval[];
  readonly assumptions: readonly ProofAssumption[];
  readonly stressRuns: readonly RecordedStressRun[];
  readonly approvedApprovalCodes: readonly string[];
}> {
  const shape = validateShape(proof);
  if (!shape.ok) return shape;
  if ((proof.engineVersion !== DEALTWIN_ENGINE_VERSION && proof.engineVersion !== NAMED_STRESS_ENGINE_VERSION)
    || proof.canonicalizationVersion !== CANONICALIZATION_VERSION
    || proof.adapterVersion !== SUPPORTED_ADAPTER_VERSION) {
    return fail("UNSUPPORTED_ENGINE_VERSION", "Stored proof was produced by an unsupported DealTwin engine.");
  }
  const body = hashedBody(proof);
  if (!isCanonicalJson(body)) {
    return fail("INVALID_PROOF", "Stored proof payload is not canonical JSON.");
  }
  if (sha256Canonical(body) !== proof.proofHash) {
    return fail("REPLAY_MISMATCH", "Stored proofHash does not match the canonical proof body.");
  }
  const snapshot = decodeSnapshot(proof.snapshot);
  if (!snapshot.ok) return snapshot;
  if (sha256Canonical(proof.snapshot) !== proof.snapshotHash) {
    return fail("REPLAY_MISMATCH", "Stored snapshotHash does not match the encoded snapshot.");
  }
  if (snapshot.value.adapterVersion !== proof.adapterVersion) {
    return fail("UNSUPPORTED_ENGINE_VERSION", "Stored adapter version does not match the encoded snapshot.");
  }
  if (hashCanonicalSnapshotState(snapshot.value) !== snapshot.value.stateHash) {
    return fail("SNAPSHOT_HASH_MISMATCH", "Encoded snapshot contents do not match the recorded snapshot stateHash.");
  }
  const terms = decodeTerms(proof.terms);
  if (!terms.ok) return terms;
  const constraints = decodeConstraints(proof.constraints);
  if (!constraints.ok) return constraints;
  const policy = decodePolicy(proof.policy);
  if (!policy.ok) return fail("INVALID_PROOF", policy.error.message);
  const approvals = decodeApprovals(proof.approvals, proof.id, proof.dealVersionId);
  if (!approvals.ok) return approvals;
  const assumptions = decodeAssumptions(proof.assumptions);
  if (!assumptions.ok) return assumptions;
  const stressRuns = decodeStress(proof.stressRuns);
  if (!stressRuns.ok) return stressRuns;
  if ((proof.engineVersion === DEALTWIN_ENGINE_VERSION && stressRuns.value.some(run => run.transformType === 'dealtwin.named-stress.v1'))
    || (proof.engineVersion === NAMED_STRESS_ENGINE_VERSION && stressRuns.value.some(run => run.transformType !== 'dealtwin.named-stress.v1'))) {
    return fail('UNSUPPORTED_STRESS_VERSION', 'Legacy and named stress formats cannot be silently relabeled.');
  }
  const approvedApprovalCodes = decodeCodes(proof.approvedApprovalCodes);
  if (!approvedApprovalCodes.ok) return approvedApprovalCodes;
  const version = createDealVersion({
    id: proof.dealVersionId,
    dealId: proof.dealId,
    version: proof.dealVersion,
    terms: terms.value,
    createdBy: "replay",
    createdAt: proof.generatedAt,
  });
  return {
    ok: true,
    value: {
      proof,
      compileInput: {
        snapshot: snapshot.value,
        terms: terms.value,
        constraints: constraints.value,
        policy: policy.value,
        approvedApprovalCodes: approvedApprovalCodes.value,
      },
      version,
      snapshot: snapshot.value,
      constraints: constraints.value,
      policy: policy.value,
      approvals: approvals.value,
      assumptions: assumptions.value,
      stressRuns: stressRuns.value,
      approvedApprovalCodes: approvedApprovalCodes.value,
    },
  };
}

export function replayProof(proof: DealProofDto, compiler: DealCompiler = compileDeal): ReplayResult {
  let prepared: ReturnType<typeof prepareReplay>;
  try {
    prepared = prepareReplay(proof);
  } catch (error) {
    return fail("INVALID_PROOF", error instanceof Error ? error.message : "Stored proof is not a canonical Deal Proof DTO.");
  }
  if (!prepared.ok) return prepared;
  const compiled = compiler(prepared.value.compileInput);
  if (prepared.value.proof.engineVersion === NAMED_STRESS_ENGINE_VERSION) {
    try {
      const runs = prepared.value.stressRuns;
      const recomputed = runStressLab(prepared.value.compileInput, runs.map(run => decodeStressScenario(run.parameters)), compiler)
        .map(run => ({ id: run.id, transformType: run.transformType, parameters: run.parameters, inputPayload: run.inputPayload, resultPayload: run.resultPayload }));
      if (sha256Canonical(recomputed as unknown as CanonicalJsonValue) !== sha256Canonical(runs as unknown as CanonicalJsonValue)) {
        return fail('REPLAY_MISMATCH', 'Recomputed named stress differs from stored evidence.');
      }
    } catch (error) { return fail('INVALID_STRESS_SCENARIO', error instanceof Error ? error.message : 'Invalid stored stress'); }
  }
  const rebuilt = buildDealProof({
    proofId: prepared.value.proof.id,
    dealId: prepared.value.proof.dealId,
    version: prepared.value.version,
    snapshot: prepared.value.snapshot,
    constraints: prepared.value.constraints,
    policy: prepared.value.policy,
    baseResult: compiled,
    stressRuns: prepared.value.stressRuns,
    assumptions: prepared.value.assumptions,
    approvals: prepared.value.approvals,
    approvedApprovalCodes: prepared.value.approvedApprovalCodes,
    generatedAt: prepared.value.proof.generatedAt,
    engineVersion: prepared.value.proof.engineVersion as DealTwinEngineVersion,
  });
  if (!rebuilt.ok) return fail(rebuilt.error.code, rebuilt.error.message);
  const stored = prepared.value.proof;
  if (rebuilt.value.inputHash !== stored.inputHash || rebuilt.value.resultHash !== stored.resultHash
    || rebuilt.value.canonicalEventHash !== stored.canonicalEventHash || rebuilt.value.snapshotHash !== stored.snapshotHash
    || rebuilt.value.proofHash !== stored.proofHash) {
    return fail("REPLAY_MISMATCH", "Recomputed proof commitments do not match the stored Deal Proof.");
  }
  return {
    ok: true,
    value: {
      resultHash: stored.resultHash,
      recomputedResultHash: rebuilt.value.resultHash,
      proofHash: stored.proofHash,
    },
  };
}

/** Decode only after full historical hash/recomputation validation; callers cannot choose an engine. */
export function prepareCommitmentProof(proof: DealProofDto): Result<{ compileInput: CompileInput; approvals: readonly Approval[] }> {
  const replayed = replayProof(proof);
  if (!replayed.ok) return replayed;
  const prepared = prepareReplay(proof);
  if (!prepared.ok) return prepared;
  return { ok: true, value: { compileInput: prepared.value.compileInput, approvals: prepared.value.approvals } };
}
