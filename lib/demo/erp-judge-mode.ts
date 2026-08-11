import type { DemoState } from "../domain/types";
import { selectSalesShortage } from "../erp/selectors";
import type { PurchaseRequest } from "../erp/types";
import type { SimulationSpeed } from "./simulation";
import { createErpJudgeSeedState, createSeedState } from "./seed";
import { createDemoSessionId } from "./session";

export const ERP_DEMO_IDS = {
  salesOrderId: "so-router-shortage",
  purchaseRequestId: "purchase-request-router-shortage",
  purchaseOrderId: "po-router-replenishment",
  supplierCallId: "supplier-call-po-1",
} as const;
export const ERP_JUDGE_DEMO_CLOCK_ISO = "2026-08-10T03:00:00.000Z";


export type ErpJudgeStep =
  | "sales_shortage"
  | "purchase_order_approval"
  | "supplier_follow_up"
  | "supplier_call"
  | "supplier_result_review"
  | "goods_receipt"
  | "sales_delivery"
  | "finance_sync"
  | "partial_payment"
  | "audit_evidence";

export interface ErpJudgeSession {
  active: boolean;
  step: ErpJudgeStep;
  simulationSpeed: SimulationSpeed;
  providerMode: "mock";
  presentationFallback: boolean;
  preDemoSnapshot: DemoState;
  demoClockIso: string;
}

export interface StartedErpJudgeSession {
  session: ErpJudgeSession;
  state: DemoState;
}

export const ERP_JUDGE_STEPS: readonly ErpJudgeStep[] = [
  "sales_shortage", "purchase_order_approval", "supplier_follow_up", "supplier_call", "supplier_result_review",
  "goods_receipt", "sales_delivery", "finance_sync", "partial_payment", "audit_evidence",
] as const;

function cloneState(state: DemoState): DemoState { return structuredClone(state); }

function start(state: DemoState, presentationFallback: boolean): StartedErpJudgeSession {
  const simulationSpeed: SimulationSpeed = presentationFallback ? "instant" : "fast_demo";
  const seeded = createErpJudgeSeedState(state.demoSessionId);
  seeded.demo.simulationSpeed = simulationSpeed;
  return {
    session: { active: true, step: "sales_shortage", simulationSpeed, providerMode: "mock", presentationFallback, preDemoSnapshot: cloneState(state), demoClockIso: ERP_JUDGE_DEMO_CLOCK_ISO },
    state: seeded,
  };
}

export function startErpJudgeSession(state: DemoState): StartedErpJudgeSession { return start(state, false); }
export function startPresentationFallback(state: DemoState): StartedErpJudgeSession { return start(state, true); }
export function exitErpJudgeSession(session: ErpJudgeSession): DemoState { return cloneState(session.preDemoSnapshot); }
export function resetErpDemo(state: DemoState, createSessionId: () => string = createDemoSessionId): DemoState { void state; return createSeedState(createSessionId()); }

function guidedShortageRequest(state: DemoState): PurchaseRequest | null {
  const request = state.erp.purchaseRequests.find((item) => item.id === ERP_DEMO_IDS.purchaseRequestId);
  const shortage = selectSalesShortage(state.erp, ERP_DEMO_IDS.salesOrderId);
  if (!request || request.sourceSalesOrderId !== ERP_DEMO_IDS.salesOrderId || request.status !== "approved") return null;
  if (request.lines.length !== shortage.length || !shortage.length) return null;
  return request.lines.every((line) => {
    const demand = shortage.find((item) => item.productId === line.productId);
    return demand?.shortage === line.quantity;
  }) ? request : null;
}

function hasShortagePurchaseRequest(state: DemoState): boolean {
  return guidedShortageRequest(state) !== null;
}

function hasApprovedPurchaseOrder(state: DemoState): boolean {
  const request = guidedShortageRequest(state);
  const order = state.erp.purchaseOrders.find((item) => item.id === ERP_DEMO_IDS.purchaseOrderId);
  if (!request || !order || order.purchaseRequestId !== request.id || !["sent", "confirmed", "partially_received", "fully_received", "completed"].includes(order.status)) return false;
  if (order.lines.length !== request.lines.length) return false;
  return order.lines.every((line) => {
    const demand = request.lines.find((item) => item.productId === line.productId);
    return demand?.quantity === line.quantity && demand.unitPrice === line.unitPrice;
  });
}

