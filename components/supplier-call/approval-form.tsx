"use client";

import { useState } from "react";
import type { SaveSupplierCallApprovalInput } from "@/lib/erp/commands/supplier-calls";
import type { Product, PurchaseOrder, SupplierCallApproval, SupplierCallScenario } from "@/lib/erp/types";

interface ApprovalFormProps {
  callId: string;
  purchaseOrder: PurchaseOrder;
  products: Product[];
  approval: SupplierCallApproval | null;
  initialScenario: SupplierCallScenario;
  canApprove: boolean;
  startAllowed: boolean;
  busy: boolean;
  error: string | null;
  onSave: (input: SaveSupplierCallApprovalInput) => void;
  onStart: () => void;
}

export function ApprovalForm({ callId, purchaseOrder, products, approval, initialScenario, canApprove, startAllowed, busy, error, onSave, onStart }: ApprovalFormProps) {
  const [scenario, setScenario] = useState<SupplierCallScenario>(initialScenario);
  const [objective, setObjective] = useState(approval?.objective ?? "Confirm delivery availability, dates, and outstanding quantities.");
  const [maximumDeliveryDate, setMaximumDeliveryDate] = useState(approval?.maximumDeliveryDate ?? "2026-08-20");
  const [partialDeliveryAllowed, setPartialDeliveryAllowed] = useState(approval?.partialDeliveryAllowed ?? true);
  const [maximumUnitPriceIncreasePercent, setMaximumUnitPriceIncreasePercent] = useState(approval?.maximumUnitPriceIncreasePercent ?? 0);
  const [language, setLanguage] = useState(approval?.language ?? "Bahasa Indonesia");
  const [callTime, setCallTime] = useState(approval?.callTime ?? "10:00");
  const [approvedBy, setApprovedBy] = useState(approval?.approvedBy ?? "Nadia Pratama");
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({ supplierCallId: callId, supplierId: purchaseOrder.supplierId, purchaseOrderId: purchaseOrder.id, scenario, objective, permittedProductIds: purchaseOrder.lines.map((line) => line.productId), maximumDeliveryDate, partialDeliveryAllowed, maximumUnitPriceIncreasePercent, language, callTime, approvedBy });
  };
  return <form className="approval-card" onSubmit={save}>
    <div className="panel-title"><div><h2>Human Approval</h2><p className="body-copy">Approval defines the exact scope. It does not contact the supplier.</p></div><span>{approval?.status === "approved" ? "APPROVED" : "REQUIRED"}</span></div>
    <div className="approval-grid">
      <label className="field"><span>Scenario</span><select value={scenario} onChange={(event) => setScenario(event.target.value as SupplierCallScenario)}><option value="delivery_commitment">Delivery commitment</option><option value="partial_delivery">Partial delivery</option><option value="stock_unavailable">Stock unavailable</option><option value="price_discrepancy">Price discrepancy</option><option value="failed_contact">Failed contact</option></select></label>
      <label className="field"><span>Maximum delivery date</span><input type="date" value={maximumDeliveryDate} onChange={(event) => setMaximumDeliveryDate(event.target.value)} /></label>
      <label className="field"><span>Language</span><input value={language} onChange={(event) => setLanguage(event.target.value)} /></label>
      <label className="field"><span>Calling time</span><input type="time" value={callTime} onChange={(event) => setCallTime(event.target.value)} /></label>
      <label className="field"><span>Maximum price increase (%)</span><input min="0" max="100" type="number" value={maximumUnitPriceIncreasePercent} onChange={(event) => setMaximumUnitPriceIncreasePercent(Number(event.target.value))} /></label>
      <label className="field"><span>Approved by</span><input value={approvedBy ?? ""} onChange={(event) => setApprovedBy(event.target.value)} /></label>
    </div>
    <label className="field"><span>Call objective</span><textarea value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
    <label className="checkbox-row"><input type="checkbox" checked={partialDeliveryAllowed} onChange={(event) => setPartialDeliveryAllowed(event.target.checked)} /><span>Partial delivery may be discussed within the approved date boundary.</span></label>
    <div className="brief-row"><span>Permitted products</span><p>{purchaseOrder.lines.map((line) => products.find((product) => product.id === line.productId)?.name ?? line.productId).join(", ")}</p></div>
    {error ? <div className="guardrail-warning"><strong>Action blocked</strong><p>{error}</p></div> : null}
    <div className="approval-actions"><button className="button button-secondary" type="submit" disabled={!canApprove || busy}>Save Approval</button><button className="button" type="button" disabled={!startAllowed || busy} onClick={onStart}>Start Call</button></div>
    {!canApprove ? <small>Approver or Admin role is required at the command boundary.</small> : null}
  </form>;
}
