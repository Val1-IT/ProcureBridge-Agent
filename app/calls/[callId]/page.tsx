"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { demoTranscripts } from "@/lib/demo/call-scripts";
import { formatDuration } from "@/lib/format";

const stages = ["Disclosure & verifikasi", "Menjelaskan invoice", "Menggali kendala", "Negosiasi komitmen", "Konfirmasi nominal & tanggal", "Penutupan", "Ringkasan kesepakatan"];

export default function CallConsolePage() {
  const params = useParams<{ callId: string }>();
  const router = useRouter();
  const { state, dispatch } = useDemoStore();
  const call = state.calls.find((item) => item.id === params.callId);
  const invoice = state.invoices.find((item) => item.id === call?.invoiceId);
  const customer = state.customers.find((item) => item.id === call?.customerId);
  const callScenario = call?.scenario;
  const transcript = useMemo(() => callScenario ? demoTranscripts[callScenario] : [], [callScenario]);
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(call?.status === "result_pending_review");
  const finishing = useRef(false);

  useEffect(() => {
    if (!call || call.status !== "connecting") return;
    const timer = window.setTimeout(() => dispatch({ type: "UPDATE_CALL_STATUS", callId: call.id, status: "active" }), 700);
    return () => window.clearTimeout(timer);
  }, [call, dispatch]);

  useEffect(() => {
    if (!call || call.status !== "active" || paused || finishing.current) return;
    const nextIndex = call.transcript.length;
    if (nextIndex >= transcript.length) {
      finishing.current = true;
      const result = state.pendingResults.find((item) => item.callId === call.id);
      dispatch({ type: "COMPLETE_CALL", callId: call.id, outcome: result?.callOutcome ?? "failed_contact", summary: result?.summary ?? "Panggilan selesai.", sentiment: result?.customerSentiment ?? "neutral" });
      setComplete(true);
      return;
    }
    const timer = window.setTimeout(() => {
      const visible = transcript.slice(0, nextIndex + 1);
      dispatch({ type: "SET_TRANSCRIPT", callId: call.id, transcript: visible });
      dispatch({ type: "UPDATE_CALL_STATUS", callId: call.id, status: "active", durationSeconds: visible.at(-1)?.offsetSeconds ?? 0 });
    }, state.demo.fastMode ? 750 : 5000);
    return () => window.clearTimeout(timer);
  }, [call, paused, transcript, state.demo.fastMode, state.pendingResults, dispatch]);

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

  const endCall = async () => {
    if (!call || !window.confirm("Akhiri panggilan Demo sekarang? Transcript yang sudah masuk tetap disimpan.")) return;
    await fetch(`/api/calls/${call.id}/end`, { method: "POST" });
    const result = state.pendingResults.find((item) => item.callId === call.id);
    dispatch({ type: "COMPLETE_CALL", callId: call.id, outcome: result?.callOutcome ?? "failed_contact", summary: result?.summary ?? "Panggilan dihentikan operator.", sentiment: result?.customerSentiment ?? "neutral" });
    setComplete(true);
  };

  if (!call || !invoice || !customer) return <div className="empty-state"><strong>Call session belum dibuat.</strong><p>Mulai panggilan dari Invoice Detail setelah approval dan guardrail selesai.</p><button className="button" onClick={() => router.push("/collections")}>Kembali ke queue</button></div>;

  return (
    <>
      <PageHeader eyebrow="CALL-E live console" title={`${customer.companyName} • ${invoice.invoiceNumber}`} description="Transcript tampil bertahap dari MockCallProvider. Seluruh konten di layar ini adalah simulasi berlabel Demo Data." actions={<><StatusChip tone={complete ? "green" : "amber"}>{complete ? "CALL COMPLETED" : paused ? "AI PAUSED" : call.status.toUpperCase()}</StatusChip><span className="call-timer">{formatDuration(call.durationSeconds)}</span></>} />
      <section className="call-layout">
        <article className="call-panel transcript-panel">
          <div className="panel-title"><h2>Live transcript</h2><span>MASKING ACTIVE • DEMO DATA</span></div>
          <div className="transcript-feed" aria-live="polite">
            {call.transcript.length ? call.transcript.map((segment) => <div className={`transcript-line speaker-${segment.speaker.toLowerCase()}`} key={segment.id}><div><span>{segment.speaker}</span><time>{formatDuration(segment.offsetSeconds)}</time></div><p>{segment.text}</p></div>) : <div className="connecting-state"><span className="pulse-ring" /><strong>Menghubungkan melalui {call.provider === "mock" ? "MockCallProvider" : "CALL-E"}…</strong><p>Disclosure AI akan menjadi kalimat pertama.</p></div>}
          </div>
          <div className="call-controls">
            <button className="button button-secondary" disabled={complete} onClick={() => setPaused((value) => !value)}>{paused ? "Resume AI" : "Pause AI"}</button>
            <button className="button" disabled={complete} onClick={takeOver}>Take Over</button>
            <button className="button button-danger" disabled={complete} onClick={endCall}>End Call</button>
            <button className="button button-secondary" disabled={complete} onClick={() => { dispatch({ type: "HUMAN_REVIEW", resultId: `result-${call.scenario === "promise_to_pay" ? "promise" : call.scenario === "invoice_dispute" ? "dispute" : "failed"}`, actor: "Nadia Pratama" }); router.push(`/calls/${call.id}/result`); }}>Flag Human Review</button>
          </div>
          {complete ? <button className="button button-dark button-full" onClick={() => router.push(`/calls/${call.id}/result`)}>Review structured result →</button> : null}
        </article>
        <aside className="call-side-stack">
          <article className="call-panel">
            <div className="panel-title"><h3>Current stage</h3><span>0{currentStage}/07</span></div>
            <ol className="stage-list">{stages.map((stage, index) => <li className={index + 1 < currentStage ? "done" : index + 1 === currentStage ? "current" : ""} key={stage}><span>{index + 1}</span>{stage}</li>)}</ol>
          </article>
          <article className="call-panel signal-panel">
            <div><span>Sentiment</span><strong>{currentSentiment}</strong></div><div><span>Detected intent</span><strong>{facts[0]?.replace("Intent: ", "")}</strong></div><div><span>Connection</span><strong>{complete ? "ended" : "stable • mock"}</strong></div>
          </article>
          <article className="call-panel">
            <div className="panel-title"><h3>Important entities</h3><span>LIVE EXTRACTION</span></div>
            <div className="entity-list">{facts.map((fact) => <span key={fact}>{fact}</span>)}</div>
            <div className="recommendation"><span>Recommended response</span><p>{call.scenario === "invoice_dispute" ? "Akui penerimaan informasi, hentikan negosiasi, dan jelaskan proses dispute." : call.scenario === "failed_contact" ? "Jangan sebut detail invoice. Konfirmasi waktu callback saja." : "Konfirmasi nominal dan tanggal dengan bahasa eksplisit."}</p></div>
          </article>
          <article className="guardrail-warning"><strong>Guardrails active</strong><p>Dilarang meminta PIN/OTP/kartu, mengancam, mengubah invoice, atau menjanjikan penghapusan denda.</p></article>
        </aside>
      </section>
    </>
  );
}
