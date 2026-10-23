# DealTwin — Devpost form draft (Nebius × NVIDIA, "Best Apps and Agents")

Copy-ready text for https://nebiusglobalaihackathon.devpost.com, one block per field. **Draft:**
fields marked `<…>` wait for a live run of the current code (prompt v3, reasoning off) and the video. Check the field names against the
live form before pasting. Rules: https://nebiusglobalaihackathon.devpost.com/rules.

Deadline: **Oct 30, 2026, 10:00 PT**.

## Before you open the form (operator)

1. Make sure `.env.local` (git-ignored) holds `NEBIUS_API_KEY`,
   `NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b` (the only id tried with reasoning off),
   `DEALTWIN_NEBIUS_LIVE_ENABLED=true` and optionally `DEALTWIN_NEBIUS_ROUTER_ENABLED=true`.
   Never commit it.
2. Two live runs already exist (`docs/dealtwin/evidence/nebius-extraction-eval-*.json`), but they
   used prompts v1 and v2 with the model's default reasoning. The current code (prompt v3,
   reasoning off) is not measured. Fill `<LIVE_EVAL_SUMMARY>` only from a run of the current code:
   run `npm run eval:nebius -- --live` once, copy its summary below and commit the evidence file it
   writes (its `promptVersion` ends in `v3` and `thinking` is `false`). Say it is a tuning-set
   score: v2 and v3 were written after reading failures on these 32 cases.
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

1. **Words → constraints.** "Terms for deal A: deposit at least 30%, keep Rp 5,000,000 in the bank, no new borrowing." Nemotron returns typed constraint candidates. Each candidate quotes the exact words it came from, and they are saved only as unconfirmed drafts.
2. **Ask instead of guess.** If something is missing ("the customer pays the rest later"), Nemotron returns a clarifying question ("When is the balance due?") and nothing is saved.
3. **Human confirms.** "Confirm the constraints" reads every draft back and saves a new deal version that the human owns.
4. **The compiler decides.** "Can I accept deal A?" replays the terms day by day against the ERP cash timeline. It answers with a dated shortfall, the smallest amendment that works, and a hash-bound, replayable Deal Proof.
5. **Nemotron as a tool-selecting agent.** For free-form requests ("suppose the first buyer settles a week late"), Nemotron chooses which of DealTwin's 17 MCP tools to plan. It cannot say "yes" for you, and any invalid output falls back to a deterministic grammar.

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
- Nemotron extraction on the 32-case set we tuned the prompt on: <LIVE_EVAL_SUMMARY: precision / recall / unsafe accepts / timeouts / p50–p95 latency, only from the evidence file whose promptVersion is v3 and thinking is false>

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

Suggested script (about 2:40):

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Title card | "A profitable deal can still drain a distributor's cash. The terms that decide it arrive as words, not JSON." |
| 0:15–0:50 | `/dealtwin/alexa`: "Terms for deal A: deposit at least 30%, keep Rp 5,000,000 in the bank, no new borrowing" → Yes | "Nemotron on Nebius drafts three constraints, each quoting my words. They're drafts until I confirm." |
| 0:50–1:05 | "Terms for deal A: the customer pays the rest later" → Yes | "When it can't tell, it asks. Nothing is saved." |
| 1:05–1:25 | "Confirm the constraints" → Yes | "Every draft is read back. Now they're mine, in a new deal version." |
| 1:25–2:00 | "Can I accept deal A?" → Yes, then "What would it take?" | "The compiler, not the model, says no: Rp 3M short on September 22. The smallest fix is a 25% deposit, with a replayable proof." |
| 2:00–2:25 | Eval JSON / table | "On the 32 English and Indonesian cases we tuned the prompt on, Nemotron scored <LIVE_EVAL_SUMMARY>. That's a tuning-set number, not a held-out one." |
| 2:25–2:40 | End card | "Nemotron reads the deal. The compiler decides. You confirm." |

## Testing instructions

```text
Requirements: Node.js 22.13+, Docker (or any local PostgreSQL 15/16).

npm ci
docker run -d --name dealtwin-pg -p 55632:5432 -e POSTGRES_USER=dealtwin -e POSTGRES_PASSWORD=dealtwin -e POSTGRES_DB=dealtwin_test postgres:16
DEALTWIN_TEST_DATABASE_URL=postgres://dealtwin:dealtwin@127.0.0.1:55632/dealtwin_test npm run judge:db
DEALTWIN_TEST_DATABASE_URL=postgres://dealtwin:dealtwin@127.0.0.1:55632/dealtwin_test npm run judge:seed

For live Nemotron, add to .env.local: NEBIUS_API_KEY, NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b (the only id tried with reasoning off), DEALTWIN_NEBIUS_LIVE_ENABLED=true, DEALTWIN_NEBIUS_ROUTER_ENABLED=true.

npm run judge:build
npm run judge:demo

Open the admin link, go to /dealtwin/alexa and type or say "Terms for deal A: deposit at least 30%, no new borrowing", then "yes", then "confirm the constraints", then "yes", then "Can I accept deal A?".
Accuracy: npm run eval:nebius -- --offline (harness) or --live (real Nemotron).
Without a key, the AI steps answer "Live AI extraction is switched off" and the rest of the app works.
```

## Significant updates during the hackathon

```text
DealTwin's compiler, proof, ledger and MCP server existed before this hackathon (see the repository history and the Alexa+ submission). Built for the Nebius edition, on branch dealtwin-nebius-edition:
- A natural-language deal front door. Nemotron extraction is wired into the voice/chat conversation: draft → read back → confirm → compile. Clarifying questions are spoken, and nothing is saved on a clarify.
- A Nemotron intent router (lib/dealtwin/ai/intent-router.ts) that selects which MCP tool to plan. It uses a closed intent list, cannot confirm or cancel, quoted terms must come from the utterance, and it falls back to the deterministic grammar on any failure.
- A 32-case English/Indonesian extraction eval with injection cases, scoring (precision, recall, unsafe accepts, latency) and a live runner that writes evidence JSON.
- Fake-provider tests for every fail-closed path.
- Two live eval runs (evidence JSON in docs/dealtwin/evidence/) drove prompt revisions v2 and v3 and switching Nemotron's reasoning off.
```

## Product feedback (Nebius Token Factory and NVIDIA Nemotron)

```text
<Write after the v3 (reasoning off) live run. Cover: onboarding and key creation, the model catalogue (which Nemotron id you used and why), JSON-mode reliability, latency observed (p50/p95 from the eval; with default reasoning on, 11 of 32 v2 calls hit the 5 s timeout; say whether `chat_template_kwargs.enable_thinking: false` changed that only after the v3 run measures it), error messages, billing clarity, and what you'd want next (e.g. JSON-schema-constrained decoding, per-key spend caps).>
```
