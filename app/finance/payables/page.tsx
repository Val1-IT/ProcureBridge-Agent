"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import type { SupplierInvoiceInput } from "@/lib/erp/commands/finance";
import type { ErpCommandResult } from "@/lib/erp/errors";
import { formatCurrency, formatDate } from "@/lib/format";
import { authorize } from "@/lib/erp/permissions";
import { selectPayableRows } from "@/lib/erp/selectors-finance";
import type { TradeInvoice } from "@/lib/erp/types";

type SupplierInvoiceCommand = (input: SupplierInvoiceInput, now: string) => Promise<ErpCommandResult<TradeInvoice>>;

export function executeSupplierInvoiceCreation(command: SupplierInvoiceCommand, input: SupplierInvoiceInput, now: string): Promise<ErpCommandResult<TradeInvoice>> {
  return command(input, now);
}

export default function PayablesPage() {
  const { state } = useDemoStore();
  const commands = useErpCommands();
  const selectedInvoiceId = useSearchParams()?.get("invoiceId") ?? null;
  const rows = selectPayableRows(state.erp);
  const visibleRows = selectedInvoiceId ? rows.filter((row) => row.id === selectedInvoiceId) : rows;
  const usedSources = new Set(state.erp.supplierInvoices.filter((invoice) => invoice.status !== "cancelled").flatMap((invoice) => invoice.sourceDocumentIds));
  const eligible = state.erp.goodsReceipts.filter((receipt) => receipt.status === "approved" && !usedSources.has(receipt.id));
  const [sourceId, setSourceId] = useState(eligible[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("2026-09-08");
  const [message, setMessage] = useState<string | null>(null);
  const mayWrite = authorize(state.erp.activeRole, "finance.write");

  async function createInvoice() {
    const receipt = state.erp.goodsReceipts.find((item) => item.id === sourceId);
    if (!receipt) return;
    const result = await executeSupplierInvoiceCreation(commands.recordSupplierInvoice, { purchaseOrderId: receipt.purchaseOrderId, sourceDocumentIds: [receipt.id], dueDate }, new Date().toISOString());
    setMessage(result.ok ? `${result.value.invoiceNumber} recorded without inventory mutation.` : result.error.message);
    if (result.ok) setSourceId("");
  }

  return <>
    <PageHeader eyebrow="Finance • Demo Data" title="Payables" description="Supplier invoices are derived only from approved Goods Receipt quantities. Finance does not post inventory movements." />
    {message ? <div className="operational-note" role="status">{message}</div> : null}
    <div className="purchasing-layout"><section className="panel purchasing-main"><div className="panel-title"><div><h2>Supplier invoice register</h2><p className="body-copy">Balances exclude cancelled payments and retain source-document evidence.</p></div><StatusChip tone="blue">Demo Data</StatusChip></div><div className="table-panel"><table className="data-table"><thead><tr><th>Invoice</th><th>Counterparty</th><th>Source documents</th><th>Due date</th><th>Original total</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} aria-current={row.id === selectedInvoiceId ? "true" : undefined}><td className="mono">{row.invoiceNumber}</td><td>{row.counterpartyName}</td><td className="mono">{row.sourceDocuments.join(", ")}</td><td>{formatDate(row.dueDate)}</td><td className="mono">{formatCurrency(row.originalTotal)}</td><td className="mono">{formatCurrency(row.paidAmount)}</td><td className="mono">{formatCurrency(row.remainingBalance)}</td><td><StatusChip tone={row.status === "paid" ? "green" : row.status === "partially_paid" ? "amber" : row.status === "cancelled" ? "red" : "blue"}>{row.statusLabel}</StatusChip></td></tr>)}</tbody></table>{visibleRows.length === 0 ? <div className="empty-state"><strong>No supplier invoices yet.</strong><p>Record one from an approved Goods Receipt.</p></div> : null}</div></section><aside className="panel purchasing-form"><div className="panel-title"><div><h2>Record supplier invoice</h2><p className="body-copy">The command derives exact quantities and prices from the selected receipt.</p></div></div><label className="field"><span>Approved Goods Receipt</span><select value={sourceId} disabled={!mayWrite} onChange={(event) => setSourceId(event.target.value)}><option value="">Select receipt</option>{eligible.map((receipt) => <option value={receipt.id} key={receipt.id}>{receipt.receiptNumber} • {state.erp.purchaseOrders.find((order) => order.id === receipt.purchaseOrderId)?.orderNumber}</option>)}</select></label><label className="field"><span>Due date</span><input type="date" value={dueDate} disabled={!mayWrite} onChange={(event) => setDueDate(event.target.value)} /></label><button className="button button-full" type="button" disabled={!mayWrite || !sourceId} onClick={createInvoice}>Record supplier invoice</button>{!mayWrite ? <small>Finance or Admin role is required.</small> : null}</aside></div>
  </>;
}
