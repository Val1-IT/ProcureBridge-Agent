"use client";

import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import { useJudgeDemo } from "@/components/judge-demo-provider";

const values = [
  { index: "01", title: "One transaction chain", copy: "Purchasing, receiving, inventory, sales, delivery, payables, and receivables share one versioned Demo Data state." },
  { index: "02", title: "Human-controlled Agent", copy: "The Supplier Agent can prepare and simulate follow-up, but approval gates every call and every structured ERP update." },
  { index: "03", title: "Auditable operations", copy: "Role-checked commands append evidence while stock and finance mutations remain atomic and independently traceable." },
];

export default function HomePage() {
  const { start, startFallback } = useJudgeDemo();
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Landing navigation">
        <Link className="brand-block landing-brand" href="/"><span className="brand-mark">AD</span><span><small>Arvanta</small><strong>Distributor ERP</strong></span></Link>
        <div><DemoBadge /><Link className="button button-secondary" href="/dashboard">Open workspace</Link></div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">Distributor operations • Supplier Agent • Demo Data</span>
          <h1>Move a shortage from sales to supply, stock, and settlement.</h1>
          <p>A focused mini ERP connects purchase decisions, warehouse evidence, delivery, invoices, and payments. Its approval-gated Supplier Agent follows up overdue purchase orders through a clearly labeled mock provider.</p>
          <div className="hero-actions">
            <button className="button button-dark" onClick={start}>Start Distributor Demo</button>
            <button className="button button-secondary" onClick={startFallback}>Presentation Fallback</button>
            <Link className="button" href="/dashboard">Explore ERP</Link>
            <Link className="text-link" href="/architecture">Architecture →</Link>
            <Link className="text-link" href="/technical-notes">Technical Notes →</Link>
            <Link className="text-link" href="/collections">Legacy Recovery workflow →</Link>
          </div>
        </div>
        <aside className="demo-access-card">
          <span className="eyebrow">Primary judge journey • no API keys</span>
          <h2>A seeded shortage, one complete operational chain.</h2>
          <ol>
            <li><span>1</span><div><strong>Start with demand</strong><p>SO-2026-0001 needs 35 routers while only 30 are physically available.</p></div></li>
            <li><span>2</span><div><strong>Follow supply safely</strong><p>Create the shortage request, review the released PO, and approve a mock Supplier Agent call.</p></div></li>
            <li><span>3</span><div><strong>Verify synchronization</strong><p>Post receipt and delivery evidence, create both invoices, record a partial payment, and inspect audit history.</p></div></li>
          </ol>
          <button className="button button-full" onClick={start}>Start guided ERP demo →</button>
          <small>All companies, documents, calls, transcripts, metrics, and outcomes are simulated Demo Data.</small>
        </aside>
      </section>

      <section className="landing-values" aria-label="Product value">
        {values.map((value) => <article key={value.index}><span>{value.index}</span><h2>{value.title}</h2><p>{value.copy}</p></article>)}
      </section>
      <footer className="landing-footer"><strong>Arvanta Distributor Mini ERP</strong><span>ERP core first • Human approval • Mock provider by default</span><a href="/api/health">Runtime status</a></footer>
    </main>
  );
}
