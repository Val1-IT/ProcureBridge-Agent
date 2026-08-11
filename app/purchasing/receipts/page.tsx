"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import type { ErpCommandResult } from "@/lib/erp/errors";
import { authorize } from "@/lib/erp/permissions";
import { buildReceiptPreparationRows, selectReceiptPreparationFromSearchParams, type ReceiptPreparationRow } from "@/lib/erp/purchasing-view-model";
import { selectPhysicalStock } from "@/lib/erp/selectors";
import type { GoodsReceipt } from "@/lib/erp/types";

type ReceiptCreationCommand = (input: { purchaseOrderId: string; lines: Array<{ productId: string; quantity: number }> }, now: string) => Promise<ErpCommandResult<GoodsReceipt>>;
type ReceiptApprovalCommand = (goodsReceiptId: string, now: string) => Promise<ErpCommandResult<GoodsReceipt>>;

export function executeReceiptDraftCreation(command: ReceiptCreationCommand, selected: ReceiptPreparationRow, quantities: Readonly<Record<string, number>>, now: string): Promise<ErpCommandResult<GoodsReceipt>> {
  return command({
    purchaseOrderId: selected.purchaseOrderId,
    lines: selected.lines.map((line) => ({ productId: line.productId, quantity: quantities[line.productId] ?? line.outstandingQuantity })).filter((line) => line.quantity > 0),
  }, now);
}

export async function executeReceiptApproval(command: ReceiptApprovalCommand, goodsReceiptId: string, now: string, navigate: (href: string) => void): Promise<ErpCommandResult<GoodsReceipt>> {
  const result = await command(goodsReceiptId, now);
  if (result.ok) navigate(`/purchasing/receipts?goodsReceiptId=${result.value.id}&purchaseOrderId=${result.value.purchaseOrderId}&status=approved`);
  return result;
}

