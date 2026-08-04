"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { useDemoStore } from "@/components/demo-store-provider";
import { evaluateCallEligibility } from "@/lib/domain/guardrails";
import { validateApproval } from "@/lib/domain/approval";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import type { CallApproval, CallRecord, ScenarioKey } from "@/lib/domain/types";

const briefByScenario: Record<ScenarioKey, Record<string, string>> = {
  promise_to_pay: {
    "Ringkasan kasus": "Invoice diakui dan 18 hari overdue. Email pengingat terakhir dibuka, tetapi belum ada respons pembayaran.",
    "Riwayat keterlambatan": "Satu invoice sebelumnya dibayar 4 hari terlambat; tidak ada broken promise.",
    "Kemungkinan alasan": "Pola transaksi mengindikasikan tekanan arus kas jangka pendek, bukan penolakan invoice.",
    "Tujuan utama": "Konfirmasi kendala dan dapatkan nominal serta tanggal pembayaran yang eksplisit.",
    "Pertanyaan wajib": "Apakah invoice diakui? Berapa nominal yang dapat dibayar? Tanggal pasti pembayaran?",
    "Batas negosiasi": "Pembayaran sebagian minimum Rp5.000.000; perpanjangan maksimal 10 hari.",
    "Tidak boleh dijanjikan": "Jangan menghapus denda, mengubah invoice, atau menyetujui keringanan tanpa approval baru.",
    "Recommended tone": "Hangat, faktual, dan memberi ruang untuk menjelaskan kendala.",
    "Suggested opening": "Saya Nara, asisten suara AI Arvanta. Saya menghubungi dengan persetujuan tim terkait invoice INV-2026-0812.",
    "Next actions": "Jika nominal dan tanggal jelas, buat draft promise-to-pay untuk review manusia.",
  },
  invoice_dispute: {
    "Ringkasan kasus": "Invoice 31 hari overdue dengan dua pengingat tanpa balasan.",
    "Riwayat keterlambatan": "Pembayaran historis tepat waktu; keterlambatan ini tidak biasa.",
    "Kemungkinan alasan": "Ada potensi ketidaksesuaian barang atau dokumen penerimaan.",
    "Tujuan utama": "Verifikasi apakah ada sengketa dan kumpulkan kategori serta bukti yang diperlukan.",
    "Pertanyaan wajib": "Apakah barang diterima lengkap? Dokumen apa yang berbeda? Bukti apa yang tersedia?",
    "Batas negosiasi": "Hentikan negosiasi segera bila sengketa dinyatakan.",
    "Tidak boleh dijanjikan": "Jangan mengakui kesalahan, mengubah nilai invoice, atau menjanjikan kredit memo.",
    "Recommended tone": "Netral, teliti, tidak defensif.",
    "Suggested opening": "Saya Nara, asisten suara AI Arvanta. Saya ingin memverifikasi status invoice dan mendengar bila ada kendala dokumen.",
    "Next actions": "Buat dispute ticket, minta surat jalan, dan tahan panggilan berikutnya.",
  },
  failed_contact: {
    "Ringkasan kasus": "Invoice 12 hari overdue dan belum pernah berhasil dikontak melalui telepon.",
    "Riwayat keterlambatan": "Riwayat pembayaran baik; tidak ada dispute atau broken promise.",
    "Kemungkinan alasan": "PIC tidak tersedia atau waktu kontak sebelumnya tidak tepat.",
    "Tujuan utama": "Verifikasi PIC tersedia dan minta waktu follow-up yang sesuai.",
    "Pertanyaan wajib": "Apakah nomor PIC benar? Kapan waktu terbaik untuk menghubungi kembali?",
    "Batas negosiasi": "Jangan membahas rincian invoice dengan pihak yang tidak terverifikasi.",
    "Tidak boleh dijanjikan": "Jangan menyebut nominal atau detail sensitif sebelum PIC terverifikasi.",
    "Recommended tone": "Ringkas, sopan, dan menjaga kerahasiaan.",
    "Suggested opening": "Saya Nara, asisten suara AI Arvanta. Saya mencari Bapak Andi untuk urusan administrasi perusahaan.",
    "Next actions": "Catat waktu rekomendasi dan periksa call policy sebelum menjadwalkan ulang.",
  },
};

