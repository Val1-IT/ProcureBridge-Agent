# DealTwin — Devpost form answers (Alexa+ track)

Copy-ready text for https://amazonappdev2026.devpost.com, one block per form field. The
source of truth is `SUBMISSION.md`; this file only arranges it in form order.

Deadline: **Oct 23, 2026, 12:00 PDT (19:00 UTC)**.

## Before you open the form

1. Push branch `dealtwin-alexa-submission`.
2. Make https://github.com/Val1-IT/ProcureBridge-Agent public. The MIT `LICENSE` is already in
   the repo.
3. Upload `.cache/demo/dealtwin-demo.webm` (2:54, 1080p) to YouTube as **Public** or
   **Unlisted** (the rules say public), in English. Put the link wherever `<VIDEO_URL>` appears
   below.

---

## Project name

DealTwin — ask Alexa before you say yes to a deal

## Elevator pitch (≤200 characters)

A self-hosted MCP server that lets Alexa+ ask "can my cash carry this deal?", get a proof-backed answer and the smallest fix, and book nothing without a human yes.

## About the project (Markdown)

```markdown
## Inspiration
Distributors win deals that are profitable on paper and still run out of cash: the supplier is paid before the customer pays, and two reps promise the same cash to two customers. Spreadsheets and "20% deposit" rules of thumb don't see the timeline.

## What it does
DealTwin is a financial compiler for deals, served to Alexa+ through a **self-hosted MCP server** (spec 2025-11-25, Streamable HTTP, 17 tools). Ask "Can I accept deal A?" and DealTwin:

- reads the structured terms back and asks before running the check;
- replays them day by day against the ERP's real cash timeline and answers **No: the cash floor breaks on September 22, Rp 3M short**;
- searches 2,457 candidates and proposes the smallest fix (a 25% deposit), with a hash-bound, replayable **Deal Proof**;
- stress-tests "what if the customer pays three days late?";
- **reserves** the cash so it can't be promised twice, refuses deal B because that cash is already committed, and stops at a four-eyes rule until a separate approver signs off;
- marks the proof **stale** when a supplier invoice changes, proposes a 27% remediation, and replays the original proof to show the math didn't change, the world did.

## How we built it
- TypeScript domain core: a pure compiler, exhaustive amendment search, canonical proof hashing.
- PostgreSQL 15/16 with row-level security, least-privilege login roles and an idempotent commitment ledger.
- A 17-tool MCP server at `POST /api/dealtwin/mcp`, a stateless Streamable HTTP JSON-RPC endpoint negotiating protocol 2025-11-25.
- An Alexa+ conversation layer that calls that server over real MCP (`initialize`, `tools/list`, `tools/call`), plus a browser voice front door at `/dealtwin/alexa` (Web Speech in and out). Every spoken number comes from an MCP tool result; the voice layer invents nothing.
- Every write is prepare → read back → explicit "yes" → execute, bound by a signed, actor-bound, 5-minute ticket and a single-use server-minted grant.
- Next/vinext UI, Vitest (1,370+ tests) and Playwright journeys.

## Challenges we ran into
- Making "can we afford it" deterministic and replayable: integer rupiah, explicit same-day ordering, frozen proof inputs.
- Keeping a voice or LLM layer from ever becoming the authority.
- Making a spoken "yes" commit exactly one prepared action.
- Making concurrent commits safe, using revision checks and idempotency keys.

## Accomplishments that we're proud of
On 113 benchmark cases checked by an independent exhaustive oracle, the "margin + 20% deposit" rule wrongly approves 34 of 67 unsafe deals. DealTwin wrongly approves 0 of 67 and wrongly rejects 0 of 45.

## What we learned
MCP works well as the contract between a voice assistant and a system of record: the same 17 tools serve the web app, the voice front door and generic agents without special cases. The hard part of voice is not understanding the request; it is confirming a write safely.

## What's next for DealTwin
Connecting the MCP server to a real Alexa+ device, multi-account and multi-currency cash, real ERP connectors, and a payment rail that can only execute what a valid proof and reservation already allow.

## Honest scope
The MCP server is self-hosted and runs locally for judging. It has not been called from a real Alexa+ device or the Alexa developer console, there is no certified Alexa skill or account linking, and the voice in the demo is labelled as simulated Alexa+. All data is a synthetic tenant.
```

