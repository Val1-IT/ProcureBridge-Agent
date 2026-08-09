"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { createCustomerInvoice, type CustomerInvoiceInput } from "@/lib/erp/commands/finance";
import type { ErpCommandResult } from "@/lib/erp/errors";
import { formatCurrency, formatDate } from "@/lib/format";
import { authorize } from "@/lib/erp/permissions";
import { selectReceivableRows } from "@/lib/erp/selectors-finance";
import type { ErpRole, ErpState, TradeInvoice } from "@/lib/erp/types";

type FinanceCommandRunner = <T,>(command: (state: ErpState) => ErpCommandResult<T>) => ErpCommandResult<T>;

export function executeCustomerInvoiceCreation(run: FinanceCommandRunner, role: ErpRole, input: CustomerInvoiceInput, now: string): ErpCommandResult<TradeInvoice> {
  return run((state) => createCustomerInvoice(state, role, input, now));
}

export default function ReceivablesPage() {
  const { state } = useDemoStore();
  const { run } = useErpCommands();
  const selectedInvoiceId = useSearchParams()?.get("invoiceId") ?? null;
  const rows = selectReceivableRows(state.erp);
  const visibleRows = selectedInvoiceId ? rows.filter((row) => row.id === selectedInvoiceId) : rows;
  const usedSources = new Set(state.erp.customerInvoices.filter((invoice) => invoice.status !== "cancelled").flatMap((invoice) => invoice.sourceDocumentIds));
  const eligible = state.erp.deliveryOrders.filter((delivery) => delivery.status === "posted" && !usedSources.has(delivery.id));
  const [sourceId, setSourceId] = useState(eligible[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("2026-09-08");
  const [message, setMessage] = useState<string | null>(null);
  const mayWrite = authorize(state.erp.activeRole, "finance.write");

  function createInvoice() {
    const delivery = state.erp.deliveryOrders.find((item) => item.id === sourceId);
    if (!delivery) return;
    const result = executeCustomerInvoiceCreation(run, state.erp.activeRole, { salesOrderId: delivery.salesOrderId, sourceDocumentIds: [delivery.id], dueDate }, new Date().toISOString());
    setMessage(result.ok ? `${result.value.invoiceNumber} created from delivered quantities.` : result.error.message);
    if (result.ok) setSourceId("");
  }

  return <>
    <PageHeader eyebrow="Finance • Demo Data" title="Receivables" description="Customer invoices are derived only from posted Delivery Order quantities and remain stock-neutral." />
    {message ? <div className="operational-note" role="status">{message}</div> : null}
    <div className="purchasing-layout"><section className="panel purchasing-main"><div className="panel-title"><div><h2>Customer invoice register</h2><p className="body-copy">Every balance remains traceable to delivered source documents.</p></div><StatusChip tone="blue">Demo Data</StatusChip></div><div className="table-panel"><table className="data-table"><thead><tr><th>Invoice</th><th>Counterparty</th><th>Source documents</th><th>Due date</th><th>Original total</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} aria-current={row.id === selectedInvoiceId ? "true" : undefined}><td className="mono">{row.invoiceNumber}</td><td>{row.counterpartyName}</td><td className="mono">{row.sourceDocuments.join(", ")}</td><td>{formatDate(row.dueDate)}</td><td className="mono">{formatCurrency(row.originalTotal)}</td><td className="mono">{formatCurrency(row.paidAmount)}</td><td className="mono">{formatCurrency(row.remainingBalance)}</td><td><StatusChip tone={row.status === "paid" ? "green" : row.status === "partially_paid" ? "amber" : row.status === "cancelled" ? "red" : "blue"}>{row.statusLabel}</StatusChip></td></tr>)}</tbody></table>{visibleRows.length === 0 ? <div className="empty-state"><strong>No customer invoices yet.</strong><p>Create one from a posted Delivery Order.</p></div> : null}</div></section><aside className="panel purchasing-form"><div className="panel-title"><div><h2>Create customer invoice</h2><p className="body-copy">The selected delivery determines exact billable lines.</p></div></div><label className="field"><span>Posted Delivery Order</span><select value={sourceId} disabled={!mayWrite} onChange={(event) => setSourceId(event.target.value)}><option value="">Select delivery</option>{eligible.map((delivery) => <option value={delivery.id} key={delivery.id}>{delivery.deliveryNumber} • {state.erp.salesOrders.find((order) => order.id === delivery.salesOrderId)?.orderNumber}</option>)}</select></label><label className="field"><span>Due date</span><input type="date" value={dueDate} disabled={!mayWrite} onChange={(event) => setDueDate(event.target.value)} /></label><button className="button button-full" type="button" disabled={!mayWrite || !sourceId} onClick={createInvoice}>Create customer invoice</button>{!mayWrite ? <small>Finance or Admin role is required.</small> : null}</aside></div>
  </>;
}
