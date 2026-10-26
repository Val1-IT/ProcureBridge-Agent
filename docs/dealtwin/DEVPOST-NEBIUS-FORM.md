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
2. The eval figures below come from these evidence files in `docs/dealtwin/evidence/`:
   tuning set `nebius-extraction-eval-2026-10-23T04-57-01-341Z.json` (prompt v3, `thinking: false`),
   held-out set `nebius-extraction-heldout-eval-2026-10-26T11-50-05-535Z.json`, explanations
   `nebius-explanation-eval-2026-10-26T11-57-08-409Z.json`. If an eval is rerun, replace its figures
   from the new file. The 32-case score and the 20/20 explanations are tuning-set figures; only the
   26 held-out cases were written after the prompt froze.
3. The demo video is rendered: `.cache/demo/dealtwin-nebius-demo-v2-1080p.webm` (2:58, 1920×1080,
   git-ignored). Upload it to YouTube as Public → `<VIDEO_URL>`.
4. Push branch `dealtwin-nebius-edition` and make sure the repo is public (MIT `LICENSE` is in it).
5. Fill `<DEMO_URL_OR_TEST_BUILD>`: there is no hosted deployment, so point to the README's
   "Run it locally" section unless a hosted test build is separately authorized.

---

## Project name

DealTwin — say the deal, Nemotron drafts and explains it, the compiler decides

## Elevator pitch (≤200 characters)

Say a deal in English or Indonesian. NVIDIA Nemotron on Nebius drafts the terms and explains the verdict; a deterministic compiler decides if your cash can carry it.

## About the project (Markdown)

