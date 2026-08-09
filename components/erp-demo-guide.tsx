"use client";

import Link from "next/link";
import { ERP_JUDGE_STEPS, type ErpJudgeStep } from "@/lib/demo/erp-judge-mode";
import { useDemoStore } from "./demo-store-provider";
import { useJudgeDemo } from "./judge-demo-provider";

const guidance: Readonly<Record<ErpJudgeStep, { title: string; body: string; locked: string }>> = {
  sales_shortage: { title: "Sales shortage", body: "Open SO-2026-0001, review the five-unit shortage, then create its linked Purchase Request.", locked: "Create the Purchase Request from this Sales Order to continue." },
  purchase_order_approval: { title: "Approved purchase", body: "Inspect PO-2026-0001. Its released scope is already seeded and overdue for supplier confirmation.", locked: "The Purchase Order must be approved and released before follow-up." },
  supplier_follow_up: { title: "Supplier Agent approval", body: "Open the Supplier Brief, approve the exact products and delivery boundary, then start the mock supplier call.", locked: "Save Human Approval and start the MockSupplierCallProvider session." },
  supplier_call: { title: "Mock supplier call", body: "Run the accelerated deterministic transcript. No external provider or API key is used.", locked: "Complete the simulated call so a structured result exists." },
  supplier_result_review: { title: "Human result review", body: "Check the extracted commitment and approve it before any PO promise or follow-up changes.", locked: "Approve the structured Supplier Agent result to continue." },
  goods_receipt: { title: "Partial goods receipt", body: "Receive 10 routers, approve the Goods Receipt, then return to SO-2026-0001 and confirm its now-covered reservation.", locked: "Post an approved receipt and confirm the seeded Sales Order." },
  sales_delivery: { title: "Partial delivery", body: "Create and post a partial Delivery Order. Inventory and reservation evidence update atomically.", locked: "Post a Delivery Order linked to SO-2026-0001." },
  finance_sync: { title: "Payable and receivable", body: "Record one supplier invoice from the receipt and one customer invoice from the posted delivery.", locked: "Both linked trade invoices are required before payment." },
  partial_payment: { title: "Partial payment", body: "Record a payment smaller than its invoice balance, then verify the remaining balance.", locked: "Record a posted partial payment to continue." },
  audit_evidence: { title: "Synchronized evidence", body: "Open the Dashboard and Unified Audit Log to inspect the complete Demo Data chain.", locked: "" },
};

function hrefForStep(step: ErpJudgeStep, state: ReturnType<typeof useDemoStore>["state"]): string {
  switch (step) {
    case "sales_shortage": return "/sales/orders/so-router-shortage";
    case "purchase_order_approval": return "/purchasing/orders/po-router-replenishment";
    case "supplier_follow_up": return "/supplier-follow-up/po-router-replenishment";
    case "supplier_call": return `/supplier-calls/${state.erp.supplierCalls.find((item) => item.purchaseOrderId === "po-router-replenishment")?.id ?? "supplier-call-po-1"}`;
    case "supplier_result_review": return `/supplier-calls/${state.erp.supplierCalls.find((item) => item.purchaseOrderId === "po-router-replenishment")?.id ?? "supplier-call-po-1"}/result`;
    case "goods_receipt": return state.erp.goodsReceipts.some((item) => item.purchaseOrderId === "po-router-replenishment" && (item.status === "approved" || item.status === "posted")) ? "/sales/orders/so-router-shortage" : "/purchasing/receipts?purchaseOrderId=po-router-replenishment";
    case "sales_delivery": return "/sales/deliveries?salesOrderId=so-router-shortage";
    case "finance_sync": return state.erp.supplierInvoices.some((item) => item.purchaseOrderId === "po-router-replenishment") ? "/finance/receivables" : "/finance/payables";
    case "partial_payment": return "/finance/payments";
    case "audit_evidence": return "/audit";
  }
}

export function ErpDemoGuide() {
  const { state } = useDemoStore();
  const { session, next, exit, restart, canAdvance } = useJudgeDemo();
  if (!session?.active || typeof session.step !== "string") return null;
  const index = ERP_JUDGE_STEPS.indexOf(session.step);
  const copy = guidance[session.step];
  const terminal = session.step === "audit_evidence";
  return (
    <aside className="judge-guide" aria-label="Distributor ERP demo guide">
      <div className="judge-guide-head"><span>{session.presentationFallback ? "Presentation Fallback — Mock Demo Data" : "Distributor ERP Guided Demo"}</span><strong>Step {index + 1} of {ERP_JUDGE_STEPS.length}</strong></div>
      <div className="judge-progress" aria-hidden="true"><span style={{ width: `${((index + 1) / ERP_JUDGE_STEPS.length) * 100}%` }} /></div>
      <p><strong>{copy.title}.</strong> {copy.body}</p>
      {!terminal && !canAdvance ? <small>{copy.locked}</small> : null}
      <div className="judge-actions">
        {terminal ? <><Link className="button" href="/audit">Open Audit Log</Link><Link className="button button-secondary" href="/dashboard">Dashboard</Link></> : <><Link className="button button-secondary" href={hrefForStep(session.step, state)}>Open step</Link><button className="button" disabled={!canAdvance} onClick={next}>Next →</button></>}
        <button className="text-button" onClick={restart}>Restart Demo</button>
        <button className="text-button" onClick={exit}>Exit & Restore</button>
      </div>
    </aside>
  );
}
