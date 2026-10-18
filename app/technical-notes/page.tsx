import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Technical Notes", description: "Technical decisions, safeguards, limitations, and production path for ProcureBridge." };

const real = ["Event-only call lifecycle transitions with illegal-transition rejection", "Browser and server consent, DNC, calling-hours, repeat-call, dispute, phone, and invoice guardrails", "Idempotent structured result edit, approve, reject, and Human Review decisions", "Promise, dispute, and follow-up creation after approval", "Cross-page persistent Demo Store and Reset Demo Data", "Provider timeout, correlation, response validation, and safe error boundary", "Webhook store interface, event idempotency, out-of-order handling, and audit callbacks", "Explicit Supabase snake_case mappers and automated critical-path coverage"];
const simulated = ["Live telephony and voice media when CALL-E credentials are absent", "Transcript streaming, intent extraction, sentiment, confidence, and recording playback", "Payment reconciliation and actual amount updates", "Production authentication, multitenancy, customer records, and operational metrics", "Background follow-up scheduling and accounting integration"];

export default function TechnicalNotesPage() {
  return (
    <>
      <PageHeader eyebrow="Engineering notes • Demo Data" title="A reliable demo with honest production boundaries." description="ProcureBridge prioritizes a complete, reviewable recovery workflow. External systems remain optional so judges can evaluate the product without credentials or network setup." actions={<Link className="button" href="/architecture">View Architecture →</Link>} />
      <section className="notes-grid">
        <article className="panel"><span className="eyebrow">Technology</span><h2>Next.js, React, TypeScript, Vitest</h2><p>Multi-page App Router UI, server route handlers, pure domain functions, a browser-persistent store, optional SQL, and provider adapters. The current deployment uses MockCallProvider by default.</p></article>
        <article className="panel"><span className="eyebrow">Why mock fallback</span><h2>The demo remains complete without hiding failure.</h2><p>Missing credentials select mock immediately. A failing live createCall remains a visible provider error and offers an explicit “Switch to Demo Call” action. The fallback is always labeled simulation.</p></article>
        <article className="panel"><span className="eyebrow">Approval and guardrails</span><h2>Two separate gates</h2><p>Approval validates mandatory human intent and disclosure. Eligibility is re-evaluated server-side from server-owned demo records and customer timezone before the provider is called. Production still requires an authenticated tenant repository.</p></article>
        <article className="panel"><span className="eyebrow">Webhook idempotency</span><h2>Safe event processing</h2><p>Every accepted event requires a valid payload, signature boundary, event ID, call ID, type, and timestamp. A store interface owns deduplication, ordering, and audit. Demo uses memory; an inactive Supabase adapter provides the durable boundary.</p></article>
        <article className="panel"><span className="eyebrow">Persistent demo state</span><h2>Hydration-safe browser storage</h2><p>The server and first client render use deterministic seed data. localStorage is read only after mount, then every mutation is versioned and persisted. Invalid or stale schemas fail closed to a fresh seed.</p></article>
        <article className="panel"><span className="eyebrow">Production path</span><h2>Security and operations still matter</h2><p>CALL-E request fields and the generic raw-body HMAC placeholder are assumptions, not official contracts. Production needs enterprise identity, tenant isolation, live authorization repositories, encrypted secrets, privacy controls, observability, reconciliation, retry queues, and validated Supabase policies.</p></article>
      </section>
      <section className="reality-grid spaced-top">
        <article className="panel"><div className="panel-title"><h2>What is real</h2><span>RUNS IN PROTOTYPE</span></div><ul className="check-list">{real.map((item) => <li key={item}>{item}</li>)}</ul></article>
        <article className="panel"><div className="panel-title"><h2>What is simulated</h2><span>DEMO DATA</span></div><ul className="check-list simulated-list">{simulated.map((item) => <li key={item}>{item}</li>)}</ul></article>
      </section>
      <section className="policy-banner"><strong>Repository documentation</strong><p>Setup, provider assumptions, demo scripts, security notes, submission copy, and the optional Supabase schema are included with the source repository. No secret or customer data is required for this demo.</p></section>
    </>
  );
}
