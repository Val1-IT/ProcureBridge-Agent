# DealTwin — Devpost form draft (Nebius × NVIDIA, "Best Apps and Agents")

Copy-ready text for https://nebiusglobalaihackathon.devpost.com, one block per field. **Draft:**
fields marked `<…>` wait for the video, the demo link and your own product feedback. Check the field names against the
live form before pasting. Rules: https://nebiusglobalaihackathon.devpost.com/rules.

Deadline: **Oct 30, 2026, 10:00 PT**.

## Before you open the form (operator)

1. Make sure `.env.local` (git-ignored) holds `NEBIUS_API_KEY`,
   `NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b` (the only id tried with reasoning off),
   `DEALTWIN_NEBIUS_LIVE_ENABLED=true` and optionally `DEALTWIN_NEBIUS_ROUTER_ENABLED=true`.
   Never commit it.
2. Three live runs exist (`docs/dealtwin/evidence/nebius-extraction-eval-*.json`). The eval
   figures below come from the one for the current code,
   `nebius-extraction-eval-2026-10-23T04-57-01-341Z.json` (its `promptVersion` ends in `v3` and
   `thinking` is `false`). If the eval is ever rerun, replace every figure from the new file. Keep
   calling it a tuning-set score: v2 and v3 were written after reading failures on these 32 cases.
3. Record the demo (under 3 minutes; script below) and upload it to YouTube as Public → `<VIDEO_URL>`.
4. Push branch `dealtwin-nebius-edition` and make sure the repo is public (MIT `LICENSE` is in it).
5. Fill `<DEMO_URL_OR_TEST_BUILD>`: there is no hosted deployment, so point to the README's
   "Run it locally" section unless a hosted test build is separately authorized.

---

## Project name

DealTwin — say the deal, Nemotron drafts it, the compiler decides

## Elevator pitch (≤200 characters)

Describe a deal in plain English or Indonesian. NVIDIA Nemotron on Nebius drafts the terms, you confirm them, and a deterministic compiler decides whether your cash can carry it.

## About the project (Markdown)

