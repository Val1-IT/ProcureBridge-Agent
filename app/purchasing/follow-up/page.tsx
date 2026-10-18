"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { buildSupplierFollowUpRows } from "@/lib/erp/purchasing-view-model";
import { formatCurrency, formatDateTime } from "@/lib/format";

export default function SupplierFollowUpPage() {
  const { state } = useDemoStore();
  const searchParams = useSearchParams();
  const [priority, setPriority] = useState("all"); const [supplierId, setSupplierId] = useState("all");
  const rows = useMemo(() => buildSupplierFollowUpRows(state.erp, state.updatedAt).filter((row) => (priority === "all" || row.priority === priority) && (supplierId === "all" || row.supplierId === supplierId)), [priority, state, supplierId]);
  const approvalItem = buildSupplierFollowUpRows(state.erp, state.updatedAt).find((row) => row.purchaseOrderId === searchParams.get("purchaseOrderId") && searchParams.get("mode") === "approval") ?? null;
  return <><PageHeader eyebrow="Purchasing â€¢ Supplier Agent â€¢ Demo Data" title="Supplier Follow-up Queue" description="Alasan antrean berasal dari status dan tanggal PO. Setiap item menuju supplier brief dan human approvalâ€”tidak pernah langsung memulai call." />
    <div className={approvalItem ? "purchasing-layout" : undefined}><section className="panel"><div className="erp-toolbar purchasing-filters"><label className="field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">Semua</option><option value="high">High</option><option value="medium">Medium</option></select></label><label className="field"><span>Supplier</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="all">Semua supplier</option>{state.erp.suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label><span>{rows.length} alasan operasional</span></div><div className="table-panel"><table className="data-table purchasing-table"><thead><tr><th>Priority</th><th>PO</th><th>Supplier</th><th>Total</th><th>Reason</th><th>Due</th><th>Next action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><StatusChip tone={row.priority === "high" ? "red" : "amber"}>{row.priority}</StatusChip></td><td><Link className="cell-title mono" href={`/purchasing/orders/${row.purchaseOrderId}`}>{row.orderNumber}</Link></td><td>{row.supplierName}</td><td className="mono">{formatCurrency(row.totalAmount)}</td><td><span className="cell-title">{row.reason}</span><span className="cell-sub mono">{row.reasonCode}</span></td><td>{formatDateTime(row.dueAt)}</td><td><Link className="button" href={row.approvalHref}>Buka Supplier Agent approval</Link><span className="cell-sub">Call tidak dimulai dari queue.</span></td></tr>)}</tbody></table>{rows.length === 0 ? <div className="empty-state"><strong>Tidak ada supplier follow-up.</strong><p>Semua PO pada filter ini sedang on track.</p></div> : null}</div></section>{approvalItem ? <aside className="panel purchasing-form"><div className="panel-title"><div><h2>Supplier Agent approval handoff</h2><p className="body-copy">Tautan lama ini tetap aman dan sekarang meneruskan ke Supplier Brief lengkap.</p></div><StatusChip tone="amber">Approval required</StatusChip></div><dl className="detail-list"><div><dt>PO</dt><dd>{approvalItem.orderNumber}</dd></div><div><dt>Supplier</dt><dd>{approvalItem.supplierName}</dd></div><div><dt>Reason</dt><dd>{approvalItem.reasonCode}</dd></div><div><dt>Priority</dt><dd>{approvalItem.priority}</dd></div></dl><Link className="button button-full" href={`/supplier-follow-up/${approvalItem.purchaseOrderId}`}>Open Supplier Brief</Link></aside> : null}</div>
  </>;
}
