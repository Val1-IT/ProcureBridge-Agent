"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { validateStructuredResult } from "@/lib/domain/results";
import { formatCurrency, formatDate } from "@/lib/format";

export default function CallResultPage() {
  const params = useParams<{ callId: string }>();
  const router = useRouter();
  const { state, dispatch } = useDemoStore();
  const call = state.calls.find((item) => item.id === params.callId);
  const result = state.pendingResults.find((item) => item.callId === params.callId);
  const invoice = state.invoices.find((item) => item.id === result?.invoiceId);
  const customer = state.customers.find((item) => item.id === result?.customerId);
  const [editing, setEditing] = useState(false);
  const [playing, setPlaying] = useState(false);

  if (!call || !result || !invoice || !customer) return <div className="empty-state"><strong>Structured result belum tersedia.</strong><p>Selesaikan simulasi panggilan terlebih dahulu.</p><button className="button" onClick={() => router.push("/collections")}>Kembali ke queue</button></div>;
  const issues = validateStructuredResult(result);
  const reviewed = result.reviewStatus !== "pending";
  const destination = result.callOutcome === "promise_to_pay" ? "/promises" : result.callOutcome === "dispute" ? "/disputes" : "/collections";

  const approve = () => {
    if (issues.length || !window.confirm("Setujui hasil ekstraksi ini? Tracker terkait dan Audit Log akan diperbarui. Nominal invoice tetap tidak berubah.")) return;
    dispatch({ type: "APPROVE_RESULT", resultId: result.id, actor: "Nadia Pratama" });
  };
  const download = () => {
    const text = [`ARVANTA PROCUREBRIDGE — DEMO CALL SUMMARY`, `Customer: ${customer.companyName}`, `Invoice: ${invoice.invoiceNumber}`, `Outcome: ${result.callOutcome}`, `Summary: ${result.summary}`, `Human review status: ${result.reviewStatus}`].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = `${invoice.invoiceNumber}-demo-call-summary.txt`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader eyebrow="Post-call extraction" title="Review before any financial update." description={`${customer.companyName} • ${invoice.invoiceNumber}. AI telah mengubah percakapan menjadi draft terstruktur; keputusan manusia tetap menjadi gate terakhir.`} actions={<StatusChip tone={reviewed ? "green" : "amber"}>{result.reviewStatus.replace("_", " ").toUpperCase()}</StatusChip>} />
      <section className="result-layout">
        <article className="result-card result-main">
          <div className="result-hero"><div><span className="eyebrow">Call outcome</span><h2>{result.callOutcome.replaceAll("_", " ")}</h2></div><div className="confidence"><strong>{Math.round(result.confidenceScore * 100)}%</strong><span>confidence</span></div></div>
          <p className="result-summary">{result.summary}</p>
          <div className="result-grid">
            <div><span>Contact verified</span><strong>{result.contactVerified ? "Yes" : "No"}</strong></div>
            <div><span>Customer intent</span><strong>{result.customerIntent}</strong></div>
            <div><span>Promised amount</span>{editing ? <input type="number" value={result.promisedAmount ?? 0} onChange={(event) => dispatch({ type: "EDIT_RESULT", resultId: result.id, patch: { promisedAmount: Number(event.target.value) } })} /> : <strong>{result.promisedAmount ? formatCurrency(result.promisedAmount) : "—"}</strong>}</div>
            <div><span>Promised date</span>{editing ? <input type="date" value={result.promisedDate ?? ""} onChange={(event) => dispatch({ type: "EDIT_RESULT", resultId: result.id, patch: { promisedDate: event.target.value || null } })} /> : <strong>{formatDate(result.promisedDate)}</strong>}</div>
            <div><span>Delay reason</span><strong>{result.delayReason ?? "—"}</strong></div>
            <div><span>Dispute category</span><strong>{result.disputeCategory ?? "—"}</strong></div>
            <div><span>Sentiment</span><strong>{result.customerSentiment}</strong></div>
            <div><span>Follow-up date</span>{editing ? <input type="date" value={result.followUpDate ?? ""} onChange={(event) => dispatch({ type: "EDIT_RESULT", resultId: result.id, patch: { followUpDate: event.target.value || null } })} /> : <strong>{formatDate(result.followUpDate)}</strong>}</div>
          </div>
          {issues.length ? <div className="guardrail-warning"><strong>Human review wajib</strong>{issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : null}
          <div className="result-actions">
            <button className="button button-secondary" disabled={reviewed} onClick={() => setEditing((value) => !value)}>{editing ? "Selesai Edit" : "Edit extracted result"}</button>
            <button className="button" disabled={reviewed || issues.length > 0} onClick={approve}>Approve result</button>
            <button className="button button-secondary" disabled={reviewed} onClick={() => { if (window.confirm("Kirim hasil ke Human Review tanpa memperbarui data finansial?")) dispatch({ type: "HUMAN_REVIEW", resultId: result.id, actor: "Nadia Pratama" }); }}>Human Review</button>
            <button className="button button-danger" disabled={reviewed} onClick={() => { if (window.confirm("Tolak hasil ekstraksi? Data finansial tidak akan berubah.")) dispatch({ type: "REJECT_RESULT", resultId: result.id, actor: "Nadia Pratama" }); }}>Reject result</button>
          </div>
          {reviewed ? <button className="button button-dark button-full" onClick={() => router.push(destination)}>Lihat pembaruan tersinkronisasi →</button> : null}
        </article>
        <aside className="call-side-stack">
          <article className="result-card side-card"><div className="panel-title"><h3>Recording</h3><span>DEMO DATA</span></div><div className="recording-row"><button className="record-button" onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : "▶"}</button><div><strong>{playing ? "Memutar simulasi…" : "call-recording-demo.wav"}</strong><span>{call.durationSeconds}s • MockCallProvider</span></div></div></article>
          <article className="result-card side-card"><div className="panel-title"><h3>Transcript</h3><span>{call.transcript.length} SEGMENTS</span></div><div className="mini-transcript">{call.transcript.map((item) => <p key={item.id}><strong>{item.speaker}:</strong> {item.text}</p>)}</div></article>
          <button className="button button-secondary button-full" onClick={download}>Download call summary</button>
        </aside>
      </section>
    </>
  );
}
