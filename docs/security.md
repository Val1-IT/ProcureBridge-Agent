# Security and Guardrail Notes

## Prototype safety posture

This repository is a Demo Data prototype, not a production receivables system. It contains no real customer records, payment credentials, or required external secrets. MockCallProvider is the default.

## Pre-call controls

Start Call remains locked until mandatory approval data is saved and the policy engine confirms:

- approved AI disclosure and verified input data;
- valid customer consent;
- customer is not Do Not Contact;
- requested time is within allowed contact hours;
- no earlier call to the customer on the same day;
- no open invoice dispute;
- valid phone information;
- valid, collectible invoice data.

## During-call controls

The operator can pause AI, take over, end the call, or flag Human Review. The UI states that the agent must not request PIN, OTP, card data, threaten, alter invoice values, or promise unauthorized fee relief. Sensitive six-digit and long card-like numeric patterns are masked in mock transcript processing. A stream interruption preserves the last locally stored transcript.

## Post-call controls

Structured outcomes remain pending until a human approves, edits, rejects, or escalates them. A promise requires an explicit amount and date. Low confidence requires Human Review. Approval may create a recovery record, but it does not alter the financial invoice amount.

## Provider and webhook security

CALL-E credentials are server-only. Provider errors expose only safe status messages. A failed real call can switch to mock only through an explicit, labeled user action, with an audit record when a simulated completion replaces a missing provider event.

Webhook payloads require a supported type, event ID, call ID, timestamp, object data, and signature boundary. Repeated event IDs are deduplicated; stale events are acknowledged without rewinding state; accepted changes invoke audit callbacks. The current shared-secret comparison is a placeholder until the official CALL-E HMAC and canonical-body contract is available.

## Demo evidence privacy

Downloadable reports contain Demo Data and mask phone and email. They include approval, call timeline, summary, structured result, human decision, downstream object, and relevant audit entries.

## Production requirements

Before production: implement enterprise identity, tenant-safe authorization and RLS, consent provenance, official webhook HMAC, secret rotation, encryption, privacy retention/deletion, rate limits, durable jobs and dead-letter handling, monitoring, incident response, backups, vendor review, and accounting-grade reconciliation. Validate policy with applicable legal and compliance owners.
