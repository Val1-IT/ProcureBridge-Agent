"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { demoTranscripts } from "@/lib/demo/call-scripts";
import { getSimulationInterval } from "@/lib/demo/simulation";
import { formatDuration } from "@/lib/format";

const stages = ["Disclosure & verification", "Explain invoice", "Explore constraint", "Negotiate commitment", "Confirm amount & date", "Close", "Summarize agreement"];

export default function CallConsolePage() {
  const params = useParams<{ callId: string }>();
  const router = useRouter();
  const { state, dispatch } = useDemoStore();
  const call = state.calls.find((item) => item.id === params.callId);
  const invoice = state.invoices.find((item) => item.id === call?.invoiceId);
  const customer = state.customers.find((item) => item.id === call?.customerId);
  const transcript = useMemo(() => call ? demoTranscripts[call.scenario] : [], [call]);
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(call?.status === "result_pending_review");
  const [fallbackReady, setFallbackReady] = useState(false);
  const finishing = useRef(false);

  useEffect(() => {
    if (!call || call.status !== "connecting") return;
    const timer = window.setTimeout(() => dispatch({ type: "UPDATE_CALL_STATUS", callId: call.id, status: "active" }), 700);
    return () => window.clearTimeout(timer);
  }, [call, dispatch]);

  useEffect(() => {
    if (!call || call.provider !== "mock" || call.status !== "active" || paused || finishing.current) return;
    const result = state.pendingResults.find((item) => item.callId === call.id);
    if (state.demo.simulationSpeed === "instant") {
      finishing.current = true;
      dispatch({ type: "SET_TRANSCRIPT", callId: call.id, transcript });
      dispatch({ type: "UPDATE_CALL_STATUS", callId: call.id, status: "active", durationSeconds: transcript.at(-1)?.offsetSeconds ?? 0 });
      dispatch({ type: "COMPLETE_CALL", callId: call.id, outcome: result?.callOutcome ?? "failed_contact", summary: result?.summary ?? "Instant simulated result completed.", sentiment: result?.customerSentiment ?? "neutral" });
      setComplete(true);
      return;
    }
    const nextIndex = call.transcript.length;
    if (nextIndex >= transcript.length) {
      finishing.current = true;
      dispatch({ type: "COMPLETE_CALL", callId: call.id, outcome: result?.callOutcome ?? "failed_contact", summary: result?.summary ?? "Call completed.", sentiment: result?.customerSentiment ?? "neutral" });
      setComplete(true);
      return;
    }
    const timer = window.setTimeout(() => {
      const visible = transcript.slice(0, nextIndex + 1);
      dispatch({ type: "SET_TRANSCRIPT", callId: call.id, transcript: visible });
      dispatch({ type: "UPDATE_CALL_STATUS", callId: call.id, status: "active", durationSeconds: visible.at(-1)?.offsetSeconds ?? 0 });
    }, getSimulationInterval(state.demo.simulationSpeed));
    return () => window.clearTimeout(timer);
  }, [call, paused, transcript, state.demo.simulationSpeed, state.pendingResults, dispatch]);

  useEffect(() => {
    if (!call || call.provider !== "calle" || complete) return;
    const timer = window.setTimeout(() => setFallbackReady(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [call, complete]);

  const currentStage = Math.max(1, call?.transcript.at(-1)?.stage ?? 1);
  const currentSentiment = call?.transcript.at(-1)?.sentiment ?? "neutral";
  const facts = useMemo(() => {
    if (!call) return [];
    if (call.scenario === "promise_to_pay") return ["Intent: pay_partial", "Amount: Rp7.500.000", "Date: 10 Aug 2026"];
    if (call.scenario === "invoice_dispute") return ["Intent: raise_dispute", "Category: quantity mismatch", "Collection: stop"];
    return ["Intent: PIC unavailable", "Callback: 09:30", "Promise: none"];
  }, [call]);

  const takeOver = () => {
    setPaused(true);
    dispatch({ type: "ADD_AUDIT", audit: { id: `audit-takeover-${Date.now()}`, entityType: "call", entityId: params.callId, action: "operator.take_over", actorType: "human", actorId: "Nadia Pratama", beforeData: { aiPaused: false }, afterData: { aiPaused: true }, createdAt: new Date().toISOString() } });
  };

  const finish = (simulationFallback = false) => {
    if (!call) return;
    const result = state.pendingResults.find((item) => item.callId === call.id);
    if (simulationFallback) {
      dispatch({ type: "SET_TRANSCRIPT", callId: call.id, transcript: call.transcript.length ? call.transcript : transcript });
      dispatch({ type: "ADD_AUDIT", audit: { id: `audit-simulated-fallback-${Date.now()}`, entityType: "call", entityId: call.id, action: "call.completed_with_simulated_result", actorType: "human", actorId: "Nadia Pratama", beforeData: { provider: "calle", status: call.status }, afterData: { provider: "mock-fallback", simulation: true }, createdAt: new Date().toISOString() } });
    }
    dispatch({ type: "COMPLETE_CALL", callId: call.id, outcome: result?.callOutcome ?? "failed_contact", summary: result?.summary ?? "Call ended by operator.", sentiment: result?.customerSentiment ?? "neutral" });
    setComplete(true);
  };

  const endCall = async () => {
    if (!call || !window.confirm("End this call now? The last transcript received will remain preserved.")) return;
    try { await fetch(`/api/calls/${call.id}/end`, { method: "POST" }); } catch { /* Preserve local transcript even when provider termination fails. */ }
    finish(false);
  };

  const completeWithSimulatedResult = () => {
    if (!window.confirm("Complete this stalled live call with a clearly labeled simulated result? The provider failure will remain visible in the audit trail.")) return;
    finish(true);
  };

  if (!call || !invoice || !customer) return <div className="empty-state"><strong>Call session has not been created.</strong><p>Start from Invoice Detail after approval and guardrails pass.</p><button className="button" onClick={() => router.push("/collections")}>Return to queue</button></div>;

  return (
    <>
      <PageHeader eyebrow="CALL-E call console • Demo Data" title={`${customer.companyName} • ${invoice.invoiceNumber}`} description={`${call.provider === "mock" ? "MockCallProvider transcript simulation" : "Live CALL-E provider session"}. The last received transcript is preserved if streaming is interrupted.`} actions={<><StatusChip tone={complete ? "green" : "amber"}>{complete ? "CALL COMPLETED" : paused ? "AI PAUSED" : call.status.toUpperCase()}</StatusChip><span className="call-timer">{formatDuration(call.durationSeconds)}</span></>} />
      <section className="call-layout">
        <article className="call-panel transcript-panel">
          <div className="panel-title"><h2>Live transcript</h2><span>MASKING ACTIVE • {call.provider === "mock" ? "SIMULATION" : "CALL-E"}</span></div>
          <div className="transcript-feed" aria-live="polite">
            {call.transcript.length ? call.transcript.map((segment) => <div className={`transcript-line speaker-${segment.speaker.toLowerCase()}`} key={segment.id}><div><span>{segment.speaker}</span><time>{formatDuration(segment.offsetSeconds)}</time></div><p>{segment.text}</p></div>) : <div className="connecting-state"><span className="pulse-ring" /><strong>Connecting through {call.provider === "mock" ? "MockCallProvider simulation" : "CALL-E"}…</strong><p>AI disclosure is the first scripted sentence.</p></div>}
          </div>
          <div className="call-controls">
            <button className="button button-secondary" disabled={complete} onClick={() => setPaused((value) => !value)}>{paused ? "Resume AI" : "Pause AI"}</button>
            <button className="button" disabled={complete} onClick={takeOver}>Take Over</button>
            <button className="button button-danger" disabled={complete} onClick={endCall}>End Call</button>
            <button className="button button-secondary" disabled={complete} onClick={() => { dispatch({ type: "HUMAN_REVIEW", resultId: `result-${call.scenario === "promise_to_pay" ? "promise" : call.scenario === "invoice_dispute" ? "dispute" : "failed"}`, actor: "Nadia Pratama" }); router.push(`/calls/${call.id}/result`); }}>Flag Human Review</button>
          </div>
          {complete ? <button className="button button-dark button-full" onClick={() => router.push(`/calls/${call.id}/result`)}>Review structured result →</button> : null}
          {fallbackReady && !complete ? <div className="guardrail-warning fallback-panel"><strong>CALL-E event timeout</strong><p>No completion webhook arrived. The last transcript remains preserved.</p><button className="button button-secondary button-full" onClick={completeWithSimulatedResult}>Complete with Simulated Result</button><small>Simulation • provider failure remains auditable</small></div> : null}
        </article>
        <aside className="call-side-stack">
          <article className="call-panel"><div className="panel-title"><h3>Current stage</h3><span>0{currentStage}/07</span></div><ol className="stage-list">{stages.map((stage, index) => <li className={index + 1 < currentStage ? "done" : index + 1 === currentStage ? "current" : ""} key={stage}><span>{index + 1}</span>{stage}</li>)}</ol></article>
          <article className="call-panel signal-panel"><div><span>Sentiment</span><strong>{currentSentiment}</strong></div><div><span>Detected intent</span><strong>{facts[0]?.replace("Intent: ", "")}</strong></div><div><span>Connection</span><strong>{complete ? "ended" : call.provider === "mock" ? "stable • simulation" : "CALL-E live"}</strong></div></article>
          <article className="call-panel"><div className="panel-title"><h3>Important entities</h3><span>{call.provider === "mock" ? "SIMULATED" : "LIVE EXTRACTION"}</span></div><div className="entity-list">{facts.map((fact) => <span key={fact}>{fact}</span>)}</div><div className="recommendation"><span>Recommended response</span><p>{call.scenario === "invoice_dispute" ? "Acknowledge the issue, stop negotiation, and explain dispute review." : call.scenario === "failed_contact" ? "Do not disclose invoice details. Confirm callback timing only." : "Confirm the exact amount and date explicitly."}</p></div></article>
          <article className="guardrail-warning"><strong>Guardrails active</strong><p>Never request PIN, OTP, or card data; threaten; alter an invoice; or promise unauthorized fee relief.</p></article>
        </aside>
      </section>
    </>
  );
}
