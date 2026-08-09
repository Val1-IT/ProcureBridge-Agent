"use client";

import Link from "next/link";
import { useDemoStore } from "@/components/demo-store-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { buildApprovalItems, type ApprovalItem } from "@/lib/erp/dashboard";
import { formatDateTime } from "@/lib/format";

const groups: ReadonlyArray<{ kind: ApprovalItem["kind"]; title: string; description: string }> = [
  { kind: "purchase_order_approval", title: "Purchase Orders", description: "Commercial and scope review before supplier release." },
  { kind: "stock_adjustment_approval", title: "Stock Adjustments", description: "A distinct approval posts the proposed physical-stock variance." },
  { kind: "supplier_result_approval", title: "Supplier Agent Results", description: "Approve, edit, reject, or send structured results to human review." },
];

export default function ApprovalInboxPage() {
  const { state } = useDemoStore();
  const approvals = buildApprovalItems(state.erp, new Date().toISOString());
  return <>
    <PageHeader eyebrow="Control • Demo Data" title="Approval Inbox" description="Pending decisions are derived from Purchase Orders, Stock Adjustments, and Supplier Agent results. Decisions remain enforced by their existing domain commands." />
    {groups.map((group) => { const items = approvals.filter((item) => item.kind === group.kind); return <section className="panel" key={group.kind}><div className="panel-title"><div><h2>{group.title}</h2><p className="body-copy">{group.description}</p></div><StatusChip tone={items.length ? "amber" : "green"}>{items.length} pending</StatusChip></div>
      <div className="table-panel">{items.length ? <table className="data-table"><thead><tr><th>Document</th><th>Decision</th><th>Context</th><th>Created</th><th>Review</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="mono">{item.documentNumber}</td><td>{item.title}</td><td>{item.detail}</td><td>{item.dueAt ? formatDateTime(item.dueAt) : "—"}</td><td><Link className="button" href={item.href}>Open command surface</Link></td></tr>)}</tbody></table> : <div className="empty-state"><strong>No pending {group.title.toLowerCase()}.</strong><p>The inbox is derived and stores no duplicate approval state.</p></div>}</div>
    </section>; })}
  </>;
}