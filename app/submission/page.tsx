import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

const screenshots = [
  ["landing.png", "Landing", "Turn calls into controlled recovery actions."],
  ["approval-guardrails.png", "Approval and guardrails", "Human approval unlocks policy-compliant outreach."],
  ["call-console.png", "CALL-E console", "A clearly labeled simulation produces structured signals."],
  ["structured-result.png", "Structured result", "AI drafts the outcome; a human controls the decision."],
  ["promise-tracker.png", "Promise Tracker", "Approved promises become trackable commitments."],
  ["audit-log.png", "Audit Log", "Every consequential transition remains traceable."],
] as const;

export default function SubmissionPage() {
  return (
    <>
      <PageHeader eyebrow="Judge submission • Demo Data" title="Submission hub" description="A public, no-login guide to the product story, technical boundaries, and presentation evidence for Arvanta ProcureBridge Recovery Agent." actions={<Link className="button" href="/">Start from landing</Link>} />

      <section className="submission-summary">
        <article className="panel">
          <span className="eyebrow">Core proposition</span>
          <h2>Turn CALL-E conversations into controlled, structured recovery actions.</h2>
          <p>CALL-E contacts customers. Arvanta converts each conversation into a human-reviewed promise-to-pay, dispute, or follow-up and records the complete decision trail.</p>
        </article>
        <article className="panel">
          <span className="eyebrow">Recommended evaluation</span>
          <h2>Use PT Sinar Jaya Retail.</h2>
          <p>Start the two-minute guide in Fast Demo. If time is constrained, Presentation Fallback selects Instant Result and clearly remains Demo Data.</p>
          <Link className="button button-full" href="/">Open guided demo</Link>
        </article>
      </section>

      <section className="panel spaced-top">
        <div className="panel-title"><h2>Public technical evidence</h2><span>NO LOCAL LINKS</span></div>
        <div className="public-link-grid">
          <Link href="/architecture"><strong>Architecture</strong><span>Workflow, state boundaries, provider isolation, and component status.</span></Link>
          <Link href="/technical-notes"><strong>Technical Notes</strong><span>What is real, simulated, integration-ready, and still required.</span></Link>
          <a href="/api/health"><strong>Health endpoint</strong><span>Safe runtime status, provider mode, and application version.</span></a>
          <Link href="/collections"><strong>Collection Queue</strong><span>All three deterministic recovery scenarios.</span></Link>
        </div>
      </section>

      <section className="spaced-top">
        <div className="panel-title"><h2>Presentation screenshots</h2><span>1440 × 900 • DEMO DATA</span></div>
        <div className="submission-screenshot-grid">
          {screenshots.map(([file, title, caption]) => (
            <figure className="screenshot-card" key={file}>
              <a href={`/submission-screenshots/${file}`}><Image unoptimized src={`/submission-screenshots/${file}`} alt={`${title} — ${caption}`} width={1440} height={900} /></a>
              <figcaption><strong>{title}</strong><span>{caption}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="policy-banner"><strong>Prototype disclosure</strong><p>The deployment uses MockCallProvider. Calls, transcripts, customers, invoices, outcomes, and metrics are Demo Data. Real CALL-E credentials and official contract validation remain production requirements.</p></section>
    </>
  );
}
