"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { buildReceiptPreparationRows } from "@/lib/erp/purchasing-view-model";

export default function GoodsReceiptsPage() {
  const { state } = useDemoStore();
  const searchParams = useSearchParams();
  const rows = buildReceiptPreparationRows(state.erp);
  const selected = rows.find((row) => row.purchaseOrderId === searchParams.get("purchaseOrderId") && searchParams.get("mode") === "prepare") ?? null;
  const selectedOrder = selected ? state.erp.purchaseOrders.find((item) => item.id === selected.purchaseOrderId) ?? null : null;
  return <><PageHeader eyebrow="Purchasing â€¢ Demo Data" title="Goods Receipt Queue" description="Siapkan draft hanya untuk PO confirmed atau partially received. Posting stok tetap dikunci sampai command Inventory Task 6 tersedia." />
    <div className="purchasing-layout"><section className="panel purchasing-main"><div className="panel-title"><div><h2>Eligible purchase orders</h2><p className="body-copy">PO sent, fully received, completed, rejected, dan cancelled tidak dapat dipilih.</p></div><StatusChip tone="amber">Preparation only</StatusChip></div><div className="table-panel"><table className="data-table"><thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th>Ordered</th><th>Received</th><th>Outstanding</th><th>Aksi</th></tr></thead><tbody>{rows.map((row) => <tr key={row.purchaseOrderId}><td><Link className="cell-title mono" href={`/purchasing/orders/${row.purchaseOrderId}`}>{row.orderNumber}</Link></td><td>{row.supplierName}</td><td><StatusChip tone="blue">{row.status}</StatusChip></td><td>{row.orderedQuantity}</td><td>{row.receivedQuantity}</td><td>{row.outstandingQuantity}</td><td><Link className="button button-secondary" href={row.prepareHref}>Siapkan draft</Link></td></tr>)}</tbody></table>{rows.length === 0 ? <div className="empty-state"><strong>Tidak ada PO yang eligible.</strong><p>Konfirmasi PO terlebih dahulu melalui command purchasing.</p></div> : null}</div></section>
      <aside className="panel purchasing-form"><div className="panel-title"><div><h2>Draft preparation</h2><p className="body-copy">Memilih PO tidak mengubah ERP state atau stok.</p></div></div>{selected && selectedOrder ? <><dl className="detail-list"><div><dt>Purchase order</dt><dd>{selected.orderNumber}</dd></div><div><dt>Supplier</dt><dd>{selected.supplierName}</dd></div><div><dt>Warehouse</dt><dd>{state.erp.warehouses.find((item) => item.id === selectedOrder.warehouseId)?.name}</dd></div></dl><div className="receipt-draft-lines">{selectedOrder.lines.map((line) => <div key={line.productId}><span>{state.erp.products.find((item) => item.id === line.productId)?.name}</span><strong>Maks. {line.quantity}</strong></div>)}</div><div className="operational-note">{selected.disabledReason}</div><button className="button button-full" type="button" disabled>Post Goods Receipt â€” tersedia di Task 6</button></> : <div className="empty-state compact"><strong>Pilih PO untuk menyiapkan draft.</strong><p>Tidak ada Goods Receipt atau stock movement yang dibuat pada tahap ini.</p></div>}</aside>
    </div>
  </>;
}
