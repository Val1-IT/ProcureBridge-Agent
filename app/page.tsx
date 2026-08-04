"use client";

import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import { useJudgeDemo } from "@/components/judge-demo-provider";

const values = [
  { index: "01", title: "Recover Faster", copy: "Prioritize overdue invoices and turn each customer conversation into a structured recovery commitment." },
  { index: "02", title: "Human-Controlled AI", copy: "AI cannot negotiate sensitive terms or update financial records without explicit human approval." },
  { index: "03", title: "Auditable by Design", copy: "Calls, extraction results, edits, approvals, downstream actions, and policy decisions remain traceable." },
];

export default function HomePage() {
  const { start, startFallback } = useJudgeDemo();
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Landing navigation">
        <Link className="brand-block landing-brand" href="/"><span className="brand-mark">AP</span><span><small>Arvanta</small><strong>ProcureBridge</strong></span></Link>
        <div><DemoBadge /><Link className="button button-secondary" href="/dashboard">Open workspace</Link></div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">AI-powered receivables collection • Demo Data</span>
          <h1>Turn collection calls into structured recovery actions.</h1>
          <p>CALL-E contacts customers. AI turns each conversation into a promise-to-pay, dispute, or follow-up. Humans stay in control of every important financial decision.</p>
          <div className="hero-actions">
            <button className="button button-dark" onClick={start}>Start 2-Minute Demo</button>
            <button className="button button-secondary" onClick={startFallback}>Presentation Fallback</button>
            <Link className="button" href="/collections">Open Collection Queue</Link>
            <Link className="text-link" href="/architecture">View Architecture →</Link>
            <Link className="text-link" href="/technical-notes">Read Technical Notes →</Link>
            <Link className="text-link" href="/submission">Submission Hub →</Link>
          </div>
        </div>
        <aside className="demo-access-card">
          <span className="eyebrow">Judge access • no setup required</span>
          <h2>A complete recovery workflow in two minutes.</h2>
          <ol>
            <li><span>1</span><div><strong>Use the recommended scenario</strong><p>PT Sinar Jaya Retail • INV-2026-0812 • 18 days overdue.</p></div></li>
            <li><span>2</span><div><strong>Follow the guided steps</strong><p>Approval, guardrails, call simulation, result review, promise, and audit.</p></div></li>
            <li><span>3</span><div><strong>Stay resilient</strong><p>Real CALL-E can be replaced with a clearly labeled simulated call at any time.</p></div></li>
          </ol>
          <button className="button button-full" onClick={start}>Start guided demo →</button>
          <small>All customers, invoices, transcripts, metrics, and outcomes are Demo Data.</small>
        </aside>
      </section>

      <section className="landing-values" aria-label="Product value">
        {values.map((value) => <article key={value.index}><span>{value.index}</span><h2>{value.title}</h2><p>{value.copy}</p></article>)}
      </section>
      <footer className="landing-footer"><strong>Arvanta ProcureBridge Recovery Agent</strong><span>Human-approved • Guardrail-enforced • Provider-ready</span><a href="/api/health">Health status</a></footer>
    </main>
  );
}