```markdown
## Inspiration
Distributors win deals that are profitable on paper and still run out of cash, because the supplier gets paid before the customer pays. The terms that decide this ("30% DP, pelunasan 14 hari, jangan pinjam bank") live in chats and voice notes, not in an ERP. Large language models are good at reading those words and dangerous when they decide whether the business can afford the deal.

## What it does
DealTwin is a financial compiler for deals. The Nebius edition adds a plain-language front door powered by **NVIDIA Nemotron on Nebius Token Factory**:

1. **Words → constraints.** "Terms for deal A: deposit at least 20%, and the customer pays the remaining balance within 30 days of acceptance." Nemotron returns typed constraint candidates. Each candidate quotes the exact words it came from, and they are saved only as unconfirmed drafts.
2. **Ask instead of guess.** If something is missing ("the customer pays the rest later"), Nemotron says what is missing instead of drafting, DealTwin reads that back as a question, and nothing is saved.
3. **Human confirms.** "Confirm the constraints" reads every draft back and saves a new deal version that the human owns.
4. **The compiler decides.** "Can I accept deal A?" replays the terms day by day against the ERP cash timeline. It answers with a dated shortfall. "What would it take?" finds the smallest amendment that works, and "Show me the proof" reads back its hash-bound, replayable Deal Proof.
5. **Nemotron as a tool-selecting agent.** For free-form requests ("suppose the first buyer settles a week late"), Nemotron picks which DealTwin step to plan from a closed list of 15 intents. It cannot say "yes" for you, and any invalid output falls back to a deterministic grammar. Its routing accuracy hasn't been measured yet.

## How we built it
- Nemotron (`nvidia/nemotron-3-super-120b-a12b`) through Nebius Token Factory's OpenAI-compatible chat completions endpoint, called with `temperature: 0`, JSON mode, reasoning switched off (`enable_thinking: false`), a 5-second timeout and a 64 KB response cap. Any model that isn't Nemotron is refused.
- A strict, versioned Zod schema for each AI output (`dealtwin.constraint-extraction.v1`, `dealtwin.intent-route.v1`). Invalid output fails closed with a named error code.
- A deterministic TypeScript compiler, exhaustive amendment search and canonical proof hashing, with PostgreSQL row-level security and an idempotent commitment ledger.
- A 17-tool MCP server (spec 2025-11-25). The voice/chat front door, the web app and generic agents all go through it, and every write is prepare → read back → human yes → single-use grant.
- An evaluation harness: 32 labelled cases in English and Indonesian, including prompt-injection attempts. It scores precision, recall, unsafe accepts and p50/p95 latency.

## Challenges we ran into
- Letting an LLM be useful without letting it be the authority. Provenance (`ai_extracted` vs `user_confirmed`), verbatim source quotes and a confirmation step close that gap.
- Indonesian business shorthand: "DP", "pelunasan", "jt" for juta, "Rp 5.000.000" with dot separators.
- Making "I don't know" a first-class answer. A clarifying question scores as correct; a confident wrong constraint counts as an unsafe accept.

## Accomplishments that we're proud of
- On 113 benchmark cases checked by an independent exhaustive oracle, the "margin + 20% deposit" rule wrongly approves 34 of 67 unsafe deals. DealTwin's compiler wrongly approves 0 of 67.
- Nemotron extraction on the 32-case set we tuned the prompt on (one run, not a held-out set): 28 of 32 passed, precision 0.93, recall 0.90, no timeouts, p50/p95 latency 1.2 s / 2.2 s. One unsafe accept: for a supplier-payment deadline it proposed a constraint where it should have asked, and in the app that draft still waits for the user's confirmation.

## What we learned
Treating the model's output as an untrusted proposal is what made Nemotron easy to adopt. Every safety property lives in the schema and the compiler, so we could change prompts or models without re-auditing the money path.

## What's next for DealTwin
Multi-turn clarification (answer the question and keep the draft), extracting full deal terms (lines, prices, dates) as well as constraints, and running the eval on every prompt change.

## Honest scope
All data is a synthetic tenant in IDR. The app is self-hosted and runs locally for judging; there is no hosted deployment. Nemotron never decides feasibility, approves, reserves or commits anything.
```

## Built with

typescript, nvidia-nemotron, nebius-token-factory, model-context-protocol, postgresql, next.js, react, zod, vitest, playwright, web-speech-api

## Demo URL or test build

<DEMO_URL_OR_TEST_BUILD>

## Code repository

https://github.com/Val1-IT/ProcureBridge-Agent (branch `dealtwin-nebius-edition`, MIT license). The README section "Nebius × NVIDIA edition" describes the Nemotron integration.

## Video demo link (under 3 minutes)

<VIDEO_URL>

Suggested script (about 2:45). The app's replies don't have to play in real time: cut the waits in the edit.
"Yes" below means typing `Yes.` or clicking **Yes, go ahead** on the card.

