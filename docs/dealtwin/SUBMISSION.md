# DealTwin — submission kit

DealTwin is one product: a **financial compiler for deals**. Each hackathon entry is a different
front door onto the same core, never a separate app. Keep this framing in every write-up:
the product is the compiler, proof and commitment ledger; the voice assistant, the LLM
extraction and any payment rail are interfaces that cannot overrule it.

Repository: https://github.com/Val1-IT/ProcureBridge-Agent (branch `dealtwin-alexa-submission`, MIT).
Demo video: https://youtu.be/iazfvCbdpqo (public). The repository is public; submitted on Devpost Oct 23, 2026.

---

## 1. Shared story (reuse in every entry)

**Tagline:** Every deal should compile before you commit.

**Problem.** Distributors win deals that are profitable on paper and still run out of cash:
the supplier is paid before the customer pays, and two reps promise the same cash to two
customers. Spreadsheets and "20% deposit" rules of thumb don't see the timeline.

**What it does.** DealTwin turns a deal's terms (value, deposit, balance days, supplier costs)
into constraints, replays them day by day against the ERP's real cash timeline, and returns a
deterministic outcome: `DOES_NOT_COMPILE` with the exact date and shortfall, the smallest
`PROPOSED_AMENDMENT` that fixes it, a hash-bound **Deal Proof** that can be replayed, a
**reservation** so the cash can't be promised twice, and **staleness** detection when an ERP
fact the proof relied on changes.

**Why it's different.** It is not an AI opinion. On 113 benchmark cases with an independent
exhaustive oracle, the "margin + 20% deposit" rule wrongly approves 34/67 unsafe deals;
DealTwin wrongly approves 0/67 and wrongly rejects 0/45. Agents and voice assistants talk to it
over MCP, but every write is prepared, confirmed by a human, and executed with a single-use
server-minted grant; a four-eyes rule stops anyone approving their own deal.

**How we built it.** TypeScript domain core (pure compiler, exhaustive amendment search,
canonical proof hashing), PostgreSQL 15/16 with row-level security, least-privilege login roles
and an idempotent commitment ledger, a 17-tool MCP server (Streamable HTTP, protocol
2025-11-25), Next/vinext UI, Vitest (1,370+ tests) and Playwright journeys.

**Challenges.** Making "can we afford it" deterministic and replayable (integer rupiah, explicit
same-day ordering, frozen proof inputs); keeping an LLM/voice layer from ever becoming the
authority; making concurrent commits safe (revision checks + idempotency keys).

**What's next.** Multi-account and multi-currency cash, real ERP connectors, live LLM term
extraction measured against the same oracle, and a payment rail that can only execute what a
valid proof and reservation already allow.

---

## 2. Alexa+ edition (deadline Oct 23, 12:00 PDT)

Rules: https://amazonappdev2026.devpost.com/rules

**Title:** DealTwin — ask Alexa before you say yes to a deal

**Elevator pitch (≤200 chars):** A self-hosted MCP server that lets Alexa+ ask "can my cash carry
this deal?", get a proof-backed answer and the smallest fix, and book nothing without a human yes.

**Track and mini challenges entered.** Primary track: **Alexa+**, via the main path, a
**self-hosted MCP server** (spec 2025-11-25, Streamable HTTP). Mini challenges: none. Open
Source needs an *additional* project or contribution beyond this repo, and AWS Builder needs AWS
services, which DealTwin does not use. Add one only if it actually exists at submission time.

**How it meets the Alexa+ requirements (lead with this in the form and the video).**
- **Self-hosted MCP server, main path.** `POST /api/dealtwin/mcp` (`app/api/dealtwin/mcp/route.ts`)
  is a stateless Streamable HTTP JSON-RPC endpoint. It negotiates protocol **2025-11-25** (and
  also accepts 2025-03-26) and exposes **17 strict tools**: compile, propose amendment, replay
  proof, reserve, commit, monitor staleness, and more.
- **Called in code, not just mentioned.** The conversation layer
  (`lib/server/dealtwin/alexa-orchestrator.ts`) talks to that server over real MCP calls:
  `initialize` with `protocolVersion: '2025-11-25'`, `tools/list`, then `tools/call`. The turn
  route (`app/api/dealtwin/alexa/turn/route.ts`) sends `mcp-protocol-version: 2025-11-25`. Any
  other MCP client can use the same endpoint; `scripts/dealtwin/mcp-smoke.ts` is a native HTTP
  witness.
- **Voice front door as the demo surface.** `/dealtwin/alexa` plays an Alexa+ multi-turn
  conversation in the browser (Web Speech in and out), so judges can see and hear the MCP server
  in action without an Alexa+ device. Every spoken number comes from an MCP tool result against
  PostgreSQL.
