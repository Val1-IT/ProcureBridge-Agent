"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { approveStockAdjustment, proposeStockAdjustment } from "@/lib/erp/commands/inventory";
import { authorize } from "@/lib/erp/permissions";

export default function StockAdjustmentsPage() {
  const { state } = useDemoStore();
  const { run } = useErpCommands();
  const selectedAdjustmentId = useSearchParams().get("adjustmentId");
  const visibleAdjustments = selectedAdjustmentId ? state.erp.stockAdjustments.filter((item) => item.id === selectedAdjustmentId) : state.erp.stockAdjustments;
  const [productId, setProductId] = useState(state.erp.products[0]?.id ?? "");
  const [quantityDelta, setQuantityDelta] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const mayPropose = authorize(state.erp.activeRole, "stock.adjust");
  const mayApprove = authorize(state.erp.activeRole, "stock.adjust.approve");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = run((erp) => proposeStockAdjustment(erp, erp.activeRole, { productId, quantityDelta: Number(quantityDelta), reason }, new Date().toISOString()));
    setMessage(result.ok ? `${result.value.adjustmentNumber} proposed without changing stock.` : result.error.message);
    if (result.ok) { setQuantityDelta(""); setReason(""); }
  }

  function approve(adjustmentId: string) {
    const result = run((erp) => approveStockAdjustment(erp, erp.activeRole, adjustmentId, new Date().toISOString()));
    setMessage(result.ok ? `${result.value.adjustmentNumber} approved and posted.` : result.error.message);
  }

  return <>
    <PageHeader eyebrow="Inventory • Demo Data" title="Stock Adjustments" description="Use a signed whole-number delta: positive adds physical stock and negative removes it. Proposals never change stock." />
    {message ? <div className="operational-note" role="status">{message}</div> : null}
    <div className="purchasing-layout"><section className="panel purchasing-main"><div className="panel-title"><div><h2>Adjustment queue</h2><p className="body-copy">A distinct approval role must approve each pending proposal.</p></div><StatusChip tone="amber">Controlled posting</StatusChip></div>
      <div className="table-panel"><table className="data-table"><thead><tr><th>Adjustment</th><th>Product</th><th>Signed delta</th><th>Reason</th><th>Proposed by</th><th>Status</th><th>Action</th></tr></thead><tbody>{visibleAdjustments.map((adjustment) => { const product = state.erp.products.find((item) => item.id === adjustment.productId); const canApproveThis = mayApprove && adjustment.status === "pending" && adjustment.proposedByRole !== state.erp.activeRole; return <tr key={adjustment.id} aria-current={adjustment.id === selectedAdjustmentId ? "true" : undefined}><td className="mono">{adjustment.adjustmentNumber}</td><td>{product?.name ?? adjustment.productId}</td><td><strong>{adjustment.quantityDelta > 0 ? `+${adjustment.quantityDelta}` : adjustment.quantityDelta}</strong></td><td>{adjustment.reason}</td><td>{adjustment.proposedByRole}</td><td><StatusChip tone={adjustment.status === "approved" ? "green" : "amber"}>{adjustment.status}</StatusChip></td><td>{canApproveThis ? <button className="button button-secondary" type="button" onClick={() => approve(adjustment.id)}>Approve adjustment</button> : adjustment.status === "pending" ? <span className="cell-subtitle">Role approver diperlukan</span> : <span className="cell-subtitle">Posted</span>}</td></tr>; })}</tbody></table>{visibleAdjustments.length === 0 ? <div className="empty-state"><strong>No adjustment proposals.</strong><p>Submit a signed variance with an explicit reason.</p></div> : null}</div>
    </section><aside className="panel purchasing-form"><div className="panel-title"><div><h2>Propose adjustment</h2><p className="body-copy">Warehouse proposes; Approver posts. The command boundary enforces both roles.</p></div></div><form className="entity-form-grid" onSubmit={submit}><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)} disabled={!mayPropose}>{state.erp.products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Signed quantity delta<input aria-label="Signed quantity delta" type="number" step="1" value={quantityDelta} onChange={(event) => setQuantityDelta(event.target.value)} placeholder="Example: -2 or 5" disabled={!mayPropose} /></label><label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={!mayPropose} /></label><button className="button button-full" type="submit" disabled={!mayPropose}>Propose without posting</button></form>{!mayPropose ? <div className="operational-note">Warehouse role is required to propose an adjustment.</div> : null}</aside></div>
  </>;
}
