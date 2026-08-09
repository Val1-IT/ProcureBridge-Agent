"use client";

import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { buildActionItems, buildDashboardMetrics, buildUnifiedAuditEntries } from "@/lib/erp/dashboard";
import { formatDateTime } from "@/lib/format";
import { useDashboardClock } from "@/components/erp/use-dashboard-clock";
import { sampleDashboardNow } from "@/lib/erp/dashboard-clock";
import type { DemoState } from "@/lib/domain/types";

export function DashboardContent({ state, now }: { state: DemoState; now: string }) {
  const metrics = buildDashboardMetrics(state.erp, now);
  const actions = buildActionItems(state.erp, now).slice(0, 8);
  const activity = buildUnifiedAuditEntries(state.erp, state.auditLogs).slice(0, 6);
  return <>
    <PageHeader eyebrow="Overview • Demo Data" title="ERP Dashboard" description="Operational totals are derived from the latest Purchase, Inventory, Sales, Finance, and Supplier Agent transactions at render time." actions={<Link className="button" href="/actions">Open Action Center ?</Link>} />
    <section className="metric-grid">
      <MetricCard label="Purchase Orders waiting approval" value={String(metrics.pendingPurchaseOrderApprovals)} note="Approver-owned decisions" href="/approvals" accent={metrics.pendingPurchaseOrderApprovals > 0} />
      <MetricCard label="Unconfirmed Purchase Orders" value={String(metrics.unconfirmedPurchaseOrders)} note={`${metrics.overduePurchaseOrders} overdue milestone`} href="/purchasing/orders" />
      <MetricCard label="Low-stock products" value={String(metrics.lowStockProducts)} note="Available stock vs reorder point" href="/inventory" />
      <MetricCard label="Goods Receipts awaiting review" value={String(metrics.pendingGoodsReceipts)} note="Draft receipts do not change stock" href="/purchasing/receipts" />
      <MetricCard label="Blocked Sales Orders" value={String(metrics.blockedSalesOrders)} note="Insufficient available stock" href="/sales/orders" />
      <MetricCard label="Open payables" value={String(metrics.openPayables)} note="Unpaid or partially paid" href="/finance/payables" />
      <MetricCard label="Open receivables" value={String(metrics.openReceivables)} note="Unpaid or partially paid" href="/finance/receivables" />
      <MetricCard label="Supplier follow-ups" value={String(metrics.supplierFollowUps)} note="Derived from PO milestones" href="/purchasing/follow-up" />
    </section>
    <section className="panel-grid">
      <article className="panel"><div className="panel-title"><div><h2>Work requiring attention</h2><p className="body-copy">Stable links open the source transaction. No synthetic notifications are stored.</p></div><Link href="/actions">View all ?</Link></div>
        <div className="activity-list">{actions.map((item) => <div className="activity-item" key={item.id}><span className="activity-dot" /><div><Link className="cell-title" href={item.href}>{item.title}</Link><p>{item.documentNumber} • {item.ownerRole}</p></div><StatusChip tone={item.urgency === "high" ? "red" : item.urgency === "medium" ? "amber" : "blue"}>{item.urgency}</StatusChip></div>)}{actions.length === 0 ? <div className="empty-state"><strong>No current action items.</strong><p>All derived operational queues are clear.</p></div> : null}</div>
      </article>
      <article className="panel"><div className="panel-title"><div><h2>Recent approvals and Agent activity</h2><p className="body-copy">ERP events and preserved Legacy Recovery evidence.</p></div><Link href="/audit">Open audit ?</Link></div>
        <div className="activity-list">{activity.map((item) => <div className="activity-item" key={item.id}><span className="activity-dot" /><div><strong>{item.action.replaceAll("_", " ")}</strong><p>{item.documentNumber} • {item.actor}</p></div><time>{formatDateTime(item.createdAt)}</time></div>)}</div>
      </article>
    </section>
  </>;
}
function DashboardClockSkeleton() {
  return <><PageHeader eyebrow="Overview • Demo Data" title="ERP Dashboard" description="Operational totals will appear after Demo Data and the current date are synchronized." /><section className="panel" aria-busy="true"><div className="empty-state"><strong>Synchronizing current date…</strong><p>Derived action and metric state is locked until the client clock is mounted.</p></div></section></>;
}

export function HydrationSafeDashboard({ state, hydrated, sampleNow = sampleDashboardNow }: { state: DemoState; hydrated: boolean; sampleNow?: () => string }) {
  const now = useDashboardClock(hydrated, sampleNow);
  return hydrated && now ? <DashboardContent state={state} now={now} /> : <DashboardClockSkeleton />;
}

export default function DashboardPage() {
  const { state, hydrated } = useDemoStore();
  return <HydrationSafeDashboard state={state} hydrated={hydrated} />;
}
