"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TranscriptConsole } from "@/components/supplier-call/transcript-console";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { completeSupplierCallSimulation, type FinishSupplierCallSimulationInput } from "@/lib/erp/commands/supplier-results";
import type { SimulationSpeed } from "@/lib/demo/simulation";

export default function SupplierCallPage() {
  const { callId } = useParams<{ callId: string }>();
  const router = useRouter();
  const { state, dispatch } = useDemoStore();
  const { run } = useErpCommands();
  const [error, setError] = useState<string | null>(null);
  const call = state.erp.supplierCalls.find((item) => item.id === callId);
  const purchaseOrder = state.erp.purchaseOrders.find((item) => item.id === call?.purchaseOrderId);
  const supplier = state.erp.suppliers.find((item) => item.id === call?.supplierId);
  const complete = useCallback((input: FinishSupplierCallSimulationInput) => {
    if (!call || call.status !== "active") return;
    const result = run((current) => completeSupplierCallSimulation(current, current.activeRole, call.id, input, new Date().toISOString()));
    if (!result.ok) { setError(result.error.message); return; }
    router.replace(`/supplier-calls/${call.id}/result`);
  }, [call, router, run]);
  if (!call || !purchaseOrder || !supplier) return <div className="empty-state"><strong>Supplier call session was not found.</strong><p>Start from an approved Supplier Brief.</p><Link className="button" href="/purchasing/follow-up">Return to queue</Link></div>;
  const setSpeed = (speed: SimulationSpeed) => dispatch({ type: "SET_SIMULATION_SPEED", value: speed });
  const result = state.erp.supplierResults.find((item) => item.supplierCallId === call.id && item.status !== "rejected");
  return <>
    <PageHeader eyebrow="Supplier Agent • Simulation • Demo Data" title="Supplier Call Console" description={`${supplier.name} • ${purchaseOrder.orderNumber}. MockSupplierCallProvider runs a deterministic script with no external credentials or network call.`} actions={<StatusChip tone={call.status === "completed" ? "green" : "amber"}>{call.status.toUpperCase()}</StatusChip>} />
    <section className="call-layout">
      <TranscriptConsole call={call} speed={state.demo.simulationSpeed} onSpeedChange={setSpeed} onComplete={complete} />
      <aside className="call-side-stack">
        <article className="call-panel"><div className="panel-title"><h3>Approved scope</h3><span>HUMAN CONTROL</span></div><dl className="detail-list"><div><dt>Scenario</dt><dd>{call.scenario.replaceAll("_", " ")}</dd></div><div><dt>Provider</dt><dd>MockSupplierCallProvider</dd></div><div><dt>PO status</dt><dd>{purchaseOrder.status}</dd></div></dl></article>
        <article className="call-panel"><div className="panel-title"><h3>Detected entities</h3><span>SIMULATION</span></div><div className="entity-list"><span>PO: {purchaseOrder.orderNumber}</span><span>Products: {purchaseOrder.lines.length}</span><span>Supplier: {supplier.name}</span></div></article>
        <article className="guardrail-warning"><strong>Guardrails remain active</strong><p>No stock, receipt, invoice, payment, ordered quantity, or approved price can change from this console.</p></article>
        {error ? <article className="guardrail-warning"><strong>Simulation stopped</strong><p>{error}</p></article> : null}
        {call.status === "completed" && result ? <Link className="button button-dark button-full" href={`/supplier-calls/${call.id}/result`}>Review structured result →</Link> : null}
      </aside>
    </section>
  </>;
}
