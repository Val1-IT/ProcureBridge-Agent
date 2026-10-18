"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { LineItemsEditor } from "@/components/erp/line-items-editor";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { authorize } from "@/lib/erp/permissions";
import { buildPurchaseOrderRows, filterPurchaseOrderRows, selectAvailablePurchaseOrderQuotations, type PurchaseOrderFilters, type PurchaseOrderNextAction } from "@/lib/erp/purchasing-view-model";
import type { PurchaseOrderStatus, QuantityLine } from "@/lib/erp/types";
import { formatCurrency, formatDate } from "@/lib/format";

const nextActionCopy: Readonly<Record<PurchaseOrderNextAction, string>> = { submit: "Ajukan approval", approve: "Approve PO", confirm: "Catat konfirmasi", prepare_receipt: "Siapkan penerimaan", await_approval: "Menunggu approval", await_confirmation: "Menunggu konfirmasi", follow_up: "Supplier follow-up", complete: "Selesaikan PO", none: "Tidak ada aksi" };

export default function PurchaseOrdersPage() {
  const { state: storeState } = useDemoStore(); const commands = useErpCommands();
  const state = useMemo(() => ({ ...storeState, erp: { ...storeState.erp, supplierQuotations: selectAvailablePurchaseOrderQuotations(storeState.erp) } }), [storeState]);

  const [filters, setFilters] = useState<PurchaseOrderFilters>({ status: "all", supplierId: "all", overdue: "all" });
  const [supplierId, setSupplierId] = useState(state.erp.suppliers[0]?.id ?? "");
  const [selectedQuotationId, setSelectedQuotationId] = useState("");
  const [lines, setLines] = useState<QuantityLine[]>([]);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const rows = useMemo(() => filterPurchaseOrderRows(buildPurchaseOrderRows(state.erp, state.erp.activeRole, state.updatedAt), filters), [filters, state]);
  const canWrite = authorize(state.erp.activeRole, "purchase.write");
  const selectedQuotation = state.erp.supplierQuotations.find((item) => item.id === selectedQuotationId && item.status === "selected") ?? null;

  const chooseQuotation = (quotationId: string) => {
    setSelectedQuotationId(quotationId);
    const quotation = state.erp.supplierQuotations.find((item) => item.id === quotationId);
    if (!quotation) return;
    setSupplierId(quotation.supplierId);
    setLines(quotation.lines.map((line) => ({ ...line })));
  };

  const create = async () => {
    const rfq = selectedQuotation ? state.erp.requestForQuotations.find((item) => item.id === selectedQuotation.requestForQuotationId) : null;
    const commandTime = new Date();
    const result = await commands.createPurchaseOrder({
      supplierId,
      purchaseRequestId: rfq?.purchaseRequestId ?? null,
      supplierQuotationId: selectedQuotation?.id ?? null,
      warehouseId: rfq?.warehouseId,
      lines,
      confirmationDueAt: new Date(commandTime.getTime() + 2 * 86_400_000).toISOString(),
    }, commandTime.toISOString());
    if (!result.ok) return setMessage({ tone: "error", text: result.error.message });
    setLines([]); setSelectedQuotationId("");
    setMessage({ tone: "success", text: `${result.value.orderNumber} dibuat sebagai draft Demo Data.` });
  };

  return <><PageHeader eyebrow="Purchasing â€¢ Demo Data" title="Purchase Orders" description="Pantau approval, ekspektasi supplier, progress penerimaan, dan aksi berikutnya dari satu daftar operasional." />{message ? <div className={`form-message ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div> : null}<div className="purchasing-layout">
    <section className="panel purchasing-main"><div className="erp-toolbar purchasing-filters"><label className="field"><span>Status</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as PurchaseOrderStatus | "all" }))}><option value="all">Semua status</option>{["draft","pending_approval","sent","confirmed","partially_received","fully_received","completed","rejected","cancelled"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label><label className="field"><span>Supplier</span><select value={filters.supplierId} onChange={(event) => setFilters((current) => ({ ...current, supplierId: event.target.value }))}><option value="all">Semua supplier</option>{state.erp.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="field"><span>Overdue / follow-up</span><select value={filters.overdue} onChange={(event) => setFilters((current) => ({ ...current, overdue: event.target.value as PurchaseOrderFilters["overdue"] }))}><option value="all">Semua</option><option value="overdue">Overdue</option><option value="follow_up">Perlu follow-up</option><option value="on_track">On track</option></select></label><span>{rows.length} dokumen</span></div><div className="table-panel"><table className="data-table purchasing-table"><thead><tr><th>Nomor dokumen</th><th>Supplier</th><th>Total</th><th>Approval</th><th>Expected date</th><th>Received progress</th><th>Next action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link className="cell-title mono" href={row.detailHref}>{row.orderNumber}</Link><span className="cell-sub">{row.status}</span></td><td>{row.supplierName}</td><td className="mono">{formatCurrency(row.totalAmount)}</td><td><StatusChip tone={row.approvalStatus === "approved" ? "green" : row.approvalStatus === "rejected" ? "red" : "amber"}>{row.approvalStatus}</StatusChip></td><td>{formatDate(row.expectedDate)}{row.overdue ? <span className="cell-sub danger-text">Overdue</span> : null}</td><td><strong>{row.receivedQuantity}/{row.orderedQuantity}</strong><span className="progress-track" aria-label={`${row.receivedPercent}% diterima`}><span style={{ width: `${row.receivedPercent}%` }} /></span></td><td><Link className="button button-secondary" href={row.detailHref}>{nextActionCopy[row.nextAction]}</Link></td></tr>)}</tbody></table>{rows.length === 0 ? <div className="empty-state"><strong>Tidak ada PO pada filter ini.</strong><p>Ubah filter untuk melihat dokumen lain.</p></div> : null}</div></section>
    <aside className="panel purchasing-form"><div className="panel-title"><div><h2>Draft purchase order</h2><p className="body-copy">Gunakan quotation terpilih untuk provenance lengkap, atau buat draft langsung.</p></div></div><label className="field"><span>Quotation terpilih (opsional)</span><select value={selectedQuotationId} disabled={!canWrite} onChange={(event) => chooseQuotation(event.target.value)}><option value="">Draft langsung</option>{state.erp.supplierQuotations.filter((item) => item.status === "selected").map((quote) => <option key={quote.id} value={quote.id}>{quote.quotationNumber} â€¢ {state.erp.suppliers.find((supplier) => supplier.id === quote.supplierId)?.name}</option>)}</select></label><label className="field"><span>Supplier</span><select value={supplierId} disabled={!canWrite || Boolean(selectedQuotation)} onChange={(event) => setSupplierId(event.target.value)}>{state.erp.suppliers.filter((item) => item.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><LineItemsEditor products={state.erp.products} lines={lines} onChange={setLines} readOnly={!canWrite || Boolean(selectedQuotation)} />{selectedQuotation ? <div className="operational-note">Lines dikunci agar sama dengan quotation terpilih.</div> : null}<button className="button button-full" type="button" disabled={!canWrite || lines.length === 0} onClick={create}>Buat draft PO</button></aside>
  </div></>;
}
