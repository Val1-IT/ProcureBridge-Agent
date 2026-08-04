import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Architecture", description: "Architecture and implementation status for Arvanta ProcureBridge Recovery Agent." };

const flow = [
  "Collection Queue",
  "Pre-call Intelligence",
  "Human Approval & Guardrails",
  "CALL-E Provider",
  "Transcript & Event Webhook",
  "Structured Outcome Extraction",
  "Human Result Review",
  "Promise / Dispute / Follow-up",
  "Audit Log",
];

const components = [
  ["Next.js application", "Implemented", "Multi-page operational interface, route handlers, and responsive presentation."],
  ["Browser persistent demo store", "Implemented", "Versioned localStorage state synchronizes queue, trackers, dashboard, and audit after refresh."],
  ["Provider interface", "Implemented", "UI depends on a CallProvider contract instead of telephony implementation details."],
  ["MockCallProvider", "Simulated", "Deterministic calls and transcripts keep the complete demo available without credentials or network access."],
  ["CalleProvider", "Integration-ready", "A documented REST adapter is selected only when the complete CALL-E server configuration is present."],
  ["Webhook processor", "Implemented", "Validates payloads, verifies a documented signature boundary, deduplicates event IDs, and ignores stale events."],
  ["Result review layer", "Implemented", "Extracted outcomes cannot create recovery records until a human approves, edits, rejects, or escalates them."],
  ["Supabase repository option", "Integration-ready", "SQL schema and repository boundary are available without making Supabase a demo dependency."],
  ["Production identity and multitenancy", "Future production requirement", "Requires enterprise authentication, tenant isolation, retention policy, monitoring, and live operational controls."],
] as const;

export default function ArchitecturePage() {
  return (
    <>
      <PageHeader eyebrow="System map • Demo Data" title="Architecture built for controlled recovery." description="The prototype separates policy, telephony, structured extraction, human decisions, persistence, and auditability so each production boundary can evolve independently." actions={<Link className="button" href="/technical-notes">Read Technical Notes →</Link>} />
      <section className="architecture-layout">
        <article className="panel architecture-flow">
          <div className="panel-title"><h2>End-to-end recovery flow</h2><span>IMPLEMENTED WORKFLOW</span></div>
          <ol>{flow.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong>{index < flow.length - 1 ? <i aria-hidden="true">↓</i> : null}</li>)}</ol>
        </article>
        <aside className="stack">
          <article className="panel status-legend"><h2>Evidence labels</h2><p><strong>Implemented</strong> runs in the current prototype.</p><p><strong>Simulated</strong> is deterministic Demo Data, not a production integration.</p><p><strong>Integration-ready</strong> has a contract and boundary but still needs live credentials and validation.</p><p><strong>Future production requirement</strong> is intentionally outside the prototype.</p></article>
          <article className="panel"><h2>Trust boundary</h2><p className="body-copy">CALL-E can produce a conversation and candidate structure, but only the human result-review layer may create a promise, dispute, or follow-up. Invoice financial values are never changed by the simulated extraction.</p></article>
        </aside>
      </section>
      <section className="component-grid spaced-top">{components.map(([title, status, copy]) => <article className="panel" key={title}><span className={`status-label status-label-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span><h3>{title}</h3><p>{copy}</p></article>)}</section>
    </>
  );
}