```markdown
## Inspiration
Distributors win deals that are profitable on paper and still run out of cash, because the supplier gets paid before the customer pays. The terms that decide this ("30% DP, pelunasan 14 hari, jangan pinjam bank") live in chats and voice notes, not in an ERP. Large language models are good at reading those words and dangerous when they decide whether the business can afford the deal.

## What it does
DealTwin is a financial compiler for deals. The Nebius edition adds a plain-language front door powered by **NVIDIA Nemotron on Nebius Token Factory**:

1. **Words → constraints.** "Terms for deal A: deposit at least 20%, and the customer pays the remaining balance within 30 days of acceptance." Nemotron returns typed constraint candidates. Each candidate quotes the exact words it came from, and they are saved only as unconfirmed drafts.
2. **Ask instead of guess.** If something is missing ("the customer pays the rest later"), Nemotron says what is missing instead of drafting, DealTwin reads that back as a question, and nothing is saved.
3. **Human confirms.** "Confirm the constraints" reads every draft back and saves a new deal version that the human owns.
4. **The compiler decides.** "Can I accept deal A?" replays the terms day by day against the ERP cash timeline. It answers with a dated shortfall.
5. **Nemotron explains, the compiler supplies the numbers.** "Why does deal A not work?" Nemotron tells the story in date order: the deposit lands, the supplier is paid, other bills fall due, and the customer's balance arrives too late. It writes only words and placeholders such as `{shortfall}`; DealTwin fills every amount and date from the stored compile run. A number, month or currency word of its own rejects the answer and a deterministic template is shown instead. "Explain it in Indonesian." gives the same facts in Indonesian.
6. **Fix and prove.** "What would it take?" finds the smallest amendment that works, and "Show me the proof" reads back its hash-bound, replayable Deal Proof.
7. **Nemotron as a tool-selecting agent.** For free-form requests ("suppose the first buyer settles a week late"), Nemotron picks which DealTwin step to plan from a closed list of 15 intents. It cannot say "yes" for you, and any invalid output falls back to a deterministic grammar. Its routing accuracy hasn't been measured yet.

## How we built it
- Nemotron (`nvidia/nemotron-3-super-120b-a12b`) through Nebius Token Factory's OpenAI-compatible chat completions endpoint, called with `temperature: 0`, JSON mode, reasoning switched off (`enable_thinking: false`), a 5-second timeout and a 64 KB response cap. Any model that isn't Nemotron is refused.
- A strict, versioned Zod schema for each AI output (`dealtwin.constraint-extraction.v1`, `dealtwin.intent-route.v1`, `dealtwin.verdict-explanation.v1`). Invalid output fails closed with a named error code. Explanations are checked word by word: no digits, number words, month names or currency words outside placeholders, and the shortfall and violation date must be cited.
- A deterministic TypeScript compiler, exhaustive amendment search and canonical proof hashing, with PostgreSQL row-level security and an idempotent commitment ledger.
- A 17-tool MCP server (spec 2025-11-25). The voice/chat front door, the web app and generic agents all go through it, and every write is prepare → read back → human yes → single-use grant.
- An evaluation harness: 32 tuning cases plus 26 held-out cases written after the prompt froze, in English and Indonesian, including prompt-injection attempts. It scores precision, recall, unsafe accepts and p50/p95 latency. A second harness scores explanations: grounded or not, and whether a failing verdict names its cause.

## Challenges we ran into
- Letting an LLM be useful without letting it be the authority. Provenance (`ai_extracted` vs `user_confirmed`), verbatim source quotes and a confirmation step close that gap.
- Indonesian business shorthand: "DP", "pelunasan", "jt" for juta, "Rp 5.000.000" with dot separators.
- Making "I don't know" a first-class answer. A clarifying question scores as correct; a confident wrong constraint counts as an unsafe accept.
- Letting the model explain money without letting it state money. The first explainer prompt was accepted only 9 of 20 times; naming the required placeholders, handing it the events already sorted by date and an Indonesian word list (uang muka, pelunasan, pemasok) took it to 20 of 20 on the same verdicts.

## Accomplishments that we're proud of
- On 113 benchmark cases checked by an independent exhaustive oracle, the "margin + 20% deposit" rule wrongly approves 34 of 67 unsafe deals. DealTwin's compiler wrongly approves 0 of 67.
- Nemotron extraction on 26 held-out cases written after the prompt froze (one live run): 24 of 26 passed, precision 0.91, recall 0.95, p50/p95 latency 1.4 s / 2.9 s. On the 32 cases we tuned the prompt on: 28 of 32, precision 0.93, recall 0.90, no timeouts. Each run had one unsafe accept, both for a supplier-payment deadline where it should have asked; in the app that draft still waits for the user's confirmation.
- Verdict explanations: 20 of 20 passed the grounding checks in English and Indonesian, and all 14 failing ones named a cause beyond the shortfall, median 1.4 s. Those 10 verdicts are also where we tuned the explainer prompt, so read it as a tuning-set figure.

## What we learned
Treating the model's output as an untrusted proposal is what made Nemotron easy to adopt. Every safety property lives in the schema and the compiler, so we could change prompts or models without re-auditing the money path.

## What's next for DealTwin
Multi-turn clarification (answer the question and keep the draft), extracting full deal terms (lines, prices, dates) as well as constraints, a larger held-out set for both extraction and explanations, and running the evals on every prompt change.

## Honest scope
All data is a synthetic tenant in IDR. The app is self-hosted and runs locally for judging; there is no hosted deployment. Nemotron never decides feasibility, approves, reserves or commits anything.
```

## Built with

typescript, nvidia-nemotron, nebius-token-factory, model-context-protocol, postgresql, next.js, react, zod, vitest, playwright, web-speech-api, elevenlabs (video narration only)

## Demo URL or test build

<DEMO_URL_OR_TEST_BUILD>

## Code repository

https://github.com/Val1-IT/ProcureBridge-Agent (branch `dealtwin-nebius-edition`, MIT license). The README section "Nebius × NVIDIA edition" describes the Nemotron integration.

## Video demo link (under 3 minutes)

<VIDEO_URL>

