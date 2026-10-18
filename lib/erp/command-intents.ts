import { createCustomerInvoice, recordPayment, recordSupplierInvoice, type CustomerInvoiceInput, type PaymentInput, type SupplierInvoiceInput } from "./commands/finance";
import { approveGoodsReceipt, approveStockAdjustment, createGoodsReceipt, proposeStockAdjustment, type GoodsReceiptInput, type StockAdjustmentInput } from "./commands/inventory";
import { setActiveRole, upsertCustomer, upsertProduct, upsertSupplier, upsertWarehouse, type CustomerInput, type ProductInput, type SupplierInput, type WarehouseInput } from "./commands/master-data";
import { approveSupplierFollowUp, cancelPurchaseOrder, compareSupplierQuotations, createPurchaseOrder, createPurchaseRequest, createRequestForQuotation, createSupplierQuotation, selectSupplierQuotation, type PurchaseOrderInput, type PurchaseRequestInput, type RequestForQuotationInput, type SupplierQuotationInput } from "./commands/purchasing";
import { cancelSalesOrder, completeDelivery, confirmSalesOrder, createDeliveryOrder, createPurchaseRequestFromShortage, createSalesOrder, type DeliveryOrderInput, type SalesOrderInput } from "./commands/sales";
import { saveSupplierCallApproval, type SaveSupplierCallApprovalInput } from "./commands/supplier-calls";
import { approveSupplierResult, completeSupplierCallSimulation, editSupplierResult, markSupplierResultForHumanReview, recordSupplierCallStarted, rejectSupplierResult, retrySupplierResultReview, type EditSupplierResultPatch, type FinishSupplierCallSimulationInput } from "./commands/supplier-results";
import type { ErpCommandResult } from "./errors";
import { isValidErpState } from "../demo/persistence";
import { executePurchaseOrderAction, type PurchaseOrderCommandAction } from "./purchasing-view-model";
import { isStrictIsoInstant } from "./date-validation";
import type { CreateSupplierCallResult } from "../supplier-call/types";
import type { DeliveryOrder, ErpCustomer, ErpFollowUp, ErpRole, ErpState, GoodsReceipt, Payment, Product, PurchaseOrder, PurchaseRequest, RequestForQuotation, SalesOrder, StockAdjustment, Supplier, SupplierCall, SupplierCallApproval, SupplierCallResult, SupplierQuotation, TradeInvoice, Warehouse } from "./types";
import type { SupplierQuotationComparisonItem } from "./selectors";

export type CommitErpState = (expectedRevision: number, state: ErpState) => boolean;

