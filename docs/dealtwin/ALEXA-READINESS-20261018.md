# Alexa-first continuation — local capability and outstanding decisions

Status: Task29 **PARTIAL**; no release, submission or live-integration claim.
Target dates18–19October are the owner's goal, not a promised completion date.
Work stays in this cloud workspace. Save deliverables to the laptop only after
readiness and a supported user-directed transfer; no laptop execution now.

## Concrete progress

The existing17 MCP tools already use real PostgreSQL application services,
durable IDs, exact arithmetic, role-bound sessions and operation receipts.
This batch fixes three narrow integration gaps:

- A native MCP call may omit `arguments`. Previously even `list_deals` returned
  422. Omission now maps to an empty object; explicit null, missing required
  inputs, injected identity, unknown tools and unsigned mutations still fail.
  The locally installed official Playwright bundle's MCP `CallToolRequestParamsSchema`
  defines arguments as optional; no new dependency or protocol-version claim.
- Discovery now explains each tool's real purpose and prepare/execute boundary.
  `extract_constraints` explicitly describes external Nebius/Nemotron access,
  pending candidates and human confirmation, with `openWorldHint:true`.
  Other tool hints do not grant authority; server enforcement is unchanged.
- A subsequent real-socket check found native calls without Origin returned503
  on the built app: copying vinext's tracked Request proxy triggered Node's
  private-state brand error. A regression using the actual vinext wrapper
  reproduced503. Normalize from public URL/method/headers/body/signal fields
  instead; preserve streamed size limits and all prior origin/auth checks.

The initial regression reproduced422 instead of200 for an omitted-argument
read and only2 distinct descriptions for17 tools. Both then passed. Existing
MCP handler, route and multi-turn tests also passed. Added conversation checks
exercise the canonical workflow through actual MCP route handlers and real
PostgreSQL, with scripted turns and explicitly synthetic consent fixtures:

1. Preserve B's original proof, compile A's Rp3m shortfall, and persist the25%
   deterministic amendment with Rp5m minimum cash.
2. Stress the historical proof, reload durable state, and prove prepare does
   not execute. Reserve, refuse commit pending approval, reject admin approval,
   then approve through the separate approver route and reload current revision.
3. Commit one Sales Order; repeat the exact request without another mutation.
   Reject B's Rp5m liquidity collision without allocating capacity or advancing
   revision. A conflict audit row is expected evidence, not a successful mutation.
4. Mutate only the canonical synthetic AP obligation to Rp19m, observe STALE,
   obtain27% pending remediation with Rp5.2m minimum cash, and genuinely replay
   the old proof. Preserve the original Sales Order, commitment and cash movements.
5. With live provider disabled, extraction prepare stays offline and execute
   returns `LIVE_PROVIDER_NOT_AUTHORIZED` without fetch, data changes or a mock
   fallback. Existing extraction tests use controlled provider fixtures explicitly.

New test-development failures corrected array-match expectations, the approval
receipt's intentionally absent revision (requiring a fresh read), and the
expected conflict-audit write. These were test assumptions, not application bugs.
The new two-case conversation suite passed after those corrections. Exact final
clean-SHA results are in the companion Library recovery verification report;
candidate results are not relabeled as final runs. No full1276-test rerun is
needed for these bounded MCP edits; previous full-suite evidence remains historical.

## Three distinct evidence levels

| Level | What is implemented/testable here | What it does not prove |
|---|---|---|
| Simulated Alexa-style client | Scripted conversation invokes real MCP handlers and durable PostgreSQL services. The separate loopback HTTP smoke uses the compiled Node app. Test-issued consent/approver sessions are clearly synthetic. | No microphone, speech recognition, Alexa account, Amazon acceptance, human consent UX or live LLM tool selection. A scripted client must be labelled simulated. |
| Nebius/Nemotron integration | Fixed HTTPS endpoint, explicit live enablement, Nemotron model configuration, JSON mode,2048 output-token limit,5s timeout,64KiB response cap, no automatic retry; strict candidate/source validation, immutable pending version and human confirmation. | Fixture extraction is not a live model response. Model availability, actual supported parameters, latency, billed usage and output quality remain unverified. |
| Real Alexa/public client | Typed MCP interface and a pinned private compatibility profile exist. Identity is a signed local Judge session; mutation consent comes from a private trusted issuer. | Public HTTPS, OAuth/account linkage, actual Alexa transport/profile, user consent capture and public tenant identity are not implemented or verified by local tests. Do not expose the private cookie issuer/signing key or turn it into a model tool. |

