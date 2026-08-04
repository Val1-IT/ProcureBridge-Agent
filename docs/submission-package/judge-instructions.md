# Judge Instructions

**Public URL:** https://arvanta-procurebridge-recovery.valentansuri123.chatgpt.site

No login, API key, installation, or technical setup is required. All customers, invoices, transcripts, calls, outcomes, and metrics are clearly labeled **Demo Data**.

## Recommended two-minute path

1. Open the public URL and click **Start 2-Minute Demo**.
2. Keep **Fast Demo** selected.
3. Use the highlighted **PT Sinar Jaya Retail** invoice, `INV-2026-0812`.
4. Follow the seven-step guide through briefing, approval, guardrails, call simulation, structured result review, Promise Tracker, and Audit Log.
5. Approve the proposed promise only after checking the amount and date.
6. Use **Exit Demo** to restore the browser state from before the guided demo.

## Presentation recovery

If timing or connectivity becomes inconvenient, return to the landing page and choose **Presentation Fallback**. It selects **Instant Result**, resets the main scenario deterministically, and remains visibly labeled **Presentation Fallback — Demo Data**.

Use **Restart Demo** to replay the guide. Use **Reset Demo Data** in the workspace sidebar to restore all three seeded scenarios.

## Other scenarios and technical context

- **Invoice Dispute:** open Collection Queue and choose CV Maju Teknik.
- **Failed Contact:** open Collection Queue and choose PT Nusantara Distribusi.
- **Architecture:** `/architecture`
- **Technical Notes:** `/technical-notes`
- **Submission Hub:** `/submission`
- **Health:** `/api/health`

The deployed prototype uses `MockCallProvider`; no real phone call is placed. The CALL-E adapter and webhook boundaries are implemented and documented, but official credentials and contract confirmation are production requirements.

