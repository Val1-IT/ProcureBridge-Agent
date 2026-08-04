# Architecture

## Workflow

```text
Collection Queue
      ↓
Pre-call Intelligence
      ↓
Human Approval & Guardrails
      ↓
CALL-E Provider
      ↓
Transcript & Event Webhook
      ↓
Structured Outcome Extraction
      ↓
Human Result Review
      ↓
Promise / Dispute / Follow-up
      ↓
Audit Log
```

## Components and status

| Component | Status | Responsibility |
| --- | --- | --- |
| Next.js application | Implemented | Multi-page UI and server route handlers |
| Browser Demo Store | Implemented | Versioned persistence and cross-page synchronization |
| Approval/guardrail domain | Implemented | Pure validation and explicit policy decisions |
| `CallProvider` interface | Implemented | Isolates UI and routes from provider details |
| `MockCallProvider` | Simulated | Offline deterministic calls and transcripts |
| `CalleProvider` | Integration-ready | Documented REST assumptions for real CALL-E |
| Webhook processor | Implemented | Validation, signature boundary, deduplication, ordering, audit |
| Result review layer | Implemented | Edit, approve, reject, or Human Review before downstream effects |
| Supabase repository | Integration-ready | Optional server-side persistence boundary and SQL schema |
| Identity, tenancy, operations | Future production requirement | Authentication, isolation, retention, monitoring, retries |

## State boundaries

`DemoStoreProvider` initializes deterministic seed state on the server and first client render. It reads localStorage only in an effect after mount, persists later mutations, and listens for storage events. Schema version mismatch or invalid JSON resets safely to seed data.

Judge Demo Mode stores its guide session separately in sessionStorage. Starting the guide snapshots the normal Demo Store. Restart resets only the deterministic judge scenario. Exiting hydrates the original snapshot so normal demo work is not lost.

## Provider boundary

The UI never imports telephony implementations. Server routes obtain a `CallProvider`, selected from configuration. Missing configuration selects mock. Complete configuration selects CALL-E. A failed real provider remains a failure until a human explicitly chooses the simulated fallback.

## Financial control

Structured extraction is a pending draft. Only the `APPROVE_RESULT` reducer action may create a payment commitment, dispute, or follow-up. Invoice outstanding and original amounts are not mutated by extraction or review.