export interface ErpCommandExecutor {
  upsertProduct(input: ProductInput, now: string): ErpCommandResult<Product>;
  upsertSupplier(input: SupplierInput, now: string): ErpCommandResult<Supplier>;
  upsertCustomer(input: CustomerInput, now: string): ErpCommandResult<ErpCustomer>;
  upsertWarehouse(input: WarehouseInput, now: string): ErpCommandResult<Warehouse>;
  setActiveRole(nextRole: ErpRole, now: string): ErpCommandResult<ErpRole>;
  createPurchaseRequest(input: PurchaseRequestInput, now: string): ErpCommandResult<PurchaseRequest>;
  createPurchaseOrder(input: PurchaseOrderInput, now: string): ErpCommandResult<PurchaseOrder>;
  createRequestForQuotation(input: RequestForQuotationInput, now: string): ErpCommandResult<RequestForQuotation>;
  createSupplierQuotation(input: SupplierQuotationInput, now: string): ErpCommandResult<SupplierQuotation>;
  compareSupplierQuotations(requestForQuotationId: string, now: string): ErpCommandResult<SupplierQuotationComparisonItem[]>;
  selectSupplierQuotation(quotationId: string, now: string): ErpCommandResult<SupplierQuotation>;
  cancelPurchaseOrder(purchaseOrderId: string, now: string): ErpCommandResult<PurchaseOrder>;
  purchaseOrderAction(action: PurchaseOrderCommandAction, purchaseOrderId: string, now: string): ErpCommandResult<PurchaseOrder>;
  approveSupplierFollowUp(followUpId: string, now: string): ErpCommandResult<ErpFollowUp>;
  createGoodsReceipt(input: GoodsReceiptInput, now: string): ErpCommandResult<GoodsReceipt>;
  approveGoodsReceipt(goodsReceiptId: string, now: string): ErpCommandResult<GoodsReceipt>;
  proposeStockAdjustment(input: StockAdjustmentInput, now: string): ErpCommandResult<StockAdjustment>;
  approveStockAdjustment(stockAdjustmentId: string, now: string): ErpCommandResult<StockAdjustment>;
  createSalesOrder(input: SalesOrderInput, now: string): ErpCommandResult<SalesOrder>;
  confirmSalesOrder(salesOrderId: string, now: string): ErpCommandResult<SalesOrder>;
  cancelSalesOrder(salesOrderId: string, now: string): ErpCommandResult<SalesOrder>;
  createPurchaseRequestFromShortage(salesOrderId: string, now: string): ErpCommandResult<PurchaseRequest>;
  createDeliveryOrder(input: DeliveryOrderInput, now: string): ErpCommandResult<DeliveryOrder>;
  completeDelivery(deliveryOrderId: string, now: string): ErpCommandResult<DeliveryOrder>;
  recordSupplierInvoice(input: SupplierInvoiceInput, now: string): ErpCommandResult<TradeInvoice>;
  createCustomerInvoice(input: CustomerInvoiceInput, now: string): ErpCommandResult<TradeInvoice>;
  recordPayment(input: PaymentInput, now: string): ErpCommandResult<Payment>;
  saveSupplierCallApproval(input: SaveSupplierCallApprovalInput, now: string): ErpCommandResult<SupplierCallApproval>;
  recordSupplierCallStarted(callId: string, providerResult: CreateSupplierCallResult, now: string): ErpCommandResult<SupplierCall>;
  completeSupplierCallSimulation(callId: string, input: FinishSupplierCallSimulationInput, now: string): ErpCommandResult<SupplierCallResult>;
  retrySupplierResultReview(resultId: string, now: string): ErpCommandResult<SupplierCallResult>;
  editSupplierResult(resultId: string, patch: EditSupplierResultPatch, now: string): ErpCommandResult<SupplierCallResult>;
  approveSupplierResult(resultId: string, now: string): ErpCommandResult<SupplierCallResult>;
  rejectSupplierResult(resultId: string, now: string): ErpCommandResult<SupplierCallResult>;
  markSupplierResultForHumanReview(resultId: string, now: string): ErpCommandResult<SupplierCallResult>;
}

function boundaryFailure<T>(state: ErpState, message: string): ErpCommandResult<T> {
  return { ok: false, state, error: { code: "INVALID_STATE", message } };
}

function sameAuditPrefix(before: ErpState, after: ErpState): boolean {
  if (after.auditLogs.length !== before.auditLogs.length + 1) return false;
  return before.auditLogs.every((event, index) => JSON.stringify(event) === JSON.stringify(after.auditLogs[index]));
}