What the video shows (2:58): an illustrated story first. Budi, a fictional Jakarta distributor,
gets a profitable deal; a cash tank and a calendar show the deposit, the supplier payment and the
other bills pushing cash Rp 3,000,000 below the floor on September 22 before the balance arrives on
the 30th; a generic chatbot guesses "looks fine"; DealTwin splits the job into Nemotron (language),
a human yes and the compiler (math). Then a live run on `/dealtwin/voice` against the local demo
with live Nemotron (router off): terms → draft constraints → confirm → "Does not compile" → Nemotron's
English and Indonesian explanations, with placeholders flipping into compiler values → the
amendment search (2,457 candidates, 25% deposit) → proof and the MCP call log → the eval numbers
above. App screens are page screenshots from that run (Playwright, not a desktop capture); the
building, tank, calendar and candidate-grid art is illustrative, while every labelled figure comes
from the run or the eval files. Narration: ElevenLabs (eleven_v4, one library voice), with a quiet
synthesized pad underneath. The production scripts live in the session scratchpad, not in the repo.

Two things to know before you upload:

- The Indonesian explanation in the take says "terakumulasi hingga 22 September yang sama dengan
  22 September", an awkward repeat. It came out the same in two takes, so it is the model's answer
  for these facts, not noise. The voice-over doesn't read it.
- The take's English explanation is Nemotron's (the card says "Words by
  nvidia/nemotron-3-super-120b-a12b"). The first take had fallen back to the template; that is what
  led to the 400-character cap.

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

Open the admin link (it lands on /dealtwin/voice) and type "Terms for deal A: deposit at least 20%, and the customer pays the remaining balance within 30 days of acceptance.", then "Yes.", then "Confirm the constraints.", then "Yes.", then "Can I accept deal A?", then "Yes.", then "Why does deal A not work?" and "Explain it in Indonesian.". Run npm run judge:seed again before repeating it.
Accuracy: npm run eval:nebius -- --offline (harness) or --live (real Nemotron); add --set heldout or --set explain for the held-out and explanation evals.
Without DEALTWIN_NEBIUS_LIVE_ENABLED=true, the extraction step answers "Live AI extraction is switched off" after the Yes, explanations use the deterministic template, the router stays off, and the rest of the app works.
```

## Significant updates during the hackathon

```text
DealTwin's compiler, proof, ledger and MCP server existed before this hackathon (see the repository history and the Alexa+ submission). Built for the Nebius edition, on branch dealtwin-nebius-edition:
- A natural-language deal front door. Nemotron extraction is wired into the voice/chat conversation: draft → read back → confirm → compile. Clarifying questions are spoken, and nothing is saved on a clarify.
- A Nemotron intent router (lib/dealtwin/ai/intent-router.ts) that selects which MCP tool to plan. It uses a closed intent list, cannot confirm or cancel, quoted terms must come from the utterance, and it falls back to the deterministic grammar on any failure.
- A 32-case English/Indonesian extraction eval with injection cases, scoring (precision, recall, unsafe accepts, latency) and a live runner that writes evidence JSON.
- Fake-provider tests for every fail-closed path.
- Two live eval runs (v1, v2; evidence JSON in docs/dealtwin/evidence/) drove prompt revisions v2 and v3 and switching Nemotron's reasoning off. A third run measured the result: 28 of the 32 tuning cases with no timeouts (v2: 23 of 32, 11 timeouts).
- Grounded verdict explanations (lib/dealtwin/ai/verdict-explainer.ts): Nemotron writes words and placeholders, DealTwin fills every number from the stored compile run, English and Indonesian, with a deterministic fallback.
- A 26-case held-out extraction set written after prompt v3 froze (24 of 26 live) and a 20-call explanation eval (20 of 20 after two prompt revisions on the same verdicts).
- A neutral voice page, /dealtwin/voice.
```

## Product feedback (Nebius Token Factory and NVIDIA Nemotron)

```text
<Write in your own words. Cover: onboarding and key creation, the model catalogue (which Nemotron id you used and why), JSON-mode reliability, latency observed (with default reasoning on, 11 of 32 v2 calls hit the 5 s timeout; with `chat_template_kwargs.enable_thinking: false` and prompt v3, 0 of 32 did, p50/p95 1249/2239 ms; the prompt changed in the same run, so don't credit the switch alone; held-out p50/p95 1380/2865 ms, explanations 1425/2617 ms), error messages, billing clarity, and what you'd want next (e.g. JSON-schema-constrained decoding, per-key spend caps).>
```
