"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { validateStructuredResult } from "@/lib/domain/results";
import { buildDemoReport, renderDemoReportMarkdown } from "@/lib/demo/report";
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
  const [copied, setCopied] = useState(false);

  if (!call || !result || !invoice || !customer) return <div className="empty-state"><strong>Structured result is not available.</strong><p>Complete the simulated call first.</p><button className="button" onClick={() => router.push("/collections")}>Return to queue</button></div>;
  const issues = validateStructuredResult(result);
  const reviewed = result.reviewStatus !== "pending";
  const destination = result.callOutcome === "promise_to_pay" ? "/promises" : result.callOutcome === "dispute" ? "/disputes" : "/collections";

  const approve = () => {
    if (issues.length || !window.confirm("Approve this extraction? The relevant tracker and Audit Log will update. The invoice amount will not change.")) return;
    dispatch({ type: "APPROVE_RESULT", resultId: result.id, actor: "Nadia Pratama" });
  };
  const demoReport = () => buildDemoReport(state, call.id);
  const copySummary = async () => {
    await navigator.clipboard.writeText(renderDemoReportMarkdown(demoReport()));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  const download = (format: "json" | "md") => {
    const report = demoReport();
    const content = format === "json" ? JSON.stringify(report, null, 2) : renderDemoReportMarkdown(report);
    const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.invoiceNumber}-demo-report.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader eyebrow="Post-call extraction • Demo Data" title="Review before any financial update." description={`${customer.companyName} • ${invoice.invoiceNumber}. AI converted the conversation into a structured draft; the human decision remains the final gate.`} actions={<StatusChip tone={reviewed ? "green" : "amber"}>{result.reviewStatus.replace("_", " ").toUpperCase()}</StatusChip>} />
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
          {issues.length ? <div className="guardrail-warning"><strong>Human Review required</strong>{issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : null}
          <div className="result-actions">
            <button className="button button-secondary" disabled={reviewed} onClick={() => setEditing((value) => !value)}>{editing ? "Finish Edit" : "Edit extracted result"}</button>
            <button className="button" disabled={reviewed || issues.length > 0} onClick={approve}>Approve result</button>
            <button className="button button-secondary" disabled={reviewed} onClick={() => { if (window.confirm("Send this result to Human Review without updating financial data?")) dispatch({ type: "HUMAN_REVIEW", resultId: result.id, actor: "Nadia Pratama" }); }}>Human Review</button>
            <button className="button button-danger" disabled={reviewed} onClick={() => { if (window.confirm("Reject this extraction? Financial data will not change.")) dispatch({ type: "REJECT_RESULT", resultId: result.id, actor: "Nadia Pratama" }); }}>Reject result</button>
          </div>
          {reviewed ? <button className="button button-dark button-full" onClick={() => router.push(destination)}>View synchronized update →</button> : null}
        </article>
        <aside className="call-side-stack">
          <article className="result-card side-card"><div className="panel-title"><h3>Recording</h3><span>SIMULATION • DEMO DATA</span></div><div className="recording-row"><button className="record-button" aria-label={playing ? "Pause simulated recording" : "Play simulated recording"} onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : "▶"}</button><div><strong>{playing ? "Playing simulation…" : "call-recording-demo.wav"}</strong><span>{call.durationSeconds}s • MockCallProvider</span></div></div></article>
          <article className="result-card side-card"><div className="panel-title"><h3>Transcript</h3><span>{call.transcript.length} SEGMENTS</span></div><div className="mini-transcript">{call.transcript.map((item) => <p key={item.id}><strong>{item.speaker}:</strong> {item.text}</p>)}</div></article>
          <div className="evidence-actions">
            <button className="button button-secondary button-full" onClick={copySummary}>{copied ? "Summary copied" : "Copy Summary"}</button>
            <button className="button button-secondary button-full" onClick={() => download("json")}>Download Demo Report (JSON)</button>
            <button className="button button-secondary button-full" onClick={() => download("md")}>Download Demo Report (Markdown)</button>
            <small>Demo Data • phone and email are masked</small>
          </div>
        </aside>
      </section>
    </>
  );
}
