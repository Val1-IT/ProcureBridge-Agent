# DealTwin — submission kit

DealTwin is one product: a **financial compiler for deals**. Each hackathon entry is a different
front door onto the same core, never a separate app. Keep this framing in every write-up:
the product is the compiler, proof and commitment ledger; the voice assistant, the LLM
extraction and any payment rail are interfaces that cannot overrule it.

Fill-in items before submitting: `<REPO_URL>`, `<VIDEO_URL>`, and the license/visibility decision.

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

**Elevator pitch (≤200 chars):** A voice-first deal checker: Alexa reads back the terms, DealTwin
proves whether your cash can carry them, proposes the smallest fix, and books nothing without your yes.

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

**How Alexa+ is used / honest scope.** The voice front door is a **browser simulator of an
Alexa+ multi-turn conversation** (`/dealtwin/alexa`, Web Speech in and out). Every reply is built
from real MCP tool results against PostgreSQL; the voice layer invents no numbers. It is not a
certified or published Alexa skill, and no Amazon account linking is configured.
State this plainly in the Devpost form and the video.

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

**Friction log.**
- Could not test on a real Alexa+ device or developer console within the window, so the voice
  surface is a faithful simulator rather than a deployed skill.
- Windows reserves port 55432, so the local database runs on 55632 (the guard allows both).
- Browser speech recognition is only available in Chromium browsers; the text box is the fallback.

**Video (under 3:00).**
| Time | Shot | Say |
|---|---|---|
| 0:00–0:20 | Title card, then a spreadsheet | "A profitable deal can still bankrupt a distributor if the cash goes out before it comes in." |
| 0:20–0:35 | README table of outcomes | "DealTwin is a compiler for deals: deterministic verdicts, proofs, reservations." |
| 0:35–1:40 | `/dealtwin/alexa`, steps 1–5, MCP trace panel open | Let Alexa speak; point at the terms card, the Sept 22 shortfall, the 25% fix. |
| 1:40–2:15 | Step 6 refusal, approver window approves, commit succeeds | "The assistant can't approve its own deal." |
| 2:15–2:40 | Steps 7–8: deal B collision, stale proof, 27% remediation | "The world changed, not the math." |
| 2:40–2:55 | Benchmark table | "0 of 67 unsafe deals approved, versus 34 for the rule of thumb." |
| 2:55–3:00 | Repo URL | — |

---

## 3. Later editions (same core, same repo)

- **Nebius (Oct 30):** front door = natural-language deal → `extract_constraints` (Nemotron on
  Nebius Token Factory) → the same compiler. Needs one approved paid live run and a measured
  extraction-accuracy table against the existing oracle; until then LLM accuracy is NOT_MEASURED.
- **PayPal (Nov 12):** front door = payment execution that may only run what a valid proof and
  reservation already allow (deposit request on commit, release on cancel), sandbox only.

## 4. Known limits (say these out loud)

Single synthetic tenant, one currency (IDR), one cash account; voice is a simulator; live LLM
extraction unmeasured; no hosted deployment; dependency audit findings are documented in
`docs/dealtwin/DEPENDENCY-AUDIT-20261018.md`; one Vitest case can time out under full-suite
load on Windows and passes when run alone.
