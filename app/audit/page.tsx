"use client";

import { useMemo, useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { buildUnifiedAuditEntries, filterUnifiedAuditEntries } from "@/lib/erp/dashboard";
import { formatDateTime } from "@/lib/format";

export default function AuditPage() {
  const { state } = useDemoStore();
  const [actor, setActor] = useState("");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("");
  const [date, setDate] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const entries = useMemo(() => filterUnifiedAuditEntries(buildUnifiedAuditEntries(state.erp, state.auditLogs), { actor, module, action, date, documentNumber }), [action, actor, date, documentNumber, module, state]);
  return <>
    <PageHeader eyebrow="Control • Demo Data" title="Unified ERP Audit Log" description="ERP command events and the preserved Legacy Recovery history remain traceable in one read-only view." />
    <section className="panel"><div className="erp-toolbar purchasing-filters">
      <label className="field"><span>Actor</span><input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Role or actor ID" /></label>
      <label className="field"><span>Module</span><select value={module} onChange={(event) => setModule(event.target.value)}><option value="all">All modules</option><option value="purchasing">Purchasing</option><option value="inventory">Inventory</option><option value="sales">Sales</option><option value="finance">Finance</option><option value="supplier_agent">Supplier Agent</option><option value="control">Control</option><option value="legacy_recovery">Legacy Recovery</option></select></label>
      <label className="field"><span>Action</span><input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Action contains" /></label>
      <label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="field"><span>Document number</span><input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="PO, GR, SO, invoice…" /></label>
      <span>{entries.length} events</span>
    </div>
    <div className="table-panel"><table className="data-table"><thead><tr><th>Timestamp</th><th>Source / module</th><th>Action</th><th>Document</th><th>Actor</th><th>Safe detail</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{formatDateTime(entry.createdAt)}</td><td><StatusChip tone={entry.source === "legacy_recovery" ? "amber" : "blue"}>{entry.source === "legacy_recovery" ? "Legacy Recovery" : entry.module.replaceAll("_", " ")}</StatusChip></td><td><span className="cell-title">{entry.action}</span><span className="cell-sub mono">{entry.entityType}</span></td><td><span className="cell-title mono">{entry.documentNumber}</span><span className="cell-sub mono">{entry.entityId}</span></td><td>{entry.actor}</td><td><code className="json-cell">{JSON.stringify(entry.detail)}</code></td></tr>)}</tbody></table>{entries.length === 0 ? <div className="empty-state"><strong>No matching audit events.</strong><p>Adjust one or more filters.</p></div> : null}</div>
    </section>
  </>;
}