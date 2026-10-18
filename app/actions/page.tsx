"use client";

import Link from "next/link";
import { useDemoStore } from "@/components/demo-store-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { buildActionItems, type ActionUrgency } from "@/lib/erp/dashboard";
import type { ErpRole } from "@/lib/erp/types";
import { formatDateTime } from "@/lib/format";
import { useDashboardClock } from "@/components/erp/use-dashboard-clock";
import { sampleDashboardNow } from "@/lib/erp/dashboard-clock";
import type { DemoState } from "@/lib/domain/types";

const roles: readonly ErpRole[] = ["approver", "procurement", "warehouse", "sales", "finance", "admin"];
const urgencyLabels: Record<ActionUrgency, string> = { high: "High urgency", medium: "Medium urgency", low: "Low urgency" };
const roleLabel = (role: ErpRole) => `${role.charAt(0).toUpperCase()}${role.slice(1)}`;

export function ActionCenterContent({ state, now }: { state: DemoState; now: string }) {
  const items = buildActionItems(state.erp, now);
  return <>
    <PageHeader eyebrow="Overview • Demo Data" title="Action Center" description="A derived work queue grouped by accountable ERP role and urgency. Items disappear when their source transactions are resolved." />
    {roles.map((role) => {
      const owned = items.filter((item) => item.ownerRole === role);
      if (owned.length === 0) return null;
      return <section className="panel" key={role}><div className="panel-title"><div><h2>{roleLabel(role)}</h2><p className="body-copy">{owned.length} current work item{owned.length === 1 ? "" : "s"}</p></div><StatusChip tone="blue">Derived queue</StatusChip></div>
        {(["high", "medium", "low"] as const).map((urgency) => { const urgent = owned.filter((item) => item.urgency === urgency); if (!urgent.length) return null; return <div key={urgency}><h3>{urgencyLabels[urgency]}</h3><div className="table-panel"><table className="data-table"><thead><tr><th>Work</th><th>Document</th><th>Reason</th><th>Due</th><th>Open</th></tr></thead><tbody>{urgent.map((item) => <tr key={item.id}><td><span className="cell-title">{item.title}</span><span className="cell-sub mono">{item.kind}</span></td><td className="mono">{item.documentNumber}</td><td>{item.detail}</td><td>{item.dueAt ? formatDateTime(item.dueAt) : "—"}</td><td><Link className="button button-secondary" href={item.href}>Open source</Link></td></tr>)}</tbody></table></div></div>; })}
      </section>;
    })}
    {items.length === 0 ? <section className="panel"><div className="empty-state"><strong>No current action items.</strong><p>All source transactions are on track.</p></div></section> : null}
  </>;
}
function ActionCenterClockSkeleton() {
  return <><PageHeader eyebrow="Overview • Demo Data" title="Action Center" description="Derived work will appear after Demo Data and the current date are synchronized." /><section className="panel" aria-busy="true"><div className="empty-state"><strong>Synchronizing current date…</strong><p>The work queue is locked until the client clock is mounted.</p></div></section></>;
}

export function HydrationSafeActionCenter({ state, hydrated, sampleNow = sampleDashboardNow }: { state: DemoState; hydrated: boolean; sampleNow?: () => string }) {
  const now = useDashboardClock(hydrated, sampleNow);
  return hydrated && now ? <ActionCenterContent state={state} now={now} /> : <ActionCenterClockSkeleton />;
}

export default function ActionCenterPage() {
  const { state, hydrated } = useDemoStore();
  return <HydrationSafeActionCenter state={state} hydrated={hydrated} />;
}
