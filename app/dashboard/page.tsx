"use client";

import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { useDemoStore } from "@/components/demo-store-provider";
import { formatCurrency, formatDateTime } from "@/lib/format";

export default function DashboardPage() {
  const { state } = useDemoStore();
  const overdue = state.invoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
  const promises = state.paymentCommitments;
  const promisedValue = promises.reduce((sum, item) => sum + item.promisedAmount, 0);
  const actualValue = promises.reduce((sum, item) => sum + item.actualAmount, 0);
  const activities = [...state.auditLogs].reverse().slice(0, 6);
  const ageing = [
    { label: "1–15", value: state.invoices.filter((item) => item.daysOverdue <= 15).reduce((sum, item) => sum + item.outstandingAmount, 0), tone: "green" },
    { label: "16–30", value: state.invoices.filter((item) => item.daysOverdue > 15 && item.daysOverdue <= 30).reduce((sum, item) => sum + item.outstandingAmount, 0), tone: "" },
    { label: "31–60", value: state.invoices.filter((item) => item.daysOverdue > 30).reduce((sum, item) => sum + item.outstandingAmount, 0), tone: "coral" },
  ];
  const maxAgeing = Math.max(...ageing.map((item) => item.value), 1);

  return (
    <>
      <PageHeader eyebrow="Recovery command center" title="Receivables yang perlu keputusan, bukan sekadar pengingat." description="Pantau queue, approval manusia, aktivitas CALL-E, dan hasil recovery terstruktur dalam satu kontrol operasional." actions={<Link href="/collections" className="button">Buka Collection Queue →</Link>} />
      <section className="metric-grid">
        <MetricCard label="Total overdue" value={formatCurrency(overdue)} note="3 invoice aktif" accent />
        <MetricCard label="Follow-up hari ini" value={String(state.invoices.filter((item) => item.contactStatus === "Ready to Call").length)} note="Menunggu review & approval" />
        <MetricCard label="Promise-to-pay aktif" value={String(promises.filter((item) => item.status === "Upcoming").length)} note={`${formatCurrency(promisedValue)} dijanjikan`} />
        <MetricCard label="Broken promise" value={String(promises.filter((item) => item.status === "Broken Promise").length)} note="Kembali ke queue setelah policy check" />
        <MetricCard label="Invoice dispute" value={String(state.disputes.filter((item) => item.status !== "Resolved").length)} note="Panggilan otomatis ditahan" />
        <MetricCard label="Recovery rate" value={promisedValue ? `${Math.round((actualValue / promisedValue) * 100)}%` : "0%"} note="Actual dibanding outstanding" />
        <MetricCard label="Nilai dijanjikan" value={formatCurrency(promisedValue)} note="Hanya hasil yang disetujui" />
        <MetricCard label="CALL-E activity" value={String(state.calls.length)} note="Mock provider • audit-ready" />
      </section>
      <section className="panel-grid">
        <article className="panel">
          <div className="panel-title"><h2>Outstanding berdasarkan umur piutang</h2><span>RUPIAH • DEMO DATA</span></div>
          <div className="bar-chart">
            {ageing.map((item) => <div className="bar-group" key={item.label}><div className={`bar ${item.tone}`} style={{ height: `${Math.max(12, (item.value / maxAgeing) * 100)}%` }} title={formatCurrency(item.value)} /><label>{item.label} hari</label></div>)}
          </div>
        </article>
        <article className="panel">
          <div className="panel-title"><h2>Aktivitas terbaru</h2><span>SEMUA PERUBAHAN</span></div>
          <div className="activity-list">
            {activities.map((item) => <div className="activity-item" key={item.id}><span className="activity-dot" /><div><strong>{item.action.replaceAll(".", " ")}</strong><p>{item.entityType} • {item.actorId}</p></div><time>{formatDateTime(item.createdAt)}</time></div>)}
          </div>
        </article>
      </section>
      <section className="panel-grid">
        <article className="panel">
          <div className="panel-title"><h2>Hasil panggilan • 7 hari</h2><span>OUTCOME COUNT</span></div>
          <div className="bar-chart">
            {[{ label: "Promise", value: state.calls.filter((c) => c.outcome === "promise_to_pay").length, tone: "green" }, { label: "Dispute", value: state.calls.filter((c) => c.outcome === "dispute").length, tone: "coral" }, { label: "Follow-up", value: state.calls.filter((c) => c.outcome === "failed_contact").length, tone: "" }].map((item) => <div className="bar-group" key={item.label}><div className={`bar ${item.tone}`} style={{ height: `${Math.max(10, item.value * 35)}%` }} /><label>{item.label}</label></div>)}
          </div>
        </article>
        <article className="panel">
          <div className="panel-title"><h2>Promise vs actual</h2><span>APPROVED RESULTS ONLY</span></div>
          <div className="bar-chart"><div className="bar-group"><div className="bar" style={{ height: promisedValue ? "100%" : "10%" }} /><label>Promise</label></div><div className="bar-group"><div className="bar green" style={{ height: promisedValue ? `${Math.max(10, (actualValue / promisedValue) * 100)}%` : "10%" }} /><label>Actual</label></div></div>
        </article>
      </section>
    </>
  );
}
