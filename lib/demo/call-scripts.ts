import type { ScenarioKey, TranscriptSegment } from "../domain/types";

export const demoTranscripts: Record<ScenarioKey, TranscriptSegment[]> = {
  promise_to_pay: [
    { id: "p1", speaker: "AI", stage: 1, offsetSeconds: 0, sentiment: "neutral", text: "Selamat pagi, saya Nara, asisten suara AI dari Arvanta yang menghubungi untuk PT Sinar Jaya Retail. Apakah saya berbicara dengan Bapak Budi?" },
    { id: "p2", speaker: "Customer", stage: 1, offsetSeconds: 5, sentiment: "neutral", text: "Ya, saya Budi. Ada yang bisa dibantu?" },
    { id: "p3", speaker: "AI", stage: 2, offsetSeconds: 10, sentiment: "neutral", text: "Terima kasih. Kami ingin mengonfirmasi invoice INV-2026-0812 dengan outstanding Rp12.500.000 yang telah jatuh tempo." },
    { id: "p4", speaker: "Customer", stage: 3, offsetSeconds: 16, sentiment: "concerned", text: "Invoice-nya kami akui, tetapi arus kas bulan ini cukup ketat." },
    { id: "p5", speaker: "AI", stage: 4, offsetSeconds: 22, sentiment: "cooperative", text: "Baik. Apakah pembayaran sebagian memungkinkan tanpa mengubah nominal invoice?" },
    { id: "p6", speaker: "Customer", stage: 5, offsetSeconds: 28, sentiment: "cooperative", text: "Kami bisa membayar Rp7.500.000 pada 10 Agustus 2026. Sisanya dibahas lagi." },
    { id: "p7", speaker: "AI", stage: 6, offsetSeconds: 35, sentiment: "cooperative", text: "Saya konfirmasi komitmen Rp7.500.000 pada 10 Agustus 2026, dengan follow-up 11 Agustus. Tidak ada perubahan nilai invoice." },
    { id: "p8", speaker: "AI", stage: 7, offsetSeconds: 42, sentiment: "cooperative", text: "Ringkasan ini akan ditinjau operator manusia sebelum dicatat. Terima kasih atas waktunya." },
  ],
  invoice_dispute: [
    { id: "d1", speaker: "AI", stage: 1, offsetSeconds: 0, sentiment: "neutral", text: "Selamat pagi, saya Nara, asisten suara AI dari Arvanta. Apakah saya berbicara dengan Ibu Rina dari CV Maju Teknik?" },
    { id: "d2", speaker: "Customer", stage: 1, offsetSeconds: 5, sentiment: "neutral", text: "Betul, saya Rina." },
    { id: "d3", speaker: "AI", stage: 2, offsetSeconds: 11, sentiment: "neutral", text: "Saya menghubungi terkait invoice INV-2026-0774 senilai Rp8.200.000." },
    { id: "d4", speaker: "Customer", stage: 3, offsetSeconds: 17, sentiment: "frustrated", text: "Jumlah barang di invoice tidak sesuai dengan yang kami terima." },
    { id: "d5", speaker: "AI", stage: 3, offsetSeconds: 24, sentiment: "cooperative", text: "Terima kasih. Saya tidak akan melanjutkan negosiasi pembayaran. Kami akan membuat tiket sengketa dan meminta surat jalan serta bukti penerimaan." },
    { id: "d6", speaker: "AI", stage: 7, offsetSeconds: 32, sentiment: "neutral", text: "Invoice akan ditahan dari panggilan penagihan sampai sengketa ditinjau tim operasional." },
  ],
  failed_contact: [
    { id: "f1", speaker: "AI", stage: 1, offsetSeconds: 0, sentiment: "neutral", text: "Selamat siang, saya Nara, asisten suara AI dari Arvanta. Saya mencari Bapak Andi dari PT Karya Distribusi." },
    { id: "f2", speaker: "Customer", stage: 1, offsetSeconds: 6, sentiment: "neutral", text: "Nomornya benar, tetapi Pak Andi sedang tidak tersedia." },
    { id: "f3", speaker: "AI", stage: 3, offsetSeconds: 12, sentiment: "neutral", text: "Baik. Kapan waktu yang disarankan untuk menghubungi beliau kembali?" },
    { id: "f4", speaker: "Customer", stage: 3, offsetSeconds: 18, sentiment: "cooperative", text: "Besok sekitar pukul 09.30 biasanya beliau sudah di kantor." },
    { id: "f5", speaker: "AI", stage: 6, offsetSeconds: 25, sentiment: "cooperative", text: "Terima kasih. Kami akan memeriksa kebijakan panggilan sebelum menjadwalkan follow-up." },
    { id: "f6", speaker: "System", stage: 7, offsetSeconds: 31, sentiment: "neutral", text: "PIC tidak terverifikasi. Tidak ada promise-to-pay yang dicatat." },
  ],
};
