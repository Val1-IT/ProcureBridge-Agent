# Arvanta ProcureBridge Recovery Agent — Design Specification

## Product goal

Build a hackathon-ready, multi-page operational SaaS prototype that demonstrates the complete overdue-invoice recovery workflow: queue selection, AI briefing, human approval, guarded CALL-E call, live transcript, structured result review, downstream promise/dispute/follow-up creation, and traceable audit history.

The prototype must run completely without external credentials. Every simulated record and metric is visibly labeled **Demo Data**.

## Architecture

- Next.js 15 App Router, React, TypeScript, and Tailwind CSS.
- Multi-page routes for dashboard, collection queue, invoice detail, call console, call result, promise tracker, dispute center, and activity/audit log.
- A single versioned browser store persisted to `localStorage`. The store initializes only after client hydration, supports seed/reset, and emits same-tab plus cross-tab synchronization events.
- Pure domain functions implement approval validation, call guardrails, call-result application, status synchronization, and audit creation. UI components dispatch domain actions rather than mutating financial records directly.
- CALL-E access is isolated behind a `CallProvider` contract. `MockCallProvider` is selected automatically when CALL-E credentials are absent. `CalleProvider` contains the documented HTTP assumptions required for a future live integration.
- Supabase is optional. The repository interface, optional adapter, and SQL schema are provided, but no external service is required for the demo.

## State and workflow

The demo store contains customers, invoices, calls, approvals, pending structured results, payment commitments, disputes, audit logs, and UI demo settings. It uses a schema version and deterministic seed data for three scenarios.

The call lifecycle is an explicit state machine:

1. `draft` — invoice selected and briefing available.
2. `approval_pending` — mandatory approval fields are incomplete.
3. `approved` — human approval is complete.
4. `blocked` — one or more guardrails prevents calling.
5. `creating` / `connecting` / `active` — provider call lifecycle.
6. `completed` or `failed` — provider finished.
7. `result_pending_review` — extraction exists but has not changed financial state.
8. `result_approved`, `human_review`, or `result_rejected` — explicit human disposition.

Only `result_approved` may create or update a payment commitment, dispute, or scheduled follow-up. Every sensitive transition appends an audit-log entry.

## Guardrails

The call eligibility evaluator returns machine-readable codes and user-facing reasons. It checks all mandatory approvals, AI disclosure, consent, do-not-contact status, allowed local calling hours, daily call frequency, open disputes, valid phone details, and valid invoice data. The call controls also prohibit sensitive credential requests, aggressive language, unauthorized fee relief, invoice-amount changes, and incomplete promise-to-pay extraction. Low-confidence results require human review. Transcript segments mask sensitive numeric patterns.

## Demo scenarios

- **Promise to Pay:** PT Sinar Jaya Retail agrees to pay Rp7.500.000 on 10 August 2026. Approval creates a promise and schedules follow-up on 11 August.
- **Invoice Dispute:** CV Maju Teknik disputes item quantity. Approval creates a dispute ticket and blocks further collection calls.
- **Failed Contact:** PT Karya Distribusi's PIC is unavailable. Approval records no commitment and schedules a follow-up at the suggested time.

Normal simulation lasts roughly 30–45 seconds. Demo Mode provides a faster cadence while preserving stage and transcript progression.

## Interface design

The visual system uses cream/off-white surfaces, dark navy text and borders, restrained amber accents, medium-radius cards, bold sans-serif headings, and monospace treatment for amounts and operational labels. It avoids gradients, glass effects, decorative blobs, fabricated browser frames, and unlabeled production-looking data.

The desktop presentation is primary, with a usable tablet layout. Shared navigation, status chips, data tables, callout panels, loading/empty/error states, disabled controls, explicit block reasons, and confirmation dialogs provide a cohesive operational experience.

## API and webhook behavior

Endpoints expose call creation, status retrieval, call termination, and CALL-E webhook receipt. The webhook validates event structure, documents signature-verification assumptions, requires an event ID, deduplicates events, tolerates out-of-order provider timestamps, appends audit records, and returns non-sensitive errors.

## Testing and acceptance

Automated tests cover approval gating, every call guardrail, all three scenarios, persistent-state serialization and reset, webhook validation/deduplication/order handling, cross-page state synchronization through domain transitions, and structured-result approval. Completion also requires successful type checking, linting, tests, and production build.

## Explicit boundaries

No production ERP, payment gateway, accounting ledger, enterprise authentication, model training, production multitenancy, mobile app, WhatsApp integration, or aggressive collection functionality will be added. CALL-E and Supabase integration points are documented contracts until real API details and credentials are supplied.