- **Writes are safe for a voice assistant.** Every write is prepared, read back, and executed
  only after an explicit "yes", using a signed, actor-bound, 5-minute ticket
  (`lib/server/dealtwin/alexa-ticket.ts`) and a single-use server-minted grant. A four-eyes rule
  stops anyone approving their own deal.

**What the Alexa+ experience does.**
1. "Alexa, open DealTwin" — connects to the DealTwin MCP server and discovers its 17 tools.
2. "Can I accept deal A?" — reads the structured terms back (Rp 60M, 20% deposit, balance in
   14 days, Rp 42M supplier costs) and asks before running the check.
3. Verdict: **No** — the cash floor breaks on September 22, Rp 3M short.
4. "What would it take?" — 2,457 candidates checked; smallest fix is a 25% deposit, saved as
   version 2 with a new proof.
5. "What if the customer pays three days late?" — stress replay: still safe.
6. "Reserve the cash" → "Commit deal A" — stops at the four-eyes rule until a separate approver
   signs off, then books the sales order.
7. "Check deal B" — refused: that cash is already committed to deal A.
8. "The supplier invoice went up to 19 million" — deal A's proof goes stale; DealTwin proposes a
   27% remediation and replays the original proof to show the math didn't change, the world did.

**Honest scope.** The MCP server is the product surface submitted for the track. It is
self-hosted and runs locally for judging, with no public hosted endpoint. It has not been
connected to a real Alexa+ device or the Alexa developer console, there is no certified or
published Alexa skill, and no Amazon account linking is configured. The voice in the demo is the
browser front door described above, labelled as simulated Alexa+. State this plainly in the
Devpost form and the video.

**Testing instructions for judges.** See README → "Run it locally". Short version:
`npm ci`, start PostgreSQL on 127.0.0.1:55632, `npm run judge:db`, `npm run judge:seed`,
`npm run judge:build`, `npm run judge:demo`, open the printed admin link, go to `/dealtwin/alexa`,
and follow the judge-script chips 1–12. Use the printed approver link in a private window at
step 7. `npm run judge:seed` resets only the synthetic tenant if you want to run it again.

**Updates during the submission period.** The repository's earlier history (Aug 4–11) is the
host distributor ERP prototype. DealTwin's locked spec dates from Sept 12; that work was brought
onto the published history as one snapshot commit on Oct 18 (`6f51368`), followed by 54 commits:
PostgreSQL hardening and restore verification, MCP fixes, dependency security pins, browser
journeys, the measured benchmark, and (Oct 22) the Alexa+ voice front door, launch links and
one-command database provisioning. Disclose the snapshot rather than implying finer history.

**Product feedback (Alexa+ / tooling).**
- MCP as the contract between a voice assistant and a system of record worked well: the same
  17 tools serve the web app, the voice front door and generic agents without special cases.
- The hardest part for a voice surface is confirmation UX: spoken "yes" must map to one exact,
  server-bound action. We used a signed, actor-bound, 5-minute ticket per prepared write; a
  built-in Alexa+ pattern for "confirm this exact tool call" would remove that custom work.
- Reading numbers aloud needs care ("Rp 3,000,000" → "3 million rupiah"); a locale-aware
  currency speech helper would help non-USD builders.

**Friction log (official format; worth up to a 10% judging bonus).** Paste one entry per
block in the Devpost form.

1. **Exercising the self-hosted MCP server from real Alexa+**
   - *Task:* Call DealTwin's MCP server from a real Alexa+ conversation, not only from our own
     client.
   - *Steps:* Built the server to spec 2025-11-25 over Streamable HTTP. Ran it locally at
     127.0.0.1 behind authenticated local access. Checked what we could reach within the
     window: no public HTTPS endpoint, no account linking, no Alexa+ device or developer-console
     access.
   - *Expected:* A way to point Alexa+ at a self-hosted MCP endpoint and watch it call our tools
     during development.
   - *Actual:* We found no path we could use in the window, so the end-to-end demo uses our own
     MCP client and a browser voice front door.
   - *Severity:* High. It blocks a real-device demo.
   - *Workaround:* Our own conversation layer makes real MCP calls (`initialize`, `tools/list`,
     `tools/call`) against the same endpoint, and the demo is labelled as simulated Alexa+.
   - *Suggestion:* Publish a developer test console, or an MCP conformance harness, that can
     reach a tunnelled or local MCP endpoint and show the tool calls Alexa+ would make.

2. **Confirming a write by voice**
   - *Task:* Make a spoken "yes" commit exactly one prepared action, such as reserving cash or
     committing a deal, and nothing else.
   - *Steps:* Each write tool is split into prepare → read back → confirm → execute.
   - *Expected:* A built-in Alexa+ pattern for "confirm this exact tool call".
   - *Actual:* We had to design it ourselves.
   - *Severity:* Medium. It is security-relevant for any assistant that can change records.
   - *Workaround:* A signed, actor-bound ticket that expires in 5 minutes
     (`lib/server/dealtwin/alexa-ticket.ts`), plus a single-use server-minted grant and a
     four-eyes rule.
   - *Suggestion:* A first-class confirmation primitive in Alexa+ MCP integrations that binds
     the user's "yes" to the exact tool name and arguments.

