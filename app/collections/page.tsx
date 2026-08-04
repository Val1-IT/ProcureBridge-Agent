"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ScenarioKey } from "@/lib/domain/types";
import { useJudgeDemo } from "@/components/judge-demo-provider";

const scenarioCopy: Record<ScenarioKey, { label: string; note: string; invoiceId: string }> = {
  promise_to_pay: { label: "Promise to Pay", note: "Cashflow issue → pembayaran parsial", invoiceId: "inv-sinar" },
  invoice_dispute: { label: "Invoice Dispute", note: "Selisih barang → dispute ticket", invoiceId: "inv-maju" },
  failed_contact: { label: "Failed Contact", note: "PIC tidak tersedia → follow-up", invoiceId: "inv-karya" },
};

export default function CollectionsPage() {
  const { state, dispatch } = useDemoStore();
  const { session } = useJudgeDemo();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [risk, setRisk] = useState("All");
  const [days, setDays] = useState("0");
  const [amount, setAmount] = useState("0");

  const invoices = useMemo(() => state.invoices.filter((invoice) => {
    const customer = state.customers.find((item) => item.id === invoice.customerId);
    return `${customer?.companyName} ${invoice.invoiceNumber}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "All" || invoice.contactStatus === status) &&
      (risk === "All" || invoice.riskLevel === risk) &&
      invoice.daysOverdue >= Number(days) && invoice.outstandingAmount >= Number(amount);
  }), [state, query, status, risk, days, amount]);

  const chooseScenario = (scenario: ScenarioKey) => {
    dispatch({ type: "SELECT_SCENARIO", scenario });
  };

  return (
    <>
      <PageHeader eyebrow="Prioritized worklist" title="Collection Queue" description="Filter invoice overdue, lihat alasan prioritas, lalu review briefing AI sebelum satu pun panggilan dibuat." />
      <section className="scenario-strip" aria-label="Run Demo Scenario">
        {(Object.keys(scenarioCopy) as ScenarioKey[]).map((scenario, index) => {
          const copy = scenarioCopy[scenario];
          return <Link href={`/invoices/${copy.invoiceId}`} className="scenario-card" key={scenario} onClick={() => chooseScenario(scenario)}><span className="eyebrow">Scenario 0{index + 1}</span><strong>Run Demo: {copy.label} →</strong><p>{copy.note}</p></Link>;
        })}
      </section>
      <section className="filters">
        <div className="field"><label>Customer / invoice</label><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari customer…" /></div>
        <div className="field"><label>Days overdue</label><select value={days} onChange={(event) => setDays(event.target.value)}><option value="0">Semua umur</option><option value="15">15+ hari</option><option value="30">30+ hari</option></select></div>
        <div className="field"><label>Nilai invoice</label><select value={amount} onChange={(event) => setAmount(event.target.value)}><option value="0">Semua nilai</option><option value="10000000">Rp10 jt+</option><option value="20000000">Rp20 jt+</option></select></div>
        <div className="field"><label>Risk level</label><select value={risk} onChange={(event) => setRisk(event.target.value)}><option>All</option><option>Low</option><option>Medium</option><option>High</option></select></div>
        <div className="field"><label>Status / eligibility</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Ready to Call</option><option>Scheduled</option><option>Promise to Pay</option><option>Disputed</option><option>Human Review</option></select></div>
      </section>
      <section className="table-panel">
        {invoices.length ? <table className="data-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Outstanding</th><th>Due date</th><th>Overdue</th><th>Risk</th><th>Last contact</th><th>Status</th><th>Recommended action</th><th /></tr></thead><tbody>
          {invoices.map((invoice) => {
            const customer = state.customers.find((item) => item.id === invoice.customerId)!;
            const tone = invoice.contactStatus === "Disputed" ? "red" : invoice.contactStatus === "Promise to Pay" ? "green" : invoice.contactStatus === "Scheduled" ? "blue" : "amber";
            return <tr className={session?.active && invoice.id === "inv-sinar" ? "judge-highlight" : undefined} key={invoice.id}><td><span className="cell-title">{customer.companyName}</span><span className="cell-sub">{customer.contactName}</span></td><td className="mono">{invoice.invoiceNumber}</td><td className="mono">{formatCurrency(invoice.outstandingAmount)}</td><td>{formatDate(invoice.dueDate)}</td><td className="mono">{invoice.daysOverdue} hari</td><td><StatusChip tone={invoice.riskLevel === "High" ? "red" : invoice.riskLevel === "Medium" ? "amber" : "green"}>{customer.riskScore} • {invoice.riskLevel}</StatusChip></td><td>{formatDate(invoice.lastContactAt)}</td><td><StatusChip tone={tone}>{invoice.contactStatus}</StatusChip></td><td>{invoice.recommendedAction}</td><td><Link className="button button-secondary" href={`/invoices/${invoice.id}`}>Review & Call</Link></td></tr>;
          })}
        </tbody></table> : <div className="empty-state"><strong>Tidak ada invoice yang cocok.</strong><p>Ubah filter atau reset Demo Data untuk mengembalikan tiga skenario awal.</p></div>}
      </section>
    </>
  );
}
