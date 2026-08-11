"use client";

import { useEffect, useState } from "react";
import type { EditSupplierResultPatch } from "@/lib/erp/commands/supplier-results";
import type { SupplierCallResult, SupplierCallScenario } from "@/lib/erp/types";

interface ResultReviewProps {
  result: SupplierCallResult;
  canReview: boolean;
  error: string | null;
  onEdit: (patch: EditSupplierResultPatch) => Promise<boolean>;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
  onHumanReview: () => Promise<void>;
  onRetry: () => Promise<void>;
}

export function ResultReview({ result, canReview, error, onEdit, onApprove, onReject, onHumanReview, onRetry }: ResultReviewProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(result);
  useEffect(() => setDraft(result), [result]);
  const reviewed = result.status !== "pending";
  const requiresHumanResolution = result.status === "human_review";
  const update = <K extends keyof EditSupplierResultPatch>(key: K, value: EditSupplierResultPatch[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const ok = await onEdit({ scenario: draft.scenario, promisedDeliveryDate: draft.promisedDeliveryDate, partialDeliveryDate: draft.partialDeliveryDate, remainingDeliveryDate: draft.remainingDeliveryDate, followUpDate: draft.followUpDate, reason: draft.reason, summary: draft.summary, sentiment: draft.sentiment });
    if (ok) setEditing(false);
  };
  return <article className="result-card result-main">
    <div className="result-hero"><div><span className="eyebrow">Structured Supplier Result</span><h2>{result.scenario.replaceAll("_", " ")}</h2></div><div className="confidence"><strong>Simulation</strong><span>Demo Data</span></div></div>
    <label className="field"><span>Scenario</span>{editing ? <select value={draft.scenario} onChange={(event) => update("scenario", event.target.value as SupplierCallScenario)}><option value="delivery_commitment">Delivery commitment</option><option value="partial_delivery">Partial delivery</option><option value="stock_unavailable">Stock unavailable</option><option value="price_discrepancy">Price discrepancy</option><option value="failed_contact">Failed contact</option></select> : <strong>{result.scenario.replaceAll("_", " ")}</strong>}</label>
    <label className="field"><span>Summary</span>{editing ? <textarea value={draft.summary} onChange={(event) => update("summary", event.target.value)} /> : <p className="result-summary">{result.summary}</p>}</label>
    <div className="result-grid">
      <label><span>Promised delivery</span>{editing ? <input type="date" value={draft.promisedDeliveryDate ?? ""} onChange={(event) => update("promisedDeliveryDate", event.target.value || null)} /> : <strong>{result.promisedDeliveryDate ?? "—"}</strong>}</label>
      <label><span>Partial delivery</span>{editing ? <input type="date" value={draft.partialDeliveryDate ?? ""} onChange={(event) => update("partialDeliveryDate", event.target.value || null)} /> : <strong>{result.partialDeliveryDate ?? "—"}</strong>}</label>
      <label><span>Remainder delivery</span>{editing ? <input type="date" value={draft.remainingDeliveryDate ?? ""} onChange={(event) => update("remainingDeliveryDate", event.target.value || null)} /> : <strong>{result.remainingDeliveryDate ?? "—"}</strong>}</label>
      <label><span>Follow-up date</span>{editing ? <input type="date" value={draft.followUpDate ?? ""} onChange={(event) => update("followUpDate", event.target.value || null)} /> : <strong>{result.followUpDate ?? "—"}</strong>}</label>
      <label><span>Sentiment</span>{editing ? <select value={draft.sentiment} onChange={(event) => update("sentiment", event.target.value as SupplierCallResult["sentiment"])}><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="concerned">Concerned</option></select> : <strong>{result.sentiment}</strong>}</label>
      <label><span>Reason</span>{editing ? <input value={draft.reason ?? ""} onChange={(event) => update("reason", event.target.value || null)} /> : <strong>{result.reason ?? "—"}</strong>}</label>
    </div>
    <div className="guardrail-box"><strong>No stock, invoice, or payment change occurs before approval.</strong><p>Approval can update only PO commitment fields, follow-up work, or disputes.</p></div>
    {requiresHumanResolution ? <div className="guardrail-warning"><strong>Human resolution required</strong><p>Retry moves this result back to editable pending review. Reject closes it without downstream application.</p></div> : null}
    {error ? <div className="guardrail-warning"><strong>Review blocked</strong><p>{error}</p></div> : null}
    <div className="result-actions">
      {requiresHumanResolution ? <>
        <button className="button" type="button" disabled={!canReview} onClick={onRetry}>Retry Review</button>
        <button className="button button-danger" type="button" disabled={!canReview} onClick={onReject}>Reject</button>
      </> : <>
        {editing ? <button className="button button-secondary" type="button" onClick={save}>Save Edit</button> : <button className="button button-secondary" type="button" disabled={!canReview || reviewed} onClick={() => setEditing(true)}>Edit</button>}
        <button className="button" type="button" disabled={!canReview || reviewed || editing} onClick={onApprove}>Approve</button>
        <button className="button button-danger" type="button" disabled={!canReview || reviewed || editing} onClick={onReject}>Reject</button>
        <button className="button button-secondary" type="button" disabled={!canReview || reviewed || editing} onClick={onHumanReview}>Human Review</button>
      </>}
    </div>
  </article>;
}
