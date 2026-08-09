import type { SupplierScenario, SupplierTranscriptSegment } from "./types";

type ScriptLine = Omit<SupplierTranscriptSegment, "id">;

const disclosure: ScriptLine = { speaker: "AI", text: "Halo, saya asisten suara AI Arvanta yang menghubungi untuk tindak lanjut pesanan pembelian.", stage: 1, offsetSeconds: 0 };

const scripts: Readonly<Record<SupplierScenario, readonly ScriptLine[]>> = {
  delivery_commitment: [
    disclosure,
    { speaker: "Supplier", text: "Baik, saya siap mengonfirmasi jadwal pengiriman.", stage: 2, offsetSeconds: 7 },
    { speaker: "AI", text: "Apakah seluruh produk dapat dikirim sesuai batas persetujuan pembelian?", stage: 3, offsetSeconds: 14 },
    { speaker: "Supplier", text: "Ya, jadwal pengiriman dapat kami penuhi.", stage: 4, offsetSeconds: 22 },
  ],
  partial_delivery: [
    disclosure,
    { speaker: "Supplier", text: "Sebagian barang siap, sisanya masih menunggu pasokan.", stage: 2, offsetSeconds: 7 },
    { speaker: "AI", text: "Saya akan mencatat rencana pengiriman sebagian untuk ditinjau manusia.", stage: 3, offsetSeconds: 15 },
    { speaker: "Supplier", text: "Baik, tim kami akan mengirimkan rincian tertulis.", stage: 4, offsetSeconds: 23 },
  ],
  stock_unavailable: [
    disclosure,
    { speaker: "Supplier", text: "Stok produk belum tersedia dari pabrik.", stage: 2, offsetSeconds: 7 },
    { speaker: "AI", text: "Saya tidak akan mengubah pesanan dan akan meminta tinjauan manusia.", stage: 3, offsetSeconds: 15 },
    { speaker: "Supplier", text: "Baik, kami akan memberi pembaruan setelah ada kepastian.", stage: 4, offsetSeconds: 23 },
  ],
  price_discrepancy: [
    disclosure,
    { speaker: "Supplier", text: "Ada perbedaan harga pada konfirmasi terbaru kami.", stage: 2, offsetSeconds: 7 },
    { speaker: "AI", text: "Perubahan harga tidak akan disetujui lewat panggilan dan akan masuk tinjauan manusia.", stage: 3, offsetSeconds: 15 },
    { speaker: "Supplier", text: "Kami akan mengirimkan dokumen pendukung.", stage: 4, offsetSeconds: 23 },
  ],
  failed_contact: [
    disclosure,
    { speaker: "System", text: "Panggilan tersambung ke pesan otomatis.", stage: 2, offsetSeconds: 7 },
    { speaker: "AI", text: "Tidak ada rincian komersial sensitif yang disampaikan.", stage: 3, offsetSeconds: 14 },
    { speaker: "System", text: "Kontak gagal dan tindak lanjut manusia diperlukan.", stage: 4, offsetSeconds: 21 },
  ],
};

export function maskSensitiveNumericPatterns(text: string): string {
  const sequence = /(?<!\d)\+?\d(?:[\s.-]?\d){6,18}(?!\d)/g;
  const calendarDate = /^(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})$/;
  return text
    .replace(sequence, (candidate) => calendarDate.test(candidate) ? candidate : "[MASKED]")
    .replace(/\b\d{6}\b/g, "[MASKED]");
}

export function getSupplierScenarioTranscript(scenario: SupplierScenario): SupplierTranscriptSegment[] {
  return scripts[scenario].map((line, index) => ({ ...line, id: `${scenario}-${index + 1}`, text: maskSensitiveNumericPatterns(line.text) }));
}
