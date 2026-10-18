import { compileDeal, type CompileResult } from "../compiler/compile-deal";
import { validateConstraints, type CommercialConstraint, type ConstraintSet } from "../domain/constraint";
import { isoDate } from "../domain/date";
import type { DealTermsV1 } from "../domain/deal-terms";
import { rupiah, type Rupiah } from "../domain/money";
import { basisPoints } from "../domain/rate";
import type { CompilerPolicy } from "../domain/policy";
import { buildSnapshot, type CanonicalErpSnapshot } from "../erp/build-snapshot";
import type { ErpState } from "../../erp/types";
import { createErpSeedState } from "../../erp/seed";

export const JUDGE_TENANT_ID = "dealtwin-judge-v1";

export interface JudgeScenario {
  readonly tenantId: typeof JUDGE_TENANT_ID;
  readonly erpState: ErpState;
  readonly apMutationState: ErpState;
  readonly snapshot: CanonicalErpSnapshot;
  readonly initialTermsA: DealTermsV1;
  readonly candidateTermsA: DealTermsV1;
  readonly collisionTermsB: DealTermsV1;
  readonly constraints: ConstraintSet;
  readonly policy: CompilerPolicy;
  readonly initialResult: CompileResult;
  readonly candidateResult: CompileResult;
  readonly expected: {
    readonly openingCashRupiah: Rupiah;
    readonly existingPayableRupiah: Rupiah;
    readonly mutatedPayableRupiah: Rupiah;
    readonly existingReceivableRupiah: Rupiah;
    readonly minimumCashRupiah: Rupiah;
    readonly revenueRupiah: Rupiah;
    readonly directCostRupiah: Rupiah;
    readonly maximumDepositBps: number;
  };
}

