# Submission Copy

## Project Title

Arvanta ProcureBridge Recovery Agent

## Tagline

Turn CALL-E conversations into controlled, structured recovery actions.

## One-line Description

CALL-E contacts customers; Arvanta turns each conversation into an auditable promise-to-pay, dispute, or follow-up under human control.

## Problem Statement

Receivables teams still spend substantial time deciding whom to contact, collecting invoice context, calling customers, writing notes, and updating operational systems. The conversation outcome is frequently unstructured: a payment promise may lack a tracked date, a dispute can remain hidden in free text, and a failed contact may not create a reliable next step. Voice AI can automate part of the call, but ungoverned automation introduces material risks. It may contact a customer without valid consent, call outside permitted hours, repeat contact on the same day, continue collecting a disputed invoice, or infer a financial commitment that the customer did not make. Teams need a workflow that combines voice execution with clear policy checks, human responsibility, structured outcomes, and traceable operational decisions.

## Solution Overview

ProcureBridge joins invoice prioritization, pre-call intelligence, CALL-E voice interaction, structured extraction, human review, and recovery tracking in one workflow. A collector starts with a queue of overdue invoices ranked by risk and recommended action. Opening a case reveals a briefing containing invoice context, payment and contact history, likely constraints, required questions, tone, disclosure, and negotiation boundaries.

The call remains locked until the operator completes mandatory approvals and the guardrail state machine confirms valid consent, permitted calling hours, no Do Not Contact status, no same-day call, no open dispute, and valid customer and invoice data. CALL-E then executes the approved conversation. Arvanta converts the transcript into a structured promise-to-pay, dispute, or follow-up draft. The draft cannot update an important operational record until a human approves, edits, rejects, or escalates it. Approved outcomes synchronize the Collection Queue, Promise Tracker, Dispute Center, Dashboard, and Audit Log through one persistent browser store. The prototype remains fully usable without external credentials through a clearly labeled MockCallProvider.

## How CALL-E Is Used

CALL-E is the conversation execution layer, not a cosmetic interface. ProcureBridge sends an approved objective, AI disclosure, language, customer contact, invoice context, and scenario boundaries through a dedicated provider contract. During the call, the agent introduces itself as AI, verifies that it is speaking with the appropriate contact, confirms the invoice context without exposing unnecessary information, and asks what is preventing payment.

For a payment scenario, CALL-E obtains a specific amount and commitment date and confirms the next follow-up. For a dispute, it stops payment negotiation and captures the disputed reason and required evidence. For failed contact, it avoids disclosing sensitive invoice details and records an appropriate callback action. Transcript and provider events return to the call console and webhook workflow. Arvanta then produces a structured draft for human review. The same integration boundary is exercised by MockCallProvider when credentials are unavailable, so judges can evaluate the complete operational workflow without a simulation being represented as live telephony.

## Key Features

- AI pre-call intelligence with customer, invoice, history, and negotiation context.
- Mandatory human approval before voice outreach.
- CALL-E conversation boundary with disclosure and provider fallback.
- Structured result extraction with edit, reject, approve, or Human Review.
- Promise-to-pay tracking with amount, date, status, and follow-up.
- Dispute routing that suppresses further collection contact.
- Explicit guardrails and append-oriented audit evidence.

## Innovation

ProcureBridge treats voice AI as an input to controlled financial operations rather than as a standalone call bot. The important innovation is the complete transition from conversation to governed action. A pre-call gate defines what the agent may discuss; a guardrail state machine decides whether contact is allowed; a provider interface executes the conversation; structured extraction proposes an outcome; and a second human gate decides whether any downstream record should exist.

This design makes promise dates, dispute reasons, failed-contact follow-ups, edits, approvals, and provider events visible across one synchronized workflow. It also handles demonstration reliability honestly. Missing CALL-E credentials select a labeled mock provider, while a live-provider failure remains visible until a human explicitly chooses simulated fallback. The product therefore demonstrates the real operational boundary without fabricating successful telephony. Auditability, dispute suppression, deterministic recovery modes, and state restoration make the prototype practical to evaluate and safer to evolve.