export function createErpCommandExecutor(getLatestErp: () => ErpState, commitErp: CommitErpState): ErpCommandExecutor {
  function execute<T>(command: (state: ErpState, actor: ErpRole) => ErpCommandResult<T>): ErpCommandResult<T> {
    const before = getLatestErp();
    if (!Number.isSafeInteger(before.revision) || before.revision < 0 || before.revision >= Number.MAX_SAFE_INTEGER) {
      return boundaryFailure(before, "ERP revision cannot advance safely.");
    }
    const actor = before.activeRole;
    const result = command(before, actor);
    if (!result.ok) return result.state === before ? result : boundaryFailure(before, "Rejected ERP commands must not mutate state.");
    const audit = result.state.auditLogs.at(-1);
    if (!isStrictIsoInstant(audit?.createdAt) || !isStrictIsoInstant(audit?.updatedAt)) {
      return { ok: false, state: before, error: { code: "INVALID_INPUT", message: "Command time must be a strict ISO instant." } };
    }
    if (result.state.revision !== before.revision + 1 || !sameAuditPrefix(before, result.state) || audit?.actorRole !== actor || !isValidErpState(result.state)) {
      return boundaryFailure(before, "Successful ERP commands require one valid revision and authoritative audit evidence.");
    }
    if (!commitErp(before.revision, result.state)) {
      return { ok: false, state: getLatestErp(), error: { code: "STALE_STATE", message: "ERP state changed before the command could be committed." } };
    }
    return result;
  }

  return {
    upsertProduct: (input, now) => execute((state, actor) => upsertProduct(state, actor, input, now)),
    upsertSupplier: (input, now) => execute((state, actor) => upsertSupplier(state, actor, input, now)),
    upsertCustomer: (input, now) => execute((state, actor) => upsertCustomer(state, actor, input, now)),
    upsertWarehouse: (input, now) => execute((state, actor) => upsertWarehouse(state, actor, input, now)),
    setActiveRole: (nextRole, now) => execute((state) => setActiveRole(state, nextRole, now)),
    createPurchaseRequest: (input, now) => execute((state, actor) => createPurchaseRequest(state, actor, input, now)),
    createPurchaseOrder: (input, now) => execute((state, actor) => createPurchaseOrder(state, actor, input, now)),
    createRequestForQuotation: (input, now) => execute((state, actor) => createRequestForQuotation(state, actor, input, now)),
    createSupplierQuotation: (input, now) => execute((state, actor) => createSupplierQuotation(state, actor, input, now)),
    compareSupplierQuotations: (id, now) => execute((state, actor) => compareSupplierQuotations(state, actor, id, now)),
    selectSupplierQuotation: (id, now) => execute((state, actor) => selectSupplierQuotation(state, actor, id, now)),
    purchaseOrderAction: (action, id, now) => execute((state, actor) => executePurchaseOrderAction(state, actor, action, id, now)),
    cancelPurchaseOrder: (id, now) => execute((state, actor) => cancelPurchaseOrder(state, actor, id, now)),
    approveSupplierFollowUp: (id, now) => execute((state, actor) => approveSupplierFollowUp(state, actor, id, now)),
    createGoodsReceipt: (input, now) => execute((state, actor) => createGoodsReceipt(state, actor, input, now)),
    approveGoodsReceipt: (id, now) => execute((state, actor) => approveGoodsReceipt(state, actor, id, now)),
    proposeStockAdjustment: (input, now) => execute((state, actor) => proposeStockAdjustment(state, actor, input, now)),
    approveStockAdjustment: (id, now) => execute((state, actor) => approveStockAdjustment(state, actor, id, now)),
    createSalesOrder: (input, now) => execute((state, actor) => createSalesOrder(state, actor, input, now)),
    confirmSalesOrder: (id, now) => execute((state, actor) => confirmSalesOrder(state, actor, id, now)),
    cancelSalesOrder: (id, now) => execute((state, actor) => cancelSalesOrder(state, actor, id, now)),
    createPurchaseRequestFromShortage: (id, now) => execute((state, actor) => createPurchaseRequestFromShortage(state, actor, id, now)),
    createDeliveryOrder: (input, now) => execute((state, actor) => createDeliveryOrder(state, actor, input, now)),
    completeDelivery: (id, now) => execute((state, actor) => completeDelivery(state, actor, id, now)),
    recordSupplierInvoice: (input, now) => execute((state, actor) => recordSupplierInvoice(state, actor, input, now)),
    createCustomerInvoice: (input, now) => execute((state, actor) => createCustomerInvoice(state, actor, input, now)),
    recordPayment: (input, now) => execute((state, actor) => recordPayment(state, actor, input, now)),
    saveSupplierCallApproval: (input, now) => execute((state, actor) => saveSupplierCallApproval(state, actor, input, now)),
    recordSupplierCallStarted: (id, providerResult, now) => execute((state, actor) => recordSupplierCallStarted(state, actor, id, providerResult, now)),
    completeSupplierCallSimulation: (id, input, now) => execute((state, actor) => completeSupplierCallSimulation(state, actor, id, input, now)),
    editSupplierResult: (id, patch, now) => execute((state, actor) => editSupplierResult(state, actor, id, patch, now)),
    retrySupplierResultReview: (id, now) => execute((state, actor) => retrySupplierResultReview(state, actor, id, now)),
    approveSupplierResult: (id, now) => execute((state, actor) => approveSupplierResult(state, actor, id, now)),
    rejectSupplierResult: (id, now) => execute((state, actor) => rejectSupplierResult(state, actor, id, now)),
    markSupplierResultForHumanReview: (id, now) => execute((state, actor) => markSupplierResultForHumanReview(state, actor, id, now)),
  };
}