| Time | Screen | Type into the simulator | Voice-over |
|---|---|---|---|
| 0:00–0:12 | Cold open: the red "Does not compile" card and cash gauge from the 1:15 beat | — | "This deal makes a profit, and it would still leave me 3 million rupiah short on September 22, because the supplier gets paid before the customer does. The terms that decide it arrive as words, not JSON." |
| 0:12–0:30 | "More information needed — No constraint was drafted" card | `Terms for deal A: the customer will pay the rest later.` → Yes | "Nemotron on Nebius doesn't guess. When the terms are vague, it says what's missing, and nothing is saved." (Don't read the question out in the voice-over: the model writes it, so it can change between takes.) |
| 0:30–1:00 | "Waiting for your confirmation" card ("Prepared over MCP — nothing has executed yet"), then "Draft constraints — not yet authoritative" with its Model and Prompt rows | `Terms for deal A: deposit at least 20%, and the customer pays the remaining balance within 30 days of acceptance.` → Yes | "Clear terms become typed drafts. Each one quotes my exact words, passes a strict schema, and stays a draft until I confirm it." |
| 1:00–1:15 | "Constraints confirmed" card | `Confirm the constraints.` → Yes | "It reads every draft back. One yes, and they're my terms, in a new deal version." (Don't say a number: the card also lists the five constraints deal A already had.) |
| 1:15–1:45 | "Does not compile" card and cash gauge | `Can I accept deal A?` → Yes | "Now the deterministic compiler checks the deal day by day against the ERP cash timeline. Not the model. Both of my new terms are met, and the answer is still no: on September 22 I'd be 3 million rupiah below my cash floor." |
| 1:45–2:05 | Amendment card, then the proof card | `What would it take to make deal A work?` → Yes, then `Show me the proof.` | "So I ask what would fix it. It searches the possible amendments, and the smallest one that works is a 25% deposit, saved as a new version. The proof is hash-bound, and it still needs one human approval before anything is booked." |
| 2:05–2:30 | README eval table (v1 → v2 → v3) | — | "On the 32 English and Indonesian cases we tuned the prompt on, Nemotron got 28 right, including all three prompt-injection attempts, with no timeouts and a median answer in 1.2 seconds. Two wrong drafts slipped through; in the app they'd still wait for my confirmation. That's a tuning-set number, not a held-out one." |
| 2:30–2:42 | End card with the repository URL | — | "Nemotron proposes. The compiler decides. You confirm." |

Recording notes:

- Run `npm run judge:seed` before every take. The order matters on a fresh deal A: an unconfirmed draft
  blocks the next extraction, and confirmed constraints stay until you reseed.
- After reloading the page, and before you start recording, type exactly `Alexa, open DealTwin`. Until
  then, the idle card's title and the input box's placeholder both show that phrase. Afterwards the
  card reads "DealTwin connected over MCP" and the placeholder moves on to the next judge-script line.
- In `.env.local`, keep `DEALTWIN_NEBIUS_LIVE_ENABLED=true` but turn the router off
  (`DEALTWIN_NEBIUS_ROUTER_ENABLED` unset) for the take. The "Terms for deal A:" lines go to Nemotron
  extraction either way; with the router off, the other lines go through the fixed grammar, so every
  take behaves the same.
- Type every line exactly as shown, including its period or question mark. A spoken line can come out
  as "20 percent", and without the period the read-back runs into the next sentence. Answer in English:
  "ya" is not recognised.
- If the vague line comes back as a draft instead of a question, reseed and record it again.
- Untick **Speak replies aloud**, or leave it on only for the 1:15 verdict, so the voice-over fits.
- Rehearse once with the live model before recording. The 1:15 and 1:45 numbers are the seed's
  (Sep 22, Rp 3M short; 25% deposit). Deal A already has a 20% deposit and a day-14 balance, so the
  new terms shouldn't change them, but no test covers that exact sequence. If the screen shows
  something else, say what the screen shows.
- Don't demo a deposit minimum above 20%. The deposit rule then becomes the first violation, and the
  spoken reply still says "cash floor … an unknown amount short".
- Don't use "keep Rp 5,000,000 in the bank" or "no new borrowing". Deal A already has both, and
  DealTwin refuses a duplicate.
- Optional Indonesian take, instead of the 0:30 line and not in addition to it (the deposit would be
  a duplicate): `For deal A: DP minimal 20% dari nilai pesanan.` This case passed in the eval.
  Keep it to one term: the combined Indonesian case failed.
- Keep the admin link, the terminal and `.env.local` off screen.

Trademark check: the rules don't allow third-party trademarks without permission. The simulator page is
titled "Alexa+ simulator" and lives at `/dealtwin/alexa`. Its conversation log labels every reply
"Alexa" (`components/dealtwin/alexa-simulator.tsx:138`). The first judge-script line, "Alexa, open
DealTwin", appears as the idle card's title and as the input placeholder; the off-camera step in the
recording notes clears both. Record the browser full screen and crop to the reply card, the input box
and, if useful, the "MCP calls behind the voice" table. Keep these out of
frame: the tab title, the URL bar, the navigation, the "Simulated Alexa+ experience" paragraph, the
judge-script chips and the conversation log. Never say "Alexa" in the voice-over. If that crop doesn't
work, the labels need neutral wording in code first, as a separate change.

## Testing instructions

```text
Requirements: Node.js 22.13+, Docker (or any local PostgreSQL 15/16).

npm ci
docker run -d --name dealtwin-pg -p 55632:5432 -e POSTGRES_USER=dealtwin -e POSTGRES_PASSWORD=dealtwin -e POSTGRES_DB=dealtwin_test postgres:16
DEALTWIN_TEST_DATABASE_URL=postgres://dealtwin:dealtwin@127.0.0.1:55632/dealtwin_test npm run judge:db
DEALTWIN_TEST_DATABASE_URL=postgres://dealtwin:dealtwin@127.0.0.1:55632/dealtwin_test npm run judge:seed

For live Nemotron, add to .env.local: NEBIUS_API_KEY, NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b (the only id tried with reasoning off), DEALTWIN_NEBIUS_LIVE_ENABLED=true and, optionally, DEALTWIN_NEBIUS_ROUTER_ENABLED=true.

npm run judge:build
npm run judge:demo

Open the admin link, go to /dealtwin/alexa and type "Terms for deal A: deposit at least 20%, and the customer pays the remaining balance within 30 days of acceptance.", then "Yes.", then "Confirm the constraints.", then "Yes.", then "Can I accept deal A?", then "Yes.". Run npm run judge:seed again before repeating it.
Accuracy: npm run eval:nebius -- --offline (harness) or --live (real Nemotron).
Without DEALTWIN_NEBIUS_LIVE_ENABLED=true, the extraction step answers "Live AI extraction is switched off" after the Yes, the router stays off, and the rest of the app works.
```

## Significant updates during the hackathon

```text
DealTwin's compiler, proof, ledger and MCP server existed before this hackathon (see the repository history and the Alexa+ submission). Built for the Nebius edition, on branch dealtwin-nebius-edition:
- A natural-language deal front door. Nemotron extraction is wired into the voice/chat conversation: draft → read back → confirm → compile. Clarifying questions are spoken, and nothing is saved on a clarify.
- A Nemotron intent router (lib/dealtwin/ai/intent-router.ts) that selects which MCP tool to plan. It uses a closed intent list, cannot confirm or cancel, quoted terms must come from the utterance, and it falls back to the deterministic grammar on any failure.
- A 32-case English/Indonesian extraction eval with injection cases, scoring (precision, recall, unsafe accepts, latency) and a live runner that writes evidence JSON.
- Fake-provider tests for every fail-closed path.
- Two live eval runs (v1, v2; evidence JSON in docs/dealtwin/evidence/) drove prompt revisions v2 and v3 and switching Nemotron's reasoning off. A third run measured the result: 28 of the 32 tuning cases with no timeouts (v2: 23 of 32, 11 timeouts).
```

## Product feedback (Nebius Token Factory and NVIDIA Nemotron)

```text
<Write in your own words. Cover: onboarding and key creation, the model catalogue (which Nemotron id you used and why), JSON-mode reliability, latency observed (with default reasoning on, 11 of 32 v2 calls hit the 5 s timeout; with `chat_template_kwargs.enable_thinking: false` and prompt v3, 0 of 32 did, p50/p95 1249/2239 ms; the prompt changed in the same run, so don't credit the switch alone), error messages, billing clarity, and what you'd want next (e.g. JSON-schema-constrained decoding, per-key spend caps).>
```