export default function InvoiceDetailPage() {
  const params = useParams<{ invoiceId: string }>();
  const router = useRouter();
  const { state, dispatch } = useDemoStore();
  const invoice = state.invoices.find((item) => item.id === params.invoiceId);
  const customer = state.customers.find((item) => item.id === invoice?.customerId);
  const callId = invoice ? `call-${invoice.id.replace("inv-", "")}` : "call-missing";
  const saved = state.approvals.find((item) => item.callId === callId);
  const [approval, setApproval] = useState<CallApproval>(() => saved ?? {
    callId,
    objective: invoice?.scenario === "invoice_dispute" ? "Verifikasi potensi sengketa" : invoice?.scenario === "failed_contact" ? "Verifikasi PIC dan waktu follow-up" : "Konfirmasi pembayaran parsial",
    minimumPayment: invoice?.scenario === "promise_to_pay" ? 5_000_000 : 0,
    extensionAllowed: invoice?.scenario === "promise_to_pay",
    maximumFollowUpDate: "2026-08-14",
    language: "Bahasa Indonesia",
    callTime: "10:00",
    aiDisclosureApproved: false,
    dataConfirmed: false,
    approvedBy: "Nadia Pratama",
    approvedAt: "",
  });
  const [starting, setStarting] = useState(false);

  const openDispute = Boolean(invoice && state.disputes.some((item) => item.invoiceId === invoice.id && item.status !== "Resolved"));
  const callsToday = invoice ? state.calls.filter((call) => call.customerId === invoice.customerId && call.startedAt && new Date(call.startedAt).toDateString() === new Date().toDateString()).length : 0;
  const approvalIssues = validateApproval(approval);
  const eligibility = useMemo(() => invoice && customer ? evaluateCallEligibility({ customer, invoice, approval: saved ?? null, localTime: approval.callTime, callsToday, openDispute }) : { allowed: false, reasons: ["Invoice tidak ditemukan."], codes: ["INVALID_INVOICE"] }, [invoice, customer, approval.callTime, saved, callsToday, openDispute]);

  if (!invoice || !customer) return <div className="empty-state"><strong>Invoice tidak ditemukan.</strong><p>Reset Demo Data atau kembali ke Collection Queue.</p></div>;

  const saveApproval = () => {
    if (approvalIssues.length) return;
    dispatch({ type: "SAVE_APPROVAL", approval: { ...approval, approvedAt: new Date().toISOString() } });
  };

  const startCall = async () => {
    if (!eligibility.allowed || !saved) return;
    if (!window.confirm(`Mulai panggilan Demo CALL-E ke ${customer.companyName}? Disclosure AI akan dibacakan di awal panggilan.`)) return;
    setStarting(true);
    try {
      const response = await fetch("/api/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callId, customerId: customer.id, invoiceId: invoice.id, phone: customer.phone, language: saved.language, scenario: invoice.scenario, disclosure: "Penelepon adalah asisten suara AI Arvanta." }) });
      if (!response.ok) throw new Error("Call provider tidak dapat membuat panggilan.");
      const created = await response.json() as { providerCallId: string; provider: "mock" | "calle" };
      const call: CallRecord = { id: callId, customerId: customer.id, invoiceId: invoice.id, provider: created.provider, providerCallId: created.providerCallId, status: "connecting", startedAt: null, endedAt: null, durationSeconds: 0, outcome: null, sentiment: null, recordingUrl: null, transcript: [], aiSummary: null, humanApprovedBy: saved.approvedBy, humanApprovedAt: saved.approvedAt, scenario: invoice.scenario };
      dispatch({ type: "CREATE_CALL", call });
      router.push(`/calls/${callId}`);
    } catch {
      window.alert("Panggilan Demo tidak dapat dimulai. Periksa adapter lalu coba lagi.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="AI pre-call briefing" title={`${invoice.invoiceNumber} • ${customer.companyName}`} description="Briefing ini disusun dari Demo Data. Operator harus memverifikasi batas negosiasi dan seluruh call policy sebelum CALL-E aktif." actions={<StatusChip tone={invoice.riskLevel === "High" ? "red" : "amber"}>Risk {customer.riskScore} • {invoice.riskLevel}</StatusChip>} />
      <div className="detail-grid">
        <div className="stack">
          <section className="brief-card">
            <div className="panel-title"><h2>Invoice & customer profile</h2><span>VERIFIED DEMO INPUT</span></div>
            <div className="info-grid">
              <div className="info-item"><span>Outstanding</span><strong className="mono">{formatCurrency(invoice.outstandingAmount)}</strong></div>
              <div className="info-item"><span>Due date</span><strong>{formatDate(invoice.dueDate)}</strong></div>
              <div className="info-item"><span>Ageing</span><strong className="mono">{invoice.daysOverdue} hari</strong></div>
              <div className="info-item"><span>Produk / layanan</span><strong>{invoice.product}</strong></div>
              <div className="info-item"><span>PIC</span><strong>{customer.contactName} • {customer.phone}</strong></div>
              <div className="info-item"><span>Consent & hours</span><strong>{customer.consentStatus} • {customer.allowedCallStart}–{customer.allowedCallEnd}</strong></div>
              <div className="info-item"><span>Email</span><strong>{customer.email}</strong></div>
              <div className="info-item"><span>Language</span><strong>{customer.preferredLanguage}</strong></div>
              <div className="info-item"><span>Last contact</span><strong>{formatDateTime(invoice.lastContactAt)}</strong></div>
            </div>
          </section>
          <section className="brief-card">
            <div className="panel-title"><h2>AI-generated pre-call brief</h2><span>CONFIDENCE 92%</span></div>
            <div className="brief-list">{Object.entries(briefByScenario[invoice.scenario]).map(([label, copy]) => <div className="brief-row" key={label}><span>{label}</span><p>{copy}</p></div>)}</div>
          </section>
          <section className="brief-card">
            <div className="panel-title"><h2>Riwayat pembayaran & kontak</h2><span>DEMO DATA</span></div>
            <div className="brief-list">
              {invoice.paymentHistory.map((item) => <div className="brief-row" key={item.date}><span>Pembayaran • {formatDate(item.date)}</span><p>{formatCurrency(item.amount)} — {item.note}</p></div>)}
              {invoice.contactHistory.length ? invoice.contactHistory.map((item) => <div className="brief-row" key={item.date}><span>{item.channel} • {formatDate(item.date)}</span><p>{item.note}</p></div>) : <div className="brief-row"><span>Kontak</span><p>Belum ada riwayat kontak untuk invoice ini.</p></div>}
            </div>
          </section>
        </div>
        <aside className="approval-card">
          <div className="panel-title"><h2>Human Approval</h2><span>MANDATORY GATE</span></div>
          <div className="approval-grid">
            <div className="field"><label>Tujuan panggilan</label><select value={approval.objective} onChange={(event) => setApproval({ ...approval, objective: event.target.value })}><option>Konfirmasi pembayaran parsial</option><option>Verifikasi potensi sengketa</option><option>Verifikasi PIC dan waktu follow-up</option></select></div>
            <div className="field"><label>Batas pembayaran parsial</label><input type="number" min="0" value={approval.minimumPayment} onChange={(event) => setApproval({ ...approval, minimumPayment: Number(event.target.value) })} /></div>
            <div className="field"><label>Perpanjangan</label><select value={approval.extensionAllowed ? "yes" : "no"} onChange={(event) => setApproval({ ...approval, extensionAllowed: event.target.value === "yes" })}><option value="yes">Boleh ditawarkan</option><option value="no">Tidak boleh</option></select></div>
            <div className="field"><label>Follow-up maksimum</label><input type="date" value={approval.maximumFollowUpDate} onChange={(event) => setApproval({ ...approval, maximumFollowUpDate: event.target.value })} /></div>
            <div className="field"><label>Bahasa</label><select value={approval.language} onChange={(event) => setApproval({ ...approval, language: event.target.value })}><option>Bahasa Indonesia</option><option>English</option></select></div>
            <div className="field"><label>Waktu panggilan</label><input type="time" value={approval.callTime} min={customer.allowedCallStart} max={customer.allowedCallEnd} onChange={(event) => setApproval({ ...approval, callTime: event.target.value })} /></div>
          </div>
          <label className="check-row"><input type="checkbox" checked={approval.aiDisclosureApproved} onChange={(event) => setApproval({ ...approval, aiDisclosureApproved: event.target.checked })} /><span><strong>AI disclosure</strong><br />CALL-E wajib menyatakan pelanggan sedang berbicara dengan AI.</span></label>
          <label className="check-row"><input type="checkbox" checked={approval.dataConfirmed} onChange={(event) => setApproval({ ...approval, dataConfirmed: event.target.checked })} /><span><strong>Data confirmation</strong><br />Nomor, invoice, outstanding, policy, dan script telah diperiksa.</span></label>
          <div className={`guardrail-box ${eligibility.allowed ? "allowed" : ""}`}>
            <strong>{eligibility.allowed ? "✓ 8 policy checks lulus" : `Panggilan diblokir • ${eligibility.codes.length} alasan`}</strong>
            {!eligibility.allowed ? <ul>{eligibility.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>Panggilan siap dibuat melalui MockCallProvider.</p>}
          </div>
          <div className="approval-actions">
            <button className="button button-secondary" disabled={approvalIssues.length > 0} onClick={saveApproval}>{saved ? "Update Approval" : "Approve Brief"}</button>
            <button className="button button-dark" disabled={!eligibility.allowed || starting} onClick={startCall}>{starting ? "Connecting…" : "Start CALL-E →"}</button>
          </div>
          {!saved ? <p className="helper-copy">Start Call tetap terkunci sampai approval disimpan dan seluruh guardrail lolos.</p> : null}
        </aside>
      </div>
    </>
  );
}