export function createJudgeScenario(): JudgeScenario {
  const createdAt = "2026-09-12T00:00:00.000Z";
  const receiptAt = "2026-09-10T08:00:00.000Z";
  const deliveryAt = "2026-09-11T08:00:00.000Z";
  const erpState = createErpSeedState();
  erpState.revision = 1;
  erpState.activeRole = "admin";
  erpState.products = [
    { id: "judge-product-a", sku: "JUDGE-A", name: "Judge Product A", unit: "unit", salePrice: 60_000_000, purchasePrice: 42_000_000, reorderPoint: 0, active: true, createdAt, updatedAt: createdAt },
    { id: "judge-product-b", sku: "JUDGE-B", name: "Judge Product B", unit: "unit", salePrice: 8_000_000, purchasePrice: 5_000_000, reorderPoint: 0, active: true, createdAt, updatedAt: createdAt },
  ];
  erpState.suppliers = [{ id: "judge-supplier-a", code: "JUDGE-SUP", name: "Synthetic Judge Supplier", phone: "-", email: "judge-supplier@example.invalid", address: "Synthetic", paymentTermDays: 0, doNotContact: true, active: true, createdAt, updatedAt: createdAt }];
  erpState.customers = [{ id: "judge-customer-a", code: "JUDGE-CUS", name: "Synthetic Judge Customer", contactName: "Judge", phone: "-", email: "judge-customer@example.invalid", address: "Synthetic", creditLimit: 100_000_000, active: true, createdAt, updatedAt: createdAt }];
  erpState.warehouses = [{ id: "judge-warehouse", code: "JUDGE-WH", name: "Synthetic Judge Warehouse", address: "Synthetic", active: true, createdAt, updatedAt: createdAt }];
  erpState.purchaseRequests = [];
  erpState.requestForQuotations = [];
  erpState.supplierQuotations = [];
  erpState.purchaseOrders = [{
    id: "judge-existing-po", orderNumber: "JUDGE-PO-001", supplierId: "judge-supplier-a", purchaseRequestId: null, supplierQuotationId: null,
    warehouseId: "judge-warehouse", status: "completed", lines: [{ productId: "judge-product-a", quantity: 1, unitPrice: 18_000_000 }],
    confirmationDueAt: null, promisedDeliveryDate: "2026-09-10", createdAt: receiptAt, updatedAt: createdAt,
  }];
  erpState.goodsReceipts = [{
    id: "judge-existing-receipt", receiptNumber: "JUDGE-GR-001", purchaseOrderId: "judge-existing-po", warehouseId: "judge-warehouse", status: "approved",
    lines: [{ productId: "judge-product-a", quantity: 1, unitPrice: 18_000_000 }], createdAt: receiptAt, updatedAt: receiptAt,
  }];
  erpState.salesOrders = [{
    id: "judge-existing-so", orderNumber: "JUDGE-SO-HISTORICAL", customerId: "judge-customer-a", warehouseId: "judge-warehouse", status: "invoiced",
    lines: [{ productId: "judge-product-a", quantity: 1, unitPrice: 20_000_000, deliveredQuantity: 1 }], createdAt, updatedAt: createdAt,
  }];
  erpState.deliveryOrders = [{
    id: "judge-existing-delivery", deliveryNumber: "JUDGE-DO-001", salesOrderId: "judge-existing-so", warehouseId: "judge-warehouse", status: "posted",
    lines: [{ productId: "judge-product-a", quantity: 1, unitPrice: 20_000_000 }], createdAt: deliveryAt, updatedAt: deliveryAt,
  }];
  erpState.supplierInvoices = [{
    id: "judge-existing-ap", invoiceNumber: "JUDGE-AP-001", purchaseOrderId: "judge-existing-po", salesOrderId: null,
    supplierId: "judge-supplier-a", customerId: null, sourceDocumentIds: ["judge-existing-receipt"], status: "unpaid",
    lines: [{ productId: "judge-product-a", quantity: 1, unitPrice: 18_000_000 }], totalAmount: 18_000_000, dueDate: "2026-09-15", createdAt, updatedAt: createdAt,
  }];
  erpState.customerInvoices = [{
    id: "judge-existing-ar", invoiceNumber: "JUDGE-AR-001", purchaseOrderId: null, salesOrderId: "judge-existing-so",
    supplierId: null, customerId: "judge-customer-a", sourceDocumentIds: ["judge-existing-delivery"], status: "unpaid",
    lines: [{ productId: "judge-product-a", quantity: 1, unitPrice: 20_000_000 }], totalAmount: 20_000_000, dueDate: "2026-09-20", createdAt, updatedAt: createdAt,
  }];
  erpState.payments = [];
  erpState.cashAccounts = [{
    id: "judge-cash", code: "JUDGE-CASH", name: "Synthetic Judge Cash", currency: "IDR", openingBalanceRupiah: "30000000", openingBalanceDate: "2026-09-12",
    openingSourceType: "judge_seed", openingSourceId: "judge-opening-cash", openingSourceRevision: "1", active: true, createdAt, updatedAt: createdAt,
  }];
  erpState.cashMovements = [];
  erpState.stockMovements = [
    { id: "judge-stock-receipt", type: "receipt", productId: "judge-product-a", warehouseId: "judge-warehouse", quantity: 1, direction: "in", sourceType: "goods_receipt", sourceId: "judge-existing-receipt", actorRole: "warehouse", actorId: "role:warehouse", reason: "Approved JUDGE-GR-001", createdAt: receiptAt, updatedAt: receiptAt },
    { id: "judge-stock-delivery", type: "delivery", productId: "judge-product-a", warehouseId: "judge-warehouse", quantity: 1, direction: "out", sourceType: "delivery_order", sourceId: "judge-existing-delivery", actorRole: "warehouse", actorId: "role:warehouse", reason: "Completed JUDGE-DO-001", createdAt: deliveryAt, updatedAt: deliveryAt },
  ];
  erpState.stockAdjustments = [];
  erpState.supplierCalls = [];
  erpState.supplierApprovals = [];
  erpState.supplierResults = [];
  erpState.disputes = [];
  erpState.followUps = [];
  erpState.auditLogs = [];

  const snapshotResult = buildSnapshot({ state: erpState, tenantId: JUDGE_TENANT_ID, asOfDate: isoDate("2026-09-12"),
    requestedHorizonEnd: isoDate("2026-10-12"), adapterVersion: "dealtwin-erp-adapter-v1", commitments: [], self: null });
  if (!snapshotResult.ok) throw new Error(`Judge snapshot is invalid: ${snapshotResult.error.code}`);

  const termsA = (depositBps: number): DealTermsV1 => ({
    schemaVersion: "dealtwin.deal-terms.v1", currency: "IDR", customerId: "judge-customer-a", warehouseId: "judge-warehouse", acceptedDate: isoDate("2026-09-16"),
    productLines: [{ lineId: "deal-a:line", productId: "judge-product-a", quantity: 1, unitPriceRupiah: rupiah(60_000_000n) }],
    customerPaymentEvents: [
      { eventId: "deal-a:deposit", role: "customer_deposit", basisPoints: basisPoints(depositBps), daysFromAcceptance: 0, effectiveDate: isoDate("2026-09-16"), sameDayOrder: 500 },
      { eventId: "deal-a:balance", role: "customer_balance", basisPoints: basisPoints(10_000 - depositBps), daysFromAcceptance: 14, effectiveDate: isoDate("2026-09-30"), sameDayOrder: 500 },
    ],
    directCostEvents: [{ eventId: "deal-a:direct-cost", role: "direct_cost", supplierId: "judge-supplier-a", productLineIds: ["deal-a:line"], amountRupiah: rupiah(42_000_000n), daysFromAcceptance: 6, effectiveDate: isoDate("2026-09-22"), sameDayOrder: 300, orderingSource: "conservative", provenance: { sourceType: "judge_seed", sourceId: "deal-a:direct-cost", sourceRevision: "1", evidence: "Locked synthetic direct cost" } }],
  });
  const collisionTermsB: DealTermsV1 = {
    schemaVersion: "dealtwin.deal-terms.v1", currency: "IDR", customerId: "judge-customer-a", warehouseId: "judge-warehouse", acceptedDate: isoDate("2026-09-16"),
    productLines: [{ lineId: "deal-b:line", productId: "judge-product-b", quantity: 1, unitPriceRupiah: rupiah(8_000_000n) }],
    customerPaymentEvents: [
      { eventId: "deal-b:deposit", role: "customer_deposit", basisPoints: basisPoints(0), daysFromAcceptance: 0, effectiveDate: isoDate("2026-09-16"), sameDayOrder: 500 },
      { eventId: "deal-b:balance", role: "customer_balance", basisPoints: basisPoints(10_000), daysFromAcceptance: 19, effectiveDate: isoDate("2026-10-05"), sameDayOrder: 500 },
    ],
    directCostEvents: [{ eventId: "deal-b:direct-cost", role: "direct_cost", supplierId: "judge-supplier-a", productLineIds: ["deal-b:line"], amountRupiah: rupiah(5_000_000n), daysFromAcceptance: 7, effectiveDate: isoDate("2026-09-23"), sameDayOrder: 300, orderingSource: "conservative", provenance: { sourceType: "judge_seed", sourceId: "deal-b:direct-cost", sourceRevision: "1", evidence: "Locked synthetic collision cost" } }],
  };
  const rawConstraints: CommercialConstraint[] = [
    { id: "judge:max-deposit", kind: "customer_deposit_max_bps", operator: "lte", value: basisPoints(4_000), provenance: "judge_seed", resolution: "confirmed", sourceText: null },
    { id: "judge:protect-ap", kind: "protect_existing_supplier_due_dates", operator: "eq", value: true, provenance: "judge_seed", resolution: "confirmed", sourceText: null },
    { id: "judge:no-borrowing", kind: "new_borrowing_allowed", operator: "eq", value: false, provenance: "judge_seed", resolution: "confirmed", sourceText: null },
    { id: "judge:cash-floor", kind: "minimum_cash_rupiah", operator: "gte", value: rupiah(5_000_000n), provenance: "judge_seed", resolution: "confirmed", sourceText: null },
    { id: "judge:owner-exception", kind: "required_approval", operator: "eq", value: { approvalCode: "owner_commercial_exception" }, provenance: "judge_seed", resolution: "confirmed", sourceText: null },
  ];
  const constraintResult = validateConstraints(rawConstraints);
  if (!constraintResult.ok) throw new Error(`Judge constraints are invalid: ${constraintResult.error.code}`);
  const policy: CompilerPolicy = { minimumCashRupiah: rupiah(5_000_000n), newBorrowingAllowed: false, defaultHorizonDays: 30 };
  const initialTermsA = termsA(2_000);
  const candidateTermsA = termsA(2_500);
  const compile = (terms: DealTermsV1) => compileDeal({ snapshot: snapshotResult.value, terms, constraints: constraintResult.value, policy, approvedApprovalCodes: [] });
  const apMutationState = structuredClone(erpState);
  const mutatedInvoice = apMutationState.supplierInvoices.find((invoice) => invoice.id === "judge-existing-ap");
  if (!mutatedInvoice) throw new Error("Judge AP mutation source is missing.");
  mutatedInvoice.totalAmount = 19_000_000;
  mutatedInvoice.lines = [{ ...mutatedInvoice.lines[0], unitPrice: 19_000_000 }];
  mutatedInvoice.updatedAt = "2026-09-13T00:00:00.000Z";
  apMutationState.revision = 2;

  return {
    tenantId: JUDGE_TENANT_ID, erpState, apMutationState, snapshot: snapshotResult.value,
    initialTermsA, candidateTermsA, collisionTermsB, constraints: constraintResult.value, policy,
    initialResult: compile(initialTermsA), candidateResult: compile(candidateTermsA),
    expected: { openingCashRupiah: rupiah(30_000_000n), existingPayableRupiah: rupiah(18_000_000n), mutatedPayableRupiah: rupiah(19_000_000n),
      existingReceivableRupiah: rupiah(20_000_000n), minimumCashRupiah: rupiah(5_000_000n), revenueRupiah: rupiah(60_000_000n),
      directCostRupiah: rupiah(42_000_000n), maximumDepositBps: 4_000 },
  };
}
