"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { formatCurrency, formatDate } from "@/lib/format";

export default function PromisesPage() {
  const { state } = useDemoStore();
  return (
    <>
      <PageHeader eyebrow="Commitment monitoring" title="Promise-to-Pay Tracker" description="Komitmen hanya muncul setelah hasil panggilan disetujui manusia. Broken promise kembali ke queue, meningkatkan risk, dan tetap wajib melewati call policy." actions={<Link href="/collections" className="button button-secondary">+ Jalankan Promise Demo</Link>} />
      <section className="metric-grid compact-metrics"><div className="metric-card"><span className="eyebrow">Upcoming</span><strong>{state.paymentCommitments.filter((item) => item.status === "Upcoming").length}</strong><span>Menunggu tanggal komitmen</span></div><div className="metric-card"><span className="eyebrow">Promised value</span><strong>{formatCurrency(state.paymentCommitments.reduce((sum, item) => sum + item.promisedAmount, 0))}</strong><span>Approved results only</span></div><div className="metric-card"><span className="eyebrow">Actual payment</span><strong>{formatCurrency(state.paymentCommitments.reduce((sum, item) => sum + item.actualAmount, 0))}</strong><span>Tidak ada payment gateway</span></div><div className="metric-card"><span className="eyebrow">Broken promise</span><strong>{state.paymentCommitments.filter((item) => item.status === "Broken Promise").length}</strong><span>Auto-return ke collection queue</span></div></section>
      <section className="table-panel spaced-top">
        {state.paymentCommitments.length ? <table className="data-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Promised amount</th><th>Promised date</th><th>Actual payment</th><th>Commitment</th><th>Follow-up</th><th>Owner</th></tr></thead><tbody>{state.paymentCommitments.map((item) => { const customer = state.customers.find((value) => value.id === item.customerId); const invoice = state.invoices.find((value) => value.id === item.invoiceId); return <tr key={item.id}><td><span className="cell-title">{customer?.companyName}</span><span className="cell-sub">Demo Data</span></td><td className="mono">{invoice?.invoiceNumber}</td><td className="mono">{formatCurrency(item.promisedAmount)}</td><td>{formatDate(item.promisedDate)}</td><td className="mono">{formatCurrency(item.actualAmount)}</td><td><StatusChip tone={item.status === "Broken Promise" ? "red" : "green"}>{item.status}</StatusChip></td><td><span className="cell-title">{item.followUpStatus}</span><span className="cell-sub">{formatDate(item.followUpDate)}</span></td><td>{item.assignedOwner}</td></tr>; })}</tbody></table> : <div className="empty-state"><strong>Belum ada promise-to-pay yang disetujui.</strong><p>Jalankan skenario Promise to Pay, selesaikan panggilan, lalu approve structured result.</p><Link href="/invoices/inv-sinar" className="button">Run Promise Demo →</Link></div>}
      </section>
      <article className="policy-banner"><strong>Broken Promise policy</strong><p>Setelah promised date lewat tanpa pembayaran: tandai Broken Promise, kembalikan invoice ke queue, naikkan risk score, sarankan follow-up, dan jangan menelepon ulang sebelum policy diperiksa.</p></article>
    </>
  );
}