## Built with

typescript, mcp, model-context-protocol, postgresql, next.js, react, drizzle-orm, zod, web-speech-api, vitest, playwright, tailwindcss, vite

## "Try it out" links

https://github.com/Val1-IT/ProcureBridge-Agent/tree/dealtwin-alexa-submission

## Video demo link

<VIDEO_URL>

## Track and mini challenges

- Primary track: **Alexa+** (self-hosted MCP server, spec 2025-11-25, Streamable HTTP)
- Mini challenges: none

## Code repository

https://github.com/Val1-IT/ProcureBridge-Agent (branch `dealtwin-alexa-submission`, MIT license)

## Testing instructions

```text
Requirements: Node.js 22.13+, Docker (or any local PostgreSQL 15/16).

npm ci
docker run -d --name dealtwin-pg -p 55632:5432 -e POSTGRES_USER=dealtwin -e POSTGRES_PASSWORD=dealtwin -e POSTGRES_DB=dealtwin_test postgres:16
DEALTWIN_TEST_DATABASE_URL=postgres://dealtwin:dealtwin@127.0.0.1:55632/dealtwin_test npm run judge:db
DEALTWIN_TEST_DATABASE_URL=postgres://dealtwin:dealtwin@127.0.0.1:55632/dealtwin_test npm run judge:seed
npm run judge:build
npm run judge:demo

judge:demo prints two single-use links. Open the admin link, go to /dealtwin/alexa and follow the judge-script chips 1–12. At step 7, open the approver link in a private window. The MCP endpoint is POST /api/dealtwin/mcp. Run judge:seed again to reset the synthetic tenant.
```

## If the project existed before the hackathon

```text
The repository's earlier history (Aug 4–11) is the host distributor ERP prototype. DealTwin's spec dates from Sept 12. That work was brought onto the published history as one snapshot commit on Oct 18 (6f51368), followed by commits in the submission window: PostgreSQL hardening and restore verification, MCP fixes, dependency security pins, browser journeys, the measured benchmark, and (Oct 22) the Alexa+ voice front door, launch links and one-command database provisioning.
```

## Product feedback (every tool, API or SDK used)

```text
Model Context Protocol (spec 2025-11-25, Streamable HTTP)
- Used for: the contract between Alexa+ and DealTwin. A 17-tool self-hosted server.
- Worked well: one set of strict tools serves the web app, the voice front door and generic agents without special cases. Stateless JSON-RPC over HTTP was simple to secure and test.
- Needs work: there is no standard way to confirm a write by voice. We built a signed, actor-bound, 5-minute ticket per prepared write.
- Onboarding: the spec was enough to build a compliant server. We could not reach a real Alexa+ test surface within the window.
- Build with it again: yes.

Alexa+ (simulated-experience path for the demo)
- Used for: the multi-turn conversation design (read-back, confirm, refuse, stale-proof remediation).
- Worked well: multi-turn MCP tool use fits "ask before you commit" conversations.
- Needs work: a developer test console that can reach a tunnelled or local MCP endpoint, a first-class "confirm this exact tool call" primitive, and a locale-aware currency speech helper ("3000000" → "3 million rupiah").

Web Speech API (browser)
- Used for: speech in and out on /dealtwin/alexa.
- Worked well: zero setup in Chromium.
- Needs work: recognition is Chromium-only, so a text box is the fallback.

AWS services: none used.
```

## Feature requests (optional)

```text
1. Confirm-this-exact-tool-call primitive for Alexa+ MCP integrations. Why: any assistant that can change records needs a spoken "yes" bound to one tool name and its arguments. Urgency: critical.
2. Developer test console or MCP conformance harness that can reach a local or tunnelled MCP endpoint and show the tool calls Alexa+ would make. Why: lets builders test before public hosting and account linking. Urgency: important.
3. Locale-aware currency speech helper. Why: builders outside USD markets hand-roll number reading. Urgency: nice-to-have.
```

## Friction log (optional, up to a 10% judging bonus)

Copy the five entries from `SUBMISSION.md` → "Friction log", one per entry field.
