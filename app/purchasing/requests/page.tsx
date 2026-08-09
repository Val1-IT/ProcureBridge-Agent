"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { LineItemsEditor } from "@/components/erp/line-items-editor";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { compareSupplierQuotations, createPurchaseRequest, createRequestForQuotation, createSupplierQuotation, selectSupplierQuotation } from "@/lib/erp/commands/purchasing";
import { authorize } from "@/lib/erp/permissions";
import { buildPurchaseRequestRows } from "@/lib/erp/purchasing-view-model";
import type { QuantityLine } from "@/lib/erp/types";
import { formatCurrency, formatDate } from "@/lib/format";

export default function PurchaseRequestsPage() {
  const { state } = useDemoStore();
  const { run } = useErpCommands();
  const selectedPurchaseRequestId = useSearchParams().get("purchaseRequestId");
  const [lines, setLines] = useState<QuantityLine[]>([]);
  const [quotationRfqId, setQuotationRfqId] = useState("");
  const [quotationSupplierId, setQuotationSupplierId] = useState("");
  const [quotationLines, setQuotationLines] = useState<QuantityLine[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const rows = useMemo(() => buildPurchaseRequestRows(state.erp).filter((row) => (!selectedPurchaseRequestId || row.id === selectedPurchaseRequestId) && (statusFilter === "all" || row.status === statusFilter)), [selectedPurchaseRequestId, state.erp, statusFilter]);
  const canWrite = authorize(state.erp.activeRole, "purchase.write");
  const canApprove = authorize(state.erp.activeRole, "purchase.approve");

  const createRequest = () => {
    const result = run((erp) => createPurchaseRequest(erp, state.erp.activeRole, { lines }, new Date().toISOString()));
    if (!result.ok) return setMessage({ tone: "error", text: result.error.message });
    setLines([]);
    setMessage({ tone: "success", text: `${result.value.requestNumber} dibuat sebagai Demo Data.` });
  };

  const createRfq = (purchaseRequestId: string) => {
    const request = state.erp.purchaseRequests.find((item) => item.id === purchaseRequestId);
    if (!request) return;
    const result = run((erp) => createRequestForQuotation(erp, state.erp.activeRole, {
      purchaseRequestId,
      supplierIds: erp.suppliers.filter((supplier) => supplier.active).map((supplier) => supplier.id),
      quoteDueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      lines: request.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    }, new Date().toISOString()));
    setMessage(result.ok ? { tone: "success", text: `${result.value.rfqNumber} dibuat dan menunggu quotation supplier.` } : { tone: "error", text: result.error.message });
  };

  const chooseRfq = (rfqId: string) => {
    setQuotationRfqId(rfqId);
    const rfq = state.erp.requestForQuotations.find((item) => item.id === rfqId);
    const firstSupplier = rfq?.requestedSupplierIds.find((id) => !state.erp.supplierQuotations.some((quote) => quote.requestForQuotationId === rfqId && quote.supplierId === id)) ?? "";
    setQuotationSupplierId(firstSupplier);
    setQuotationLines(rfq?.lines.map((line) => ({ ...line, unitPrice: state.erp.products.find((product) => product.id === line.productId)?.purchasePrice ?? 0 })) ?? []);
  };

  const saveQuotation = () => {
    const result = run((erp) => createSupplierQuotation(erp, state.erp.activeRole, {
      requestForQuotationId: quotationRfqId,
      supplierId: quotationSupplierId,
      validUntil: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      lines: quotationLines,
    }, new Date().toISOString()));
    if (!result.ok) return setMessage({ tone: "error", text: result.error.message });
    setQuotationRfqId(""); setQuotationSupplierId(""); setQuotationLines([]);
    setMessage({ tone: "success", text: `${result.value.quotationNumber} dicatat melalui command purchasing.` });
  };

  const compare = (rfqId: string) => {
    const result = run((erp) => compareSupplierQuotations(erp, state.erp.activeRole, rfqId, new Date().toISOString()));
    setMessage(result.ok ? { tone: "success", text: "Quotation dibandingkan berdasarkan total, masa berlaku, dan kode supplier." } : { tone: "error", text: result.error.message });
  };

  const selectQuotation = (quotationId: string) => {
    const result = run((erp) => selectSupplierQuotation(erp, state.erp.activeRole, quotationId, new Date().toISOString()));
    setMessage(result.ok ? { tone: "success", text: `${result.value.quotationNumber} dipilih dengan approval dan audit.` } : { tone: "error", text: result.error.message });
  };

  return <>
    <PageHeader eyebrow="Purchasing â€¢ Demo Data" title="Purchase Requests & RFQ" description="Buat kebutuhan pembelian, minta quotation, bandingkan penawaran, dan pilih supplier melalui command yang diaudit." />
    {message ? <div className={`form-message ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div> : null}
    <div className="purchasing-layout">
      <section className="panel purchasing-main">
        <div className="panel-title"><div><h2>Request dan sourcing</h2><p className="body-copy">RFQ, quotation, dan PO tetap terhubung ke request asal.</p></div><label className="field compact-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Semua</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></label></div>
        <div className="table-panel"><table className="data-table purchasing-table"><thead><tr><th>Request</th><th>Total</th><th>RFQ</th><th>Quotation comparison</th><th>PO</th><th>Aksi</th></tr></thead><tbody>{rows.map((row) => <tr className={row.id === selectedPurchaseRequestId ? "query-highlight" : undefined} aria-current={row.id === selectedPurchaseRequestId ? "true" : undefined} key={row.id}><td><span className="cell-title mono">{row.requestNumber}</span><span className="cell-sub">{row.lineCount} item â€¢ {row.requesterRole}</span><StatusChip tone={row.status === "approved" ? "green" : "amber"}>{row.status}</StatusChip></td><td className="mono">{formatCurrency(row.totalAmount)}</td><td>{row.rfqNumber ? <><span className="cell-title mono">{row.rfqNumber}</span><span className="cell-sub">{row.rfqStatus} â€¢ {row.quotationCount} quotation</span></> : <span className="cell-sub">Belum dibuat</span>}</td><td>{row.quotationComparison.length ? <div className="comparison-stack">{row.quotationComparison.map((quote) => <div className={quote.selected ? "comparison-row selected" : "comparison-row"} key={quote.id}><span>#{quote.rank} {quote.supplierName}</span><strong>{formatCurrency(quote.totalAmount)}</strong><small>Valid {formatDate(quote.validUntil)}</small>{row.rfqStatus === "compared" ? <button className="button button-secondary" type="button" disabled={!canApprove} onClick={() => selectQuotation(quote.id)}>Pilih</button> : null}</div>)}</div> : <span className="cell-sub">Belum dibandingkan</span>}</td><td>{row.linkedPurchaseOrderNumber ?? "â€”"}</td><td><div className="table-actions">{!row.rfqNumber ? <button className="button button-secondary" type="button" disabled={!canWrite} onClick={() => createRfq(row.id)}>Buat RFQ</button> : null}{row.rfqNumber && row.rfqStatus === "open" ? <button className="button button-secondary" type="button" disabled={!canWrite} onClick={() => chooseRfq(state.erp.requestForQuotations.find((item) => item.purchaseRequestId === row.id)!.id)}>Catat quotation</button> : null}{row.rfqStatus === "open" && row.quotationCount >= 2 ? <button className="button" type="button" disabled={!canWrite} onClick={() => compare(state.erp.requestForQuotations.find((item) => item.purchaseRequestId === row.id)!.id)}>Bandingkan</button> : null}</div></td></tr>)}</tbody></table>{rows.length === 0 ? <div className="empty-state"><strong>Dokumen terhubung tidak ditemukan pada filter ini.</strong><p>Periksa link atau ubah filter status.</p></div> : null}</div>
      </section>
      <aside className="purchasing-side-stack">
        <section className="panel"><div className="panel-title"><div><h2>Purchase request baru</h2><p className="body-copy">Draft tidak membuat PO atau approval otomatis.</p></div></div><LineItemsEditor products={state.erp.products} lines={lines} onChange={setLines} readOnly={!canWrite} /><button className="button button-full" type="button" disabled={!canWrite || lines.length === 0} onClick={createRequest}>Simpan draft request</button></section>
        {quotationRfqId ? <section className="panel"><div className="panel-title"><div><h2>Catat supplier quotation</h2><p className="body-copy">Harga dan masa berlaku berasal dari input operator.</p></div></div><label className="field"><span>Supplier peserta RFQ</span><select value={quotationSupplierId} onChange={(event) => setQuotationSupplierId(event.target.value)}>{state.erp.requestForQuotations.find((item) => item.id === quotationRfqId)?.requestedSupplierIds.filter((supplierId) => !state.erp.supplierQuotations.some((quote) => quote.requestForQuotationId === quotationRfqId && quote.supplierId === supplierId)).map((supplierId) => <option key={supplierId} value={supplierId}>{state.erp.suppliers.find((supplier) => supplier.id === supplierId)?.name}</option>)}</select></label><LineItemsEditor products={state.erp.products} lines={quotationLines} onChange={setQuotationLines} /><div className="entity-form-actions"><button className="button" type="button" onClick={saveQuotation}>Simpan quotation</button><button className="button button-secondary" type="button" onClick={() => setQuotationRfqId("")}>Batal</button></div></section> : null}
      </aside>
    </div>
  </>;
}
