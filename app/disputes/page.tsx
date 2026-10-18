"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { formatDate } from "@/lib/format";

export default function DisputesPage() {
  const { state } = useDemoStore();
  return (
    <>
      <PageHeader eyebrow="Exception workflow" title="Dispute Center" description="Sengketa aktif menghentikan negosiasi pembayaran dan memblokir panggilan penagihan berikutnya sampai tiket diselesaikan." actions={<Link href="/invoices/inv-maju" className="button button-secondary">+ Jalankan Dispute Demo</Link>} />
      <section className="table-panel">
        {state.disputes.length ? <table className="data-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Invoice</th><th>Jenis sengketa</th><th>Bukti diminta</th><th>PIC internal</th><th>SLA</th><th>Status</th><th>Follow-up</th></tr></thead><tbody>{state.disputes.map((item) => { const customer = state.customers.find((value) => value.id === item.customerId); const invoice = state.invoices.find((value) => value.id === item.invoiceId); return <tr key={item.id}><td className="mono">{item.id}</td><td><span className="cell-title">{customer?.companyName}</span><span className="cell-sub">Demo Data</span></td><td className="mono">{invoice?.invoiceNumber}</td><td>{item.category}</td><td>{item.requestedEvidence}</td><td>{item.assignedTo}</td><td>{formatDate(item.dueDate)}</td><td><StatusChip tone="red">{item.status}</StatusChip></td><td>{formatDate(item.followUpDate)}</td></tr>; })}</tbody></table> : <div className="empty-state"><strong>Tidak ada dispute ticket aktif.</strong><p>Jalankan skenario Invoice Dispute dan approve hasil terstruktur untuk membuat tiket otomatis.</p><Link href="/invoices/inv-maju" className="button">Run Dispute Demo →</Link></div>}
      </section>
      <section className="panel-grid">
        <article className="panel"><div className="panel-title"><h2>Kategori yang didukung</h2><span>DEMO TAXONOMY</span></div><div className="entity-list">{["Barang belum diterima", "Jumlah invoice tidak sesuai", "Harga tidak sesuai", "Layanan belum selesai", "Bukti pembayaran dikirim", "Invoice tidak dikenali", "Sengketa lainnya"].map((item) => <span key={item}>{item}</span>)}</div></article>
        <article className="guardrail-warning large-warning"><strong>Collection hold aktif</strong><p>Ketika dispute masih Open atau Investigating, eligibility engine menghasilkan kode <span className="mono">OPEN_DISPUTE</span>. Start Call dinonaktifkan dan alasan ditampilkan ke operator.</p></article>
      </section>
    </>
  );
}
