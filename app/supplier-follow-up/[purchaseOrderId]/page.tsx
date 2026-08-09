"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ApprovalForm } from "@/components/supplier-call/approval-form";
import { GuardrailPanel } from "@/components/supplier-call/guardrail-panel";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { saveSupplierCallApproval, type SaveSupplierCallApprovalInput } from "@/lib/erp/commands/supplier-calls";
import { recordSupplierCallStarted } from "@/lib/erp/commands/supplier-results";
import { evaluateSupplierCallEligibility } from "@/lib/erp/guardrails/supplier-call";
import { authorize } from "@/lib/erp/permissions";
import { selectAvailableStock } from "@/lib/erp/selectors";
import type { CreateSupplierCallResult } from "@/lib/supplier-call/types";
import { formatCurrency } from "@/lib/format";

function callIdForPurchaseOrder(purchaseOrderId: string): string {
  return purchaseOrderId === "po-router-replenishment" ? "supplier-call-po-1" : `supplier-call-${purchaseOrderId}`;
}

function jakartaDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function SupplierFollowUpBriefPage() {
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>();
  const router = useRouter();
  const { state } = useDemoStore();
  const { run } = useErpCommands();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const purchaseOrder = state.erp.purchaseOrders.find((item) => item.id === purchaseOrderId);
  const supplier = state.erp.suppliers.find((item) => item.id === purchaseOrder?.supplierId);
  const callId = callIdForPurchaseOrder(purchaseOrderId);
  const call = state.erp.supplierCalls.find((item) => item.id === callId) ?? null;
  const approval = state.erp.supplierApprovals.find((item) => item.supplierCallId === callId) ?? null;
  const callsToday = state.erp.supplierCalls.filter((item) => item.purchaseOrderId === purchaseOrderId && item.calledLocalDate === jakartaDate()).length;
  const openDispute = state.erp.disputes.some((item) => item.purchaseOrderId === purchaseOrderId && ["open", "investigating"].includes(item.status));
  const decision = useMemo(() => purchaseOrder && supplier ? evaluateSupplierCallEligibility({ supplier, purchaseOrder, approval, localTime: approval?.callTime ?? "00:00", callsToday, openDispute }) : null, [approval, callsToday, openDispute, purchaseOrder, supplier]);
  if (!purchaseOrder || !supplier || !decision) return <div className="empty-state"><strong>Purchase Order was not found.</strong><p>Open the supplier brief from the follow-up queue.</p><Link className="button" href="/purchasing/follow-up">Return to queue</Link></div>;

  const impactedOrders = state.erp.salesOrders.filter((order) => order.lines.some((line) => purchaseOrder.lines.some((poLine) => poLine.productId === line.productId) && selectAvailableStock(state.erp, line.productId) < line.quantity));
  const save = (input: SaveSupplierCallApprovalInput) => {
    const result = run((current) => saveSupplierCallApproval(current, current.activeRole, input, new Date().toISOString()));
    setError(result.ok ? null : result.error.message);
  };
  const start = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/supplier-calls?forceMock=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callId, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id }) });
      const payload = await response.json() as { call?: CreateSupplierCallResult; error?: string };
      if (!response.ok || !payload.call) throw new Error(payload.error ?? "Unable to start supplier simulation.");
      const recorded = run((current) => recordSupplierCallStarted(current, current.activeRole, callId, payload.call!, jakartaDate(), new Date().toISOString()));
      if (!recorded.ok) throw new Error(recorded.error.message);
      router.push(`/supplier-calls/${callId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start supplier simulation."); }
    finally { setBusy(false); }
  };
  const total = purchaseOrder.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  return <>
    <PageHeader eyebrow="Supplier Agent • Demo Data" title="Supplier Brief" description={`${purchaseOrder.orderNumber} • ${supplier.name}. Review the operational impact and approve exact call boundaries before the Mock provider can start.`} actions={<><StatusChip tone="amber">Simulation</StatusChip><Link className="button button-secondary" href="/purchasing/follow-up">Back to queue</Link></>} />
    <section className="result-layout">
      <div className="call-side-stack">
        <article className="brief-card"><div className="panel-title"><h2>Customer impact</h2><span>DEMO DATA</span></div><div className="brief-list"><div className="brief-row"><span>Affected sales orders</span><p>{impactedOrders.length ? impactedOrders.map((order) => order.orderNumber).join(", ") : "No linked shortage detected"}</p></div><div className="brief-row"><span>PO value</span><p>{formatCurrency(total)}</p></div></div></article>
        <article className="brief-card"><div className="panel-title"><h2>Supplier history</h2><span>{state.erp.supplierCalls.filter((item) => item.supplierId === supplier.id).length} CALLS</span></div><div className="brief-list"><div className="brief-row"><span>Contact policy</span><p>{supplier.doNotContact ? "Do Not Contact" : "Contact permitted within approved hours"}</p></div><div className="brief-row"><span>Open disputes</span><p>{openDispute ? "Requires human resolution" : "None"}</p></div></div></article>
        <article className="brief-card"><div className="panel-title"><h2>Stock shortage</h2><span>OPERATIONAL</span></div><div className="brief-list">{purchaseOrder.lines.map((line) => { const product = state.erp.products.find((item) => item.id === line.productId); const available = selectAvailableStock(state.erp, line.productId); return <div className="brief-row" key={line.productId}><span>{product?.name ?? line.productId}</span><p>Ordered {line.quantity} • Available {available} • Shortage impact {Math.max(0, line.quantity - available)}</p></div>; })}</div></article>
        <article className="brief-card"><div className="panel-title"><h2>Negotiation boundaries</h2><span>HUMAN CONTROL</span></div><div className="brief-list"><div className="brief-row"><span>Permitted</span><p>Delivery dates, partial-delivery availability, and clarification of supplier constraints.</p></div><div className="brief-row"><span>Prohibited</span><p>No ordered quantity, approved unit price, receipt, stock, invoice, or payment may change during the call.</p></div></div></article>
        <article className="brief-card"><div className="panel-title"><h2>Mandatory confirmations</h2><span>BEFORE CLOSE</span></div><ol className="activity-list"><li><span className="activity-dot" /><div><strong>Confirm the exact PO and products</strong><p>No unrelated order may be discussed.</p></div></li><li><span className="activity-dot" /><div><strong>Repeat delivery dates and quantities</strong><p>Every extracted commitment remains pending human review.</p></div></li><li><span className="activity-dot" /><div><strong>Escalate discrepancies</strong><p>The agent cannot approve a price change.</p></div></li></ol></article>
        <GuardrailPanel decision={decision} />
      </div>
      <ApprovalForm callId={callId} purchaseOrder={purchaseOrder} products={state.erp.products} approval={approval} initialScenario={call?.scenario ?? "delivery_commitment"} canApprove={authorize(state.erp.activeRole, "call.approve")} startAllowed={Boolean(call?.status === "draft" && decision.allowed && authorize(state.erp.activeRole, "call.approve"))} busy={busy} error={error} onSave={save} onStart={start} />
    </section>
  </>;
}
