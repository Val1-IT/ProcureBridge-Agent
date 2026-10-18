# Submission — Arvanta ProcureBridge Recovery Agent

## Project name

Arvanta ProcureBridge Recovery Agent

## One-line pitch

Turn CALL-E collection conversations into human-approved promises, disputes, follow-ups, and audit-ready recovery actions.

## Problem statement

Accounts-receivable teams spend significant time deciding whom to contact, gathering invoice context, making repetitive calls, and translating unstructured conversations into follow-up work. The process is fragmented across queues, notes, spreadsheets, and operational systems. A customer may promise a payment, raise an invoice dispute, or ask for a callback, yet that outcome still depends on manual interpretation and data entry. Basic voice automation introduces another risk: an AI caller can contact the wrong person, call outside permitted hours, continue after a dispute, or imply a financial concession it is not authorized to make. Teams need more than an autonomous phone call. They need a controlled workflow that respects consent and policy, keeps humans responsible for consequential decisions, and leaves a clear record of what happened.

## Solution

ProcureBridge connects invoice prioritization, CALL-E voice interaction, structured extraction, human review, and downstream recovery actions in one operational flow. A collector starts in a queue of overdue invoices and opens an AI-generated pre-call brief containing customer context, history, objectives, required questions, and negotiation limits. The Start Call control remains locked until mandatory approval fields are saved and eight policy checks pass, including consent, Do Not Contact, calling hours, prior same-day calls, active disputes, and data validity.

The call provider is isolated behind an adapter. With credentials, the integration-ready `CalleProvider` can create and monitor a CALL-E session. Without credentials, a clearly labeled `MockCallProvider` runs the same product workflow using deterministic Demo Data. After the call, AI proposes a promise-to-pay, dispute, or follow-up. That proposal cannot change financial operations until a human approves, edits, rejects, or escalates it. Approved outcomes update the relevant tracker, dashboard, collection status, and Audit Log through one synchronized browser store.

## How CALL-E is used

CALL-E is the conversation execution layer, not a decorative add-on. ProcureBridge supplies the approved call objective, language, disclosure, customer contact, invoice context, and scenario boundary through a provider contract. The call console consumes status and transcript information, while webhook events advance the provider lifecycle and analysis. The resulting conversation becomes a structured recovery draft. Human approval before the call and human review after extraction form two control gates around CALL-E. The mock adapter preserves this exact integration boundary when live credentials are unavailable, allowing the product workflow to be evaluated without misrepresenting a simulation as live telephony.

## Innovation

- Human-controlled autonomous workflow with pre-call and post-call gates.
- Voice-to-structured financial operations instead of transcript-only automation.
- Promise-to-pay tracking with explicit amount, date, and follow-up.
- Automatic dispute routing that stops further collection contact.
- Consent, timing, frequency, data-quality, and negotiation guardrails.
- Append-oriented auditability across approvals, provider actions, edits, and outcomes.
- Provider fallback that keeps the demo reliable while exposing real integration failures honestly.

## Impact

ProcureBridge can reduce repetitive collection work by preparing context, guiding consistent outreach, and converting conversation outcomes into ready-to-review operational records. Faster structured follow-up gives receivables teams clearer visibility into promised payments, disputed invoices, and customers who need another contact attempt. Policy gates reduce the risk of contacting customers in an inappropriate or unauthorized way. A small team can focus its attention on exceptions and decisions while the system handles prioritization, structured capture, synchronization, and audit evidence. The prototype does not claim a measured ROI; it demonstrates where operational time and control can improve once validated with production data.

## Technical implementation

The prototype uses Next.js App Router, React, TypeScript, Vitest, and a versioned localStorage store. Server rendering begins from deterministic seed data and reads browser persistence only after mount, avoiding hydration mismatch. Pure domain functions validate approvals, evaluate guardrails, enforce call lifecycle transitions, review structured results, create promise/dispute/follow-up records, and append audit entries. A `CallProvider` interface separates `MockCallProvider` from the integration-ready REST-based `CalleProvider`. API routes create, read, and end calls. The webhook processor validates payloads and a documented signature boundary, requires event IDs, deduplicates repeated delivery, ignores stale out-of-order events, invokes audit callbacks, and returns non-sensitive errors. Optional Supabase support is supplied as SQL, a repository interface, and a server-only REST adapter; it is not required for the demo. Judge Demo Mode guides a seven-step scenario, supports real-time, fast, and instant simulations, and restores the user’s prior Demo Store snapshot on exit.

## Challenges

The hardest boundaries are telephony reliability, natural conversation, safe structured extraction, and human control. Voice providers can time out or deliver webhooks more than once and out of order. A plausible transcript is not enough: dates, amounts, disputes, and identity verification need explicit structure and confidence policy. The UI must make approvals and blocked policy conditions understandable without slowing a short demo. Persistent browser state must survive navigation and refresh without causing server/client rendering differences. ProcureBridge addresses these constraints with provider isolation, idempotent events, deterministic fallback, explicit state machines, post-call review, versioned hydration-safe persistence, and visible simulation labels.

## Future roadmap

Production work includes validated CALL-E contracts and HMAC signing, Supabase persistence with reviewed tenant-safe RLS, accounting and invoice integration, payment reconciliation, multilingual voice, configurable contact and negotiation policies, durable follow-up jobs, observability, analytics, enterprise identity, privacy retention controls, and multi-tenant deployment.

