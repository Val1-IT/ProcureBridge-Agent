# Risk and Limitations

## Demo Limitations

- Calls, voice behavior, recording playback, and transcripts are simulated.
- Customers, invoices, outcomes, history, and dashboard metrics are Demo Data.
- No real payment reconciliation changes an accounting balance.
- AI briefing, sentiment, intent, entity extraction, and confidence are deterministic demo outputs.
- Supabase production persistence is not active.

## Production Requirements

- Official CALL-E credentials and confirmation of request, event, retry, and media contracts.
- Official webhook HMAC algorithm and canonical-body signature verification.
- Production database, backups, encryption, tenant-safe authorization, and migrations.
- Enterprise authentication, tenant isolation, and role permissions.
- Durable background jobs, monitoring, retry queues, dead-letter handling, and incident response.
- Consent evidence storage and policy ownership.
- Review against local telecommunication and debt-collection requirements.
- Approved call-recording disclosure and recording policy.
- Data retention, deletion, access, and export policy.
- Documented human escalation and exception-handling process.

## Demo Risks

- Browser refresh or accidental navigation during a call animation.
- Audio, screen-recording, cursor, or microphone failure.
- Internet instability or temporary deployment unavailability.
- Transcript animation taking longer than the remaining presentation time.
- Browser state contaminated by an earlier rehearsal.

## Mitigations

- Fast Demo for a predictable 12–18 second transcript.
- Instant Result and the labeled Presentation Fallback path.
- Reset Demo Data and Restart Demo controls.
- High-resolution screenshots and prerecorded 90-second and three-minute videos.
- A locally verified build as a presentation backup.
- Masked Markdown and JSON evidence exports from the result review.