function hasStartedSupplierCall(state: DemoState): boolean {
  const call = state.erp.supplierCalls.find((item) => item.id === ERP_DEMO_IDS.supplierCallId);
  const approval = state.erp.supplierApprovals.find((item) => item.supplierCallId === ERP_DEMO_IDS.supplierCallId);
  return approval?.status === "approved" && Boolean(call && ["active", "completed", "ended_early"].includes(call.status));
}

function hasSupplierResult(state: DemoState): boolean {
  const call = state.erp.supplierCalls.find((item) => item.id === ERP_DEMO_IDS.supplierCallId);
  return Boolean(call && ["completed", "ended_early"].includes(call.status) && state.erp.supplierResults.some((result) => result.supplierCallId === call.id));
}

function hasApprovedSupplierResult(state: DemoState): boolean {
  return state.erp.supplierResults.some((result) => result.supplierCallId === ERP_DEMO_IDS.supplierCallId && result.status === "approved");
}

function hasReceiptAndReservation(state: DemoState): boolean {
  const receipt = state.erp.goodsReceipts.some((item) => item.purchaseOrderId === ERP_DEMO_IDS.purchaseOrderId && (item.status === "approved" || item.status === "posted"));
  const order = state.erp.salesOrders.find((item) => item.id === ERP_DEMO_IDS.salesOrderId);
  return receipt && Boolean(order && ["confirmed", "partially_delivered", "fully_delivered", "invoiced", "completed"].includes(order.status));
}

function hasPostedDelivery(state: DemoState): boolean {
  return state.erp.deliveryOrders.some((item) => item.salesOrderId === ERP_DEMO_IDS.salesOrderId && item.status === "posted");
}

function hasBothInvoices(state: DemoState): boolean {
  return state.erp.supplierInvoices.some((item) => item.purchaseOrderId === ERP_DEMO_IDS.purchaseOrderId && item.status !== "cancelled")
    && state.erp.customerInvoices.some((item) => item.salesOrderId === ERP_DEMO_IDS.salesOrderId && item.status !== "cancelled");
}

function hasPartialPayment(state: DemoState): boolean {
  return state.erp.payments.some((payment) => {
    if (payment.status !== "posted") return false;
    const invoice = [...state.erp.supplierInvoices, ...state.erp.customerInvoices].find((item) => item.id === payment.invoiceId);
    return Boolean(invoice && payment.amount > 0 && payment.amount < invoice.totalAmount);
  });
}

export function canAdvanceErpJudgeSession(session: ErpJudgeSession, state: DemoState): boolean {
  if (!session.active) return false;
  switch (session.step) {
    case "sales_shortage": return hasShortagePurchaseRequest(state);
    case "purchase_order_approval": return hasApprovedPurchaseOrder(state);
    case "supplier_follow_up": return hasStartedSupplierCall(state);
    case "supplier_call": return hasSupplierResult(state);
    case "supplier_result_review": return hasApprovedSupplierResult(state);
    case "goods_receipt": return hasReceiptAndReservation(state);
    case "sales_delivery": return hasPostedDelivery(state);
    case "finance_sync": return hasBothInvoices(state);
    case "partial_payment": return hasPartialPayment(state);
    case "audit_evidence": return false;
  }
}

export function advanceErpJudgeSession(session: ErpJudgeSession, state: DemoState): ErpJudgeSession {
  if (!canAdvanceErpJudgeSession(session, state)) return session;
  const index = ERP_JUDGE_STEPS.indexOf(session.step);
  return { ...session, step: ERP_JUDGE_STEPS[Math.min(index + 1, ERP_JUDGE_STEPS.length - 1)] };
}

export function restartErpJudgeSession(session: ErpJudgeSession): StartedErpJudgeSession {
  return start(session.preDemoSnapshot, session.presentationFallback);
}