3. **Speaking non-USD currency amounts**
   - *Task:* Read rupiah amounts aloud naturally.
   - *Steps:* Passed the engine's decimal strings (for example "3000000") to speech output.
   - *Expected:* A natural reading such as "3 million rupiah".
   - *Actual:* Raw digit strings and the "Rp" prefix read poorly, so we needed our own
     formatting.
   - *Severity:* Low.
   - *Workaround:* A small formatter in `alexa-orchestrator.ts` ("3000000" → "3 million rupiah").
   - *Suggestion:* A locale-aware currency speech helper for builders outside the USD market.

4. **Speech input outside Chromium**
   - *Task:* Let judges talk to the voice front door in any browser.
   - *Steps:* Used the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
   - *Expected:* Speech input in all major browsers.
   - *Actual:* Recognition is only available in Chromium browsers.
   - *Severity:* Low.
   - *Workaround:* A text box fallback for every turn; spoken output still works.
   - *Suggestion:* Not Amazon-specific, but an Alexa+ web test surface would remove the need for
     a browser recognizer.

5. **Local database port on Windows**
   - *Task:* Start the judging database with one command.
   - *Steps:* Started PostgreSQL on port 55432.
   - *Expected:* The port binds.
   - *Actual:* Windows reserves 55432, so the bind fails.
   - *Severity:* Low.
   - *Workaround:* The database runs on 55632 (the guard allows both).
   - *Suggestion:* Not Amazon-specific; noted so judges on Windows are not surprised.

**Video (2:54, rendered from the real app).** Every frame is a screenshot of `/dealtwin/alexa`
driven against the local synthetic PostgreSQL fixture, framed in a simulator window with a
spotlight on the active panel and a verdict stamp per step. Narration and karaoke captions are
generated text-to-speech (Edge neural voices: Andrew narrates, Brian is the deal owner, Ava is the
simulated Alexa+) and label the voice as simulated Alexa+.

| Time | Shot | Say |
|---|---|---|
| 0:00–0:13 | Title card: DealTwin, "a financial compiler for deals", synthetic cash-over-time chart dipping Rp 3M below the floor, lifecycle chips | "A profitable deal can still drain a distributor's cash when the supplier is paid before the customer." |
| 0:13–0:23 | `/dealtwin/alexa` overview | "Every number comes from DealTwin's MCP server. The voice layer invents nothing." |
| 0:23–1:14 | Steps 1–4: connect (17 tools), terms read-back, Sept 22 shortfall of Rp 3M, 2457 options → 25% deposit, proof hash | Alexa speaks the verdicts; the cash gauge shows the floor. |
| 1:14–1:49 | Steps 5–7: 3-day delay stress, reserve, commit refused, separate approver signs, commit succeeds | "I'm not allowed to approve my own deal." |
| 1:49–2:33 | Steps 8–12: deal B collision, supplier invoice change, stale proof, 27% remediation, replay | "The world changed, not the math." |
| 2:33–2:48 | Benchmark card | "The rule of thumb approved 34 of 67 unsafe deals. DealTwin approved none." |
| 2:48–2:54 | End card: repo URL, MIT, synthetic-data disclaimer | "Every deal should compile before you commit." |

---

## 3. Later editions (same core, same repo)

- **Nebius (Oct 30):** front door = natural-language deal → `extract_constraints` (Nemotron on
  Nebius Token Factory) → the same compiler. Built offline on branch `dealtwin-nebius-edition`:
  spoken/typed terms are drafted, read back and confirmed before compile, a Nemotron intent router
  picks the MCP tool (grammar fallback), and a 32-case EN/ID eval runs via `npm run eval:nebius`.
  Needs one operator-run live eval; until then LLM accuracy is NOT_MEASURED. Form draft:
  `docs/dealtwin/DEVPOST-NEBIUS-FORM.md`.
- **PayPal (Nov 12):** front door = payment execution that may only run what a valid proof and
  reservation already allow (deposit request on commit, release on cancel), sandbox only.

## 4. Known limits (say these out loud)

Single synthetic tenant, one currency (IDR), one cash account; the MCP server is self-hosted
and local only, and not yet called from a real Alexa+ device (the demo voice is simulated); live LLM
extraction unmeasured; no hosted deployment; dependency audit findings are documented in
`docs/dealtwin/DEPENDENCY-AUDIT-20261018.md`; one Vitest case can time out under full-suite
load on Windows and passes when run alone.