## Technical Implementation

The prototype uses Next.js App Router, React, TypeScript, Vitest, and a versioned localStorage Demo Store. Server rendering starts from deterministic seed data; browser persistence is read only after mount to avoid hydration mismatch. Store mutations synchronize queues, trackers, dashboard metrics, and audit events and survive navigation and refresh. Judge Demo Mode uses sessionStorage for guide progress and preserves a serialized snapshot so Exit Demo restores the prior state.

Pure TypeScript modules implement approval validation, guardrail evaluation, call lifecycle transitions, structured-result review, and downstream outcome creation. A `CallProvider` interface isolates `MockCallProvider` from the integration-ready REST `CalleProvider`; UI components never contain provider-specific request logic. API routes create, inspect, and end calls. The webhook processor validates payloads, requires event IDs, deduplicates repeated delivery, ignores stale out-of-order events, invokes audit callbacks, and returns safe errors. Optional Supabase support is supplied through SQL, a repository interface, and a server-only adapter without making the database a demo dependency. Automated tests cover critical domain, provider, persistence, webhook, and presentation-recovery behavior.

## Responsible AI and Safety

The opening script discloses that the caller is an AI assistant. Before contact, the system checks valid consent, allowed calling hours, Do Not Contact status, one-call-per-day policy, open disputes, and contact and invoice validity. An open dispute suppresses another collection call. The agent is prohibited from requesting an OTP, PIN, password, card number, or other payment credential and cannot make an unauthorized concession. Operators can pause, take over, end, reject, edit, or escalate the workflow. Structured extraction remains a draft until human review; low-confidence or incomplete results require Human Review. Demo reports mask phone numbers and email addresses, and the audit trail records policy decisions, provider actions, transcript outcomes, edits, approvals, and downstream records.

## Impact

ProcureBridge demonstrates how a receivables team can replace fragmented call notes with consistent, reviewable recovery actions. Collectors receive relevant context before contact instead of reconstructing it manually. Promise amounts and dates become trackable commitments; invoice disputes enter a dedicated workflow and suppress inappropriate follow-up; unsuccessful contact creates a defined next action. Managers gain a synchronized view across the queue, trackers, dashboard, and audit history while remaining responsible for consequential decisions. The system can help teams focus on exceptions and customer judgment rather than repetitive preparation and re-entry. The prototype intentionally makes no claim about ROI, cost reduction, or collection-rate improvement because those outcomes require controlled evaluation with representative production data and operating policies.

## Challenges

Voice workflows must tolerate provider timeouts, duplicated webhooks, out-of-order events, incomplete conversations, and uncertain extraction. A plausible transcript is not sufficient evidence for a payment promise: amount, date, customer intent, and review status must be explicit. The product also needs enough control to be safe without making a short demonstration difficult to follow. ProcureBridge addresses these tensions through provider isolation, deterministic fallback, idempotent event handling, explicit state machines, two human control gates, versioned persistence, and visibly labeled presentation modes. The remaining challenge is validating these assumptions against the official CALL-E contract and real operating conditions.

## Future Roadmap

The next stage is to validate the official CALL-E request, streaming, webhook signing, retry, and media contracts with provider credentials. Production persistence would then move to Supabase using reviewed migrations, tenant-safe row-level security, backups, monitoring, and a durable event store. Enterprise identity, role permissions, consent provenance, retention and deletion controls, and local telecommunications policy must be completed before real customer use. Accounting integration would use idempotent, approval-gated commands and payment reconciliation rather than direct invoice mutation. Durable follow-up jobs, retry queues, dead-letter handling, human escalation, operational analytics, and multilingual voice would be added only after the core safety and data boundaries are validated.

## Current Prototype Limitations

- The deployment uses `MockCallProvider`; no real telephone call is placed.
- A CALL-E adapter is available, but official credentials and final API contracts are not configured.
- Every customer, invoice, transcript, outcome, and metric is Demo Data.
- Payment reconciliation and accounting balance updates are not active.
- Production Supabase persistence is not active.
- Production multi-tenant authentication and authorization are not active.

