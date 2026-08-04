"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { formatDateTime, formatDuration } from "@/lib/format";

export default function ActivityPage() {
  const { state } = useDemoStore();
  const [tab, setTab] = useState<"calls" | "audit">("calls");
  return (
    <>
      <PageHeader eyebrow="Traceability" title="Call Activity & Audit Log" description="Panggilan, approval, perubahan hasil, operator, guardrail, dan request ID tercatat sebagai Demo Data yang dapat ditelusuri." actions={<div className="tab-switch"><button className={tab === "calls" ? "active" : ""} onClick={() => setTab("calls")}>Call activity</button><button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>Audit log</button></div>} />
      {tab === "calls" ? <section className="table-panel">{state.calls.length ? <table className="data-table"><thead><tr><th>Call</th><th>Customer / invoice</th><th>Provider</th><th>Started</th><th>Duration</th><th>Outcome</th><th>Transcript</th><th>Human approval</th><th>Recording</th><th>Request ID</th></tr></thead><tbody>{state.calls.map((call) => { const customer = state.customers.find((item) => item.id === call.customerId); const invoice = state.invoices.find((item) => item.id === call.invoiceId); return <tr key={call.id}><td className="mono">{call.id}</td><td><span className="cell-title">{customer?.companyName}</span><span className="cell-sub">{invoice?.invoiceNumber}</span></td><td><StatusChip tone="blue">{call.provider}</StatusChip></td><td>{formatDateTime(call.startedAt)}</td><td className="mono">{formatDuration(call.durationSeconds)}</td><td>{call.outcome ?? call.status}</td><td>{call.transcript.length} segmen</td><td><span className="cell-title">{call.humanApprovedBy ?? "—"}</span><span className="cell-sub">{formatDateTime(call.humanApprovedAt)}</span></td><td>{call.recordingUrl ? "Available" : "Demo replay"}</td><td className="mono">req_demo_{call.id}</td></tr>; })}</tbody></table> : <div className="empty-state"><strong>Belum ada call activity.</strong><p>Mulai salah satu demo dari Collection Queue.</p></div>}</section> : <section className="table-panel"><table className="data-table"><thead><tr><th>Timestamp</th><th>Action</th><th>Entity</th><th>Actor</th><th>Before</th><th>After</th><th>Guardrail / Request ID</th></tr></thead><tbody>{[...state.auditLogs].reverse().map((log) => <tr key={log.id}><td>{formatDateTime(log.createdAt)}</td><td><span className="cell-title">{log.action}</span><span className="cell-sub">append-only Demo Data</span></td><td><span className="cell-title">{log.entityType}</span><span className="cell-sub mono">{log.entityId}</span></td><td>{log.actorType} • {log.actorId}</td><td><code className="json-cell">{JSON.stringify(log.beforeData)}</code></td><td><code className="json-cell">{JSON.stringify(log.afterData)}</code></td><td><span className="mono">{log.apiRequestId ?? "—"}</span>{log.guardrailViolations?.length ? <span className="cell-sub">{log.guardrailViolations.join(", ")}</span> : null}</td></tr>)}</tbody></table></section>}
    </>
  );
}
