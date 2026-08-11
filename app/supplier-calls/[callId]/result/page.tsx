"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ResultReview } from "@/components/supplier-call/result-review";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import type { EditSupplierResultPatch } from "@/lib/erp/commands/supplier-results";
import { authorize } from "@/lib/erp/permissions";

export default function SupplierCallResultPage() {
  const { callId } = useParams<{ callId: string }>();
  const { state } = useDemoStore();
  const commands = useErpCommands();
  const [error, setError] = useState<string | null>(null);
  const call = state.erp.supplierCalls.find((item) => item.id === callId);
  const result = state.erp.supplierResults.find((item) => item.supplierCallId === callId && item.status !== "rejected") ?? state.erp.supplierResults.find((item) => item.supplierCallId === callId);
  const purchaseOrder = state.erp.purchaseOrders.find((item) => item.id === result?.purchaseOrderId);
  const supplier = state.erp.suppliers.find((item) => item.id === result?.supplierId);
  if (!call || !result || !purchaseOrder || !supplier) return <div className="empty-state"><strong>Structured supplier result is not available.</strong><p>Complete the mock supplier call first.</p><Link className="button" href="/purchasing/follow-up">Return to queue</Link></div>;
  const now = () => new Date().toISOString();
  const edit = async (patch: EditSupplierResultPatch) => { const response = await commands.editSupplierResult(result.id, patch, now()); setError(response.ok ? null : response.error.message); return response.ok; };
  const decide = async (kind: "approve" | "reject" | "human_review") => {
    const response = kind === "approve" ? await commands.approveSupplierResult(result.id, now()) : kind === "reject" ? await commands.rejectSupplierResult(result.id, now()) : await commands.markSupplierResultForHumanReview(result.id, now());
    setError(response.ok ? null : response.error.message);
  };
  const retry = async () => { const response = await commands.retrySupplierResultReview(result.id, now()); setError(response.ok ? null : response.error.message); };
  return <>
    <PageHeader eyebrow="Supplier Agent • Simulation • Demo Data" title="Structured Supplier Result" description={`${supplier.name} • ${purchaseOrder.orderNumber}. Transcript, sentiment, and entities are simulated draft evidence until an authorized human decides.`} actions={<StatusChip tone={result.status === "pending" || result.status === "human_review" ? "amber" : result.status === "approved" ? "green" : "red"}>{result.status.replaceAll("_", " ").toUpperCase()}</StatusChip>} />
    <section className="result-layout">
      <ResultReview result={result} canReview={authorize(state.erp.activeRole, "call.approve")} error={error} onEdit={edit} onApprove={() => decide("approve")} onReject={() => decide("reject")} onHumanReview={() => decide("human_review")} onRetry={retry} />
      <aside className="call-side-stack">
        <article className="result-card side-card"><div className="panel-title"><h3>Transcript</h3><span>SIMULATION • {call.transcript.length} SEGMENTS</span></div><div className="mini-transcript">{call.transcript.map((segment) => <p key={segment.id}><strong>{segment.speaker}:</strong> {segment.text}</p>)}</div></article>
        <article className="result-card side-card"><div className="panel-title"><h3>Detected entities</h3><span>SIMULATION</span></div><div className="entity-list"><span>PO: {purchaseOrder.orderNumber}</span><span>Supplier: {supplier.name}</span><span>Scenario source: {result.sourceScenario.replaceAll("_", " ")}</span><span>Provider: {result.sourceProvider}</span></div></article>
        <article className="result-card side-card"><div className="panel-title"><h3>Sentiment</h3><span>SIMULATION</span></div><strong>{result.sentiment}</strong><p className="body-copy">Provider call ID and source scenario remain immutable when editable fields change.</p></article>
        <Link className="button button-secondary button-full" href={`/purchasing/orders/${purchaseOrder.id}`}>View synchronized PO</Link>
      </aside>
    </section>
  </>;
}
