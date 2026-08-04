# Arvanta ProcureBridge Recovery Agent

Hackathon prototype untuk alur recovery invoice overdue melalui panggilan AI yang selalu melewati human approval dan call-policy guardrails.

> Seluruh customer, invoice, statistik, panggilan, transcript, dan hasil pada aplikasi adalah **Demo Data**. Tidak ada data produksi atau payment gateway nyata.

## Menjalankan aplikasi

Persyaratan: Node.js 22.13 atau lebih baru.

```bash
npm install
npm run dev
```

Buka URL lokal yang ditampilkan terminal. Demo berjalan penuh tanpa `.env`, CALL-E, atau Supabase.

Pemeriksaan lengkap:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Demo tercepat

1. Buka **Collection Queue**.
2. Pilih salah satu kartu **Run Demo Scenario**.
3. Lengkapi dua checkbox Human Approval dan simpan approval.
4. Pastikan policy box berubah menjadi **8 policy checks lulus**.
5. Mulai CALL-E dan biarkan transcript selesai. Fast Demo membuatnya selesai sekitar 8 detik; mode normal sekitar 30–45 detik.
6. Review structured result, kemudian pilih Approve, Edit, Human Review, atau Reject.
7. Setelah Approve, lihat perubahan pada Promise Tracker, Dispute Center, Collection Queue, Dashboard, dan Audit Log.

State menggunakan `localStorage` dengan schema version `1`. Semua perubahan bertahan setelah refresh dan dapat dikembalikan melalui **Reset Demo Data**.

## Environment variables

Salin `.env.example` menjadi `.env.local` bila ingin mengaktifkan layanan eksternal.

| Variable | Penggunaan |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | URL absolut aplikasi untuk metadata dan social preview. |
| `SUPABASE_URL` | URL project Supabase; hanya untuk server repository. |
| `SUPABASE_ANON_KEY` | Disediakan untuk integrasi Supabase mendatang; demo tidak menggunakannya. |
| `SUPABASE_SERVICE_ROLE_KEY` | Credential server-only untuk repository operasional. Jangan pernah memakai prefix `NEXT_PUBLIC_`. |
| `CALLE_API_URL` | Base URL REST CALL-E. |
| `CALLE_API_KEY` | Bearer token server-only CALL-E. |
| `CALLE_AGENT_ID` | ID voice agent yang sudah dikonfigurasi di CALL-E. |
| `CALLE_WEBHOOK_SECRET` | Secret untuk verifikasi webhook. |

Tidak ada API key di source code.

## Mengganti MockCallProvider dengan CALL-E asli

Kontrak provider berada di `lib/calle/types.ts`. Factory di `lib/calle/client.ts` otomatis memakai `MockCallProvider` bila satu dari tiga konfigurasi CALL-E tidak tersedia. Jika `CALLE_API_URL`, `CALLE_API_KEY`, dan `CALLE_AGENT_ID` lengkap, factory memilih `CalleProvider`.

Karena dokumentasi CALL-E final belum diberikan, live adapter menggunakan asumsi berikut:

- `POST {CALLE_API_URL}/calls` membuat panggilan dan menerima input adapter plus `agentId`.
- `GET {CALLE_API_URL}/calls/{callId}` membaca status.
- `POST {CALLE_API_URL}/calls/{callId}/end` mengakhiri panggilan.
- `GET {CALLE_API_URL}/calls/{callId}/transcript` membaca transcript.
- Autentikasi menggunakan `Authorization: Bearer {CALLE_API_KEY}`.
- Respons error tidak meneruskan response body provider ke browser.

Sesuaikan pemetaan request/response di `CalleProvider` setelah kontrak resmi CALL-E tersedia; komponen UI tidak perlu diubah.

### Webhook

Endpoint `POST /api/calle/webhook` menerima event `call.started`, `call.connected`, `transcript.updated`, `call.completed`, `call.failed`, dan `analysis.completed`. Payload wajib memiliki `eventId`, `callId`, `occurredAt`, `type`, dan object `data`.

Prototype memeriksa header `x-calle-signature`. Dalam development tanpa secret, hanya nilai `demo` yang diterima. Bila `CALLE_WEBHOOK_SECRET` tersedia, implementasi saat ini membandingkan header dengan secret tersebut. Sebelum penggunaan produksi, ganti boundary ini dengan algoritme HMAC dan canonical payload yang ditentukan dokumentasi CALL-E. Domain handler sudah menangani validasi, event ID deduplication, event out-of-order, safe errors, dan audit callback.

## Supabase opsional

`supabase/schema.sql` menyediakan tabel, constraint, foreign key, indeks, RLS, revoke untuk `anon`/`authenticated`, serta akses server-only `service_role`. Platform Supabase terbaru tidak selalu mengekspos tabel baru ke Data API secara otomatis; pastikan pengaturan Data API dan grants sesuai kebutuhan sebelum mengaktifkan `SupabaseRecoveryRepository`.

Demo tidak mengimpor Supabase SDK. `lib/repository/types.ts` mendefinisikan boundary dan `lib/repository/supabase-repository.ts` menyediakan implementasi REST server-side agar Supabase tetap opsional. Jalankan schema melalui migration pipeline resmi project Supabase Anda dan validasi dengan Database Advisors sebelum pemakaian nyata.

## Fitur yang masih disimulasikan

- Media telephony dan voice synthesis CALL-E.
- Streaming transcript, sentiment, intent, entity extraction, dan confidence score.
- Recording playback; tombol replay menggunakan representasi demo tanpa audio customer nyata.
- Pre-call briefing AI dan tiga structured result template.
- Data customer, invoice, payment history, contact history, dashboard metrics, dan audit awal.
- Payment reconciliation dan perubahan `actual_amount`.
- Follow-up scheduler; prototype membuat jadwal di state tetapi tidak menjalankan background job.
- Supabase persistence dan authentication.
- Signature HMAC spesifik CALL-E sampai kontrak resmi tersedia.

## Guardrail penting

Eligibility engine memblokir approval yang belum lengkap, disclosure yang belum disetujui, consent tidak valid, Do Not Contact, jam kontak di luar policy, panggilan kedua pada hari yang sama, dispute aktif, nomor telepon tidak valid, dan invoice yang tidak dapat ditagih. Transcript dimasking untuk pola OTP/kartu. Promise-to-pay wajib memiliki nominal dan tanggal eksplisit, sedangkan confidence di bawah 0,80 wajib masuk Human Review.

Structured result tidak mengubah nilai invoice. Promise, dispute, atau follow-up baru dibuat setelah operator menekan **Approve result**.
