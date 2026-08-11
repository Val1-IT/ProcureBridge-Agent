"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { DocumentStatusTimeline } from "@/components/erp/document-status-timeline";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { canCancelPurchaseOrder } from "@/lib/erp/order-cancellation";
import { buildPurchaseOrderDetailModel, type PurchaseOrderCommandAction, type PurchaseOrderPrimaryAction } from "@/lib/erp/purchasing-view-model";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

const actionCopy: Readonly<Record<PurchaseOrderPrimaryAction, string>> = { submit: "Ajukan approval", approve: "Approve purchase order", confirm: "Catat konfirmasi supplier", prepare_receipt: "Siapkan goods receipt" };

export default function PurchaseOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { state } = useDemoStore(); const commands = useErpCommands();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const model = buildPurchaseOrderDetailModel(state.erp, state.erp.activeRole, orderId, state.updatedAt);
  if (!model) return <><PageHeader eyebrow="Purchasing â€¢ Demo Data" title="Purchase Order tidak ditemukan" description="Dokumen mungkin berubah di halaman lain. Kembali ke daftar untuk memuat state terbaru." /><Link className="button" href="/purchasing/orders">Kembali ke Purchase Orders</Link></>;
  const canCancel = canCancelPurchaseOrder(state.erp, state.erp.activeRole, model.purchaseOrder.id);
  const perform = async (action: PurchaseOrderCommandAction) => {
    const result = await commands.purchaseOrderAction(action, orderId, new Date().toISOString());
    setMessage(result.ok ? { tone: "success", text: `${result.value.orderNumber} berpindah ke ${result.value.status} melalui command ERP.` } : { tone: "error", text: result.error.message });
  };
  const cancel = async () => {
    const result = await commands.cancelPurchaseOrder(orderId, new Date().toISOString());
    setMessage(result.ok ? { tone: "success", text: `${result.value.orderNumber} dibatalkan dan dicatat di audit.` } : { tone: "error", text: result.error.message });
  };

  return <>
    <PageHeader eyebrow="Purchasing â€¢ Purchase Order â€¢ Demo Data" title={model.purchaseOrder.orderNumber} description={`${model.supplier.name} â€¢ ${model.purchaseOrder.status}`} actions={<div className="header-actions"><Link className="button button-secondary" href="/purchasing/orders">Kembali</Link>{model.allowedActions.map((action) => action === "prepare_receipt" ? <Link className="button" href={model.links.receipts} key={action}>{actionCopy[action]}</Link> : <button className="button" type="button" key={action} onClick={() => perform(action)}>{actionCopy[action]}</button>)}{canCancel ? <button className="button button-ghost danger-action" type="button" onClick={cancel}>Batalkan PO</button> : null}</div>} />
    {message ? <div className={`form-message ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div> : null}
    <section className="panel timeline-panel"><DocumentStatusTimeline currentStatus={model.purchaseOrder.status} /></section>
    <div className="detail-grid">
      <div className="detail-main-stack">
        <section className="panel"><div className="panel-title"><div><h2>Lines dan totals</h2><p className="body-copy">Kuantitas diterima berasal dari Goods Receipt berstatus posted.</p></div><strong className="detail-total">{formatCurrency(model.totalAmount)}</strong></div><div className="table-panel"><table className="data-table"><thead><tr><th>Produk</th><th>Qty PO</th><th>Diterima</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>{model.lines.map((line) => <tr key={line.productId}><td><span className="cell-title">{line.product?.name ?? line.productId}</span><span className="cell-sub mono">{line.product?.sku}</span></td><td>{line.quantity}</td><td>{line.receivedQuantity}</td><td className="mono">{formatCurrency(line.unitPrice)}</td><td className="mono">{formatCurrency(line.lineTotal)}</td></tr>)}</tbody></table></div></section>
        <section className="panel"><div className="panel-title"><div><h2>Activity timeline</h2><p className="body-copy">Setiap lifecycle command menambahkan satu audit event.</p></div></div>{model.activity.length ? <ol className="activity-list">{model.activity.map((event) => <li key={event.id}><span className="activity-dot" /><div><strong>{event.action}</strong><p>{event.actorId} â€¢ {formatDateTime(event.createdAt)}</p></div></li>)}</ol> : <div className="empty-state compact"><strong>Belum ada activity.</strong><p>Seed PO tidak memalsukan audit event.</p></div>}</section>
      </div>
      <aside className="detail-side-stack">
        <section className="panel"><div className="panel-title"><h2>Document summary</h2><StatusChip tone={model.row.overdue ? "red" : "green"}>{model.row.overdue ? "Overdue" : "On track"}</StatusChip></div><dl className="detail-list"><div><dt>Supplier</dt><dd>{model.supplier.name}</dd></div><div><dt>Approval</dt><dd>{model.row.approvalStatus}</dd></div><div><dt>Confirmation due</dt><dd>{formatDate(model.purchaseOrder.confirmationDueAt)}</dd></div><div><dt>Promised delivery</dt><dd>{formatDate(model.purchaseOrder.promisedDeliveryDate)}</dd></div><div><dt>Received progress</dt><dd>{model.row.receivedQuantity}/{model.row.orderedQuantity} ({model.row.receivedPercent}%)</dd></div></dl></section>
        <section className="panel"><div className="panel-title"><h2>Linked documents</h2></div><div className="linked-document-list"><Link href={model.links.supplier}>Supplier master</Link>{model.links.request ? <Link href={model.links.request}>Purchase request</Link> : <span>Purchase request â€” tidak terhubung</span>}<Link href={model.links.receipts}>Goods receipts ({model.receipts.length})</Link><Link href={model.links.followUp}>Supplier follow-up</Link><span>Supplier calls ({model.calls.length})</span></div></section>
        <section className="panel"><div className="panel-title"><h2>RFQ & quotation</h2></div>{model.quotation ? <dl className="detail-list"><div><dt>RFQ</dt><dd>{model.quotation.rfqNumber}</dd></div><div><dt>Quotation</dt><dd>{model.quotation.quotationNumber}</dd></div><div><dt>Supplier</dt><dd>{model.quotation.supplierName}</dd></div><div><dt>Comparison rank</dt><dd>#{model.quotation.comparisonRank}</dd></div><div><dt>Quoted total</dt><dd>{formatCurrency(model.quotation.totalAmount)}</dd></div></dl> : <div className="operational-note">PO dibuat langsung tanpa selected quotation provenance.</div>}</section>
        <section className="panel"><div className="panel-title"><h2>Approval activity</h2></div>{model.approvals.length ? model.approvals.map((event) => <div className="approval-line" key={event.id}><strong>{event.action}</strong><span>{event.actorRole} â€¢ {formatDateTime(event.createdAt)}</span></div>) : <div className="operational-note">Seed status adalah Demo Data; tidak ada approval event yang difabrikasi.</div>}</section>
      </aside>
    </div>
  </>;
}