export default function GoodsReceiptsPage() {
  const { state } = useDemoStore();
  const commands = useErpCommands();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const rows = buildReceiptPreparationRows(state.erp);
  const selected = selectReceiptPreparationFromSearchParams(rows, searchParams);
  const selectedOrder = selected ? state.erp.purchaseOrders.find((item) => item.id === selected.purchaseOrderId) ?? null : null;
  const linkedReceiptId = searchParams.get("goodsReceiptId");
  const linkedReceipt = linkedReceiptId ? state.erp.goodsReceipts.find((receipt) => receipt.id === linkedReceiptId && (receipt.status === "approved" || receipt.status === "posted")) ?? null : null;
  const linkedDraft = linkedReceiptId && searchParams.get("mode") === "prepare" ? state.erp.goodsReceipts.find((receipt) => receipt.id === linkedReceiptId && receipt.purchaseOrderId === searchParams.get("purchaseOrderId") && receipt.status === "draft") ?? null : null;
  const invalidLinkedReceipt = Boolean(linkedReceiptId && !linkedReceipt && !linkedDraft);
  const currentDraft = linkedDraft ?? (draftId ? state.erp.goodsReceipts.find((receipt) => receipt.id === draftId && receipt.status === "draft") ?? null : null);
  const mayReceive = authorize(state.erp.activeRole, "stock.receive");

  async function createDraft() {
    if (!selected) return;
    setError(null);
    const requested = Object.fromEntries(selected.lines.map((line) => [line.productId, Number(quantities[`${selected.purchaseOrderId}:${line.productId}`] ?? line.outstandingQuantity)]));
    const result = await executeReceiptDraftCreation(commands.createGoodsReceipt, selected, requested, new Date().toISOString());
    if (!result.ok) { setError(result.error.message); return; }
    setDraftId(result.value.id);
  }

  async function approveDraft() {
    if (!currentDraft) return;
    setError(null);
    const result = await executeReceiptApproval(commands.approveGoodsReceipt, currentDraft.id, new Date().toISOString(), (href) => router.replace(href));
    if (!result.ok) { setError(result.error.message); return; }
    setDraftId(null);
  }

  return <>
    <PageHeader eyebrow="Purchasing • Demo Data" title="Goods Receipt Queue" description="Prepare a partial or complete draft, preview physical balances, then approve through the atomic inventory command boundary." />
    {error ? <div className="operational-note" role="alert">{error}</div> : <div className="operational-note" role="status">Validation errors will be shown here; failed commands leave receipts, PO status, stock, audit, and revision unchanged.</div>}
    {invalidLinkedReceipt ? <div className="operational-note" role="alert">Goods Receipt is not approved or was not found.</div> : null}
    {linkedReceipt ? <section className="panel"><div className="panel-title"><div><h2>{linkedReceipt.receiptNumber}</h2><p className="body-copy">Approved Goods Receipt and linked purchase order</p></div><StatusChip tone={linkedReceipt.status === "approved" ? "green" : "amber"}>{linkedReceipt.status}</StatusChip></div><div className="erp-toolbar"><Link className="button button-secondary" href={`/purchasing/receipts?goodsReceiptId=${linkedReceipt.id}&purchaseOrderId=${linkedReceipt.purchaseOrderId}&status=approved`}>Approved GR</Link><Link className="button button-secondary" href={`/purchasing/orders/${linkedReceipt.purchaseOrderId}`}>Affected PO</Link></div></section> : null}
    <div className="purchasing-layout"><section className="panel purchasing-main"><div className="panel-title"><div><h2>Eligible purchase orders</h2><p className="body-copy">PO sent, fully received, completed, rejected, and cancelled cannot be received.</p></div><StatusChip tone="blue">Command enabled</StatusChip></div><div className="table-panel"><table className="data-table"><thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th>Ordered</th><th>Received</th><th>Outstanding</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.purchaseOrderId}><td><Link className="cell-title mono" href={`/purchasing/orders/${row.purchaseOrderId}`}>{row.orderNumber}</Link></td><td>{row.supplierName}</td><td><StatusChip tone="blue">{row.status}</StatusChip></td><td>{row.orderedQuantity}</td><td>{row.receivedQuantity}</td><td>{row.outstandingQuantity}</td><td><Link className="button button-secondary" href={row.prepareHref}>Prepare receipt</Link></td></tr>)}</tbody></table>{rows.length === 0 ? <div className="empty-state"><strong>No eligible purchase orders.</strong><p>Confirm a PO through the purchasing command first.</p></div> : null}</div></section>
      <aside className="panel purchasing-form"><div className="panel-title"><div><h2>Receipt preparation</h2><p className="body-copy">Creating a draft does not change stock. Approval posts all validated effects once.</p></div></div>{selected && selectedOrder ? <><dl className="detail-list"><div><dt>Purchase order</dt><dd>{selected.orderNumber}</dd></div><div><dt>Supplier</dt><dd>{selected.supplierName}</dd></div><div><dt>Warehouse</dt><dd>{state.erp.warehouses.find((item) => item.id === selectedOrder.warehouseId)?.name}</dd></div></dl><div className="receipt-draft-lines">{selected.lines.map((line) => { const product = state.erp.products.find((item) => item.id === line.productId); const current = selectPhysicalStock(state.erp, line.productId); const key = `${selected.purchaseOrderId}:${line.productId}`; const requested = Number(quantities[key] ?? line.outstandingQuantity); const previewQuantity = Number.isFinite(requested) ? requested : 0; return <div key={line.productId}><label htmlFor={`receipt-${line.productId}`}>{product?.name}</label><input id={`receipt-${line.productId}`} aria-label={`Receive ${product?.name ?? line.productId}`} type="number" min={0} max={line.outstandingQuantity} step={1} value={quantities[key] ?? String(line.outstandingQuantity)} disabled={Boolean(currentDraft)} onChange={(event) => setQuantities((currentQuantities) => ({ ...currentQuantities, [key]: event.target.value }))} /><strong>Current {current} • Receive {previewQuantity} • After receipt {current + previewQuantity}</strong></div>; })}</div>{currentDraft ? <><div className="operational-note">Draft {currentDraft.receiptNumber} is stock-neutral and ready for approval.</div><button className="button button-full" type="button" disabled={!mayReceive} onClick={approveDraft}>Approve and post Goods Receipt</button></> : <button className="button button-full" type="button" disabled={!mayReceive || selected.outstandingQuantity <= 0} onClick={createDraft}>Create Goods Receipt draft</button>}{!mayReceive ? <div className="operational-note">Warehouse or Admin role is required.</div> : null}</> : <div className="empty-state compact"><strong>Select a PO to prepare a receipt.</strong><p>No Goods Receipt or stock movement is created by selecting a row.</p></div>}</aside>
    </div>
  </>;
}