The parent describes a competition path that permits simulated Alexa support.
The exact current official rubric/required deliverables were not supplied or
independently fetched under this network policy. Use that path only with an
explicit simulation label and owner-confirmed organizer requirements; it does
not waive the locked product's real AI-provider requirement or release gates.

## Prioritized remaining work and bounded decisions

| Priority | Work / exact decision needed | Current blocker and next acceptance evidence |
|---|---|---|
| P0 | Supply the official Chromium headless156.0.8078.4/revision1248 Linux x64 archive through Library, with byte size/SHA256/source provenance. | Producer received HTTP200 with195bytes of Site Unavailable HTML, not ZIP. No valid artifact uploaded. Ten browser cases are BLOCKED/not run, not passed or failed. After a valid artifact, run with sandbox enabled; if platform sandbox is unsupported, stop. No alternate download host or retry is authorized. |
| P0 | Approve a bounded **live provider smoke**, separately from publishing: existing Nebius account, exact currently available Nemotron model ID, cloud-only secret injection, explicit spending cap, and permission for only `api.studio.nebius.com`. | None executed. Proposed limit: at most3 requests, each at most2048 output tokens/5s/64KiB, no retries, synthetic bounded commercial text and redacted context only. Record model/prompt/schema/input hashes, actual response validity, latency and usage when returned; never key/authorization headers. Verify extraction remains pending and cannot approve/commit. Confirm model pricing/cap before enabling. This proposal is not network or spend authorization. |
| P0 | Confirm organizer's simulated-Alexa allowance, submission deadline/timezone, required AI/provider and access/deliverable requirements. | No submission action. Package an honestly labelled simulated-client explanation only if that track is confirmed. Real Alexa needs separate account/transport/authentication/consent design approval and public-hosting authorization; it is not a last-minute flag. |
| P0 | Resolve dependency release gate via supported fixes or an explicit current policy-compliant owner disposition. | Last full audit at0abdb8e:16aggregates,0critical12high4moderate,5unique npm URLs, plus embedded Undici findings. This batch leaves dependencies unchanged; no new audit claim. No force update, waiver, prerelease migration or audit omission. See stable-toolchain review. |
| P1 | Obtain canonical Sites metadata from its authorized owner and validate the existing build. | `SITES_HOSTING_CONFIG_REQUIRED`; Node target is separate. No fabricated metadata, site creation, gate deletion or deployment. |
| P1 | Complete browser UX review and final immutable-candidate Task29 packet after fixes/prerequisites. |10cases, responsive390/820/1024/1440 review, accessibility and interruption recovery; final whole-suite/coverage, benchmark/replay, race/RLS and restore evidence must state their actual tested SHA. Earlier1276-suite/restore results are historical, not proof of later code. Keep14 gate IDs/42 mappings. |
| P2 | Assemble final deliverables and video only after readiness, then user-directed laptop save. | No final video, submission, push, merge, public deploy or local execution now. Existing Library recovery artifact is the cloud handoff. |

## Completion risk

The local MCP fixes and bounded verification can finish in this session. A
simulated-client package still needs the browser/UX and real-provider gates plus
organizer requirements; it is not ready merely because these tests pass. With
prerequisites delivered and no new defects, allow roughly2–4active hours for
browser/UX verification,1–3hours for the approved provider smoke/corrections,
and2–4hours for final same-candidate evidence/packaging. These are planning ranges,
not measured runtimes or guarantees; remediation and external waiting are additional.
Delivery by19October is high-risk while browser, provider access and high audit
findings are unresolved. Real Alexa/public identity adds separate work and cannot
be promised on that schedule. No estimate here covers the other project.
