# Technical Proof

## Source checkpoint

- Material implementation and submission asset commit: `d0de94cf8fdddee1d1a7a40360ad360250273d1d`
- Branch: `main`
- Worktree at checkpoint: clean (`git status --short --branch` returned only `## main`)
- The final proof-only commit and deployment commit are reported in the handoff because a Git commit cannot embed its own SHA.

## Runtime

- Node.js: `v24.8.0`
- npm: `11.6.0`
- Application version: `0.2.0`
- Default call provider: `MockCallProvider`

## Fresh command evidence

### Type checking

Command: `npm.cmd run typecheck`

Result: exit code `0`. TypeScript ran `tsc --noEmit` and reported no diagnostics.

### Lint

Command: `npm.cmd run lint`

Result: exit code `0`. ESLint checked the repository with generated build directories excluded and reported no warning or error output.

### Automated tests

Command: `npm.cmd run test`

Result: exit code `0`; **8 test files passed, 43 tests passed, 0 failed**. The run covered 5 result tests, 2 webhook tests, 10 guardrail tests, 2 call-machine tests, 3 persistence tests, 3 reducer tests, 3 CALL-E provider tests, and 15 judge-readiness tests.

### Production build

Command: `npm.cmd run build`

Result: exit code `0`. Vinext completed all five build stages and emitted application routes including `/submission`, `/architecture`, `/technical-notes`, `/collection`, `/collections`, `/dashboard`, `/promises`, `/disputes`, `/audit`, call and result pages, `/api/health`, CALL-E call routes, and the webhook route.

## Route smoke test

Browser-independent HTTP requests against the built local source returned:

| Route | Status |
| --- | ---: |
| `/` | 200 |
| `/dashboard` | 200 |
| `/collection` | 200 |
| `/architecture` | 200 |
| `/technical-notes` | 200 |
| `/promises` | 200 |
| `/disputes` | 200 |
| `/audit` | 200 |
| `/submission` | 200 |
| `/api/health` | 200 |
| `/submission-screenshots/landing.png` | 200 |
| `/submission-screenshots/audit-log.png` | 200 |

Health response:

```json
{"status":"ok","app":"Arvanta ProcureBridge Recovery Agent","mode":"demo","callProvider":"mock","version":"0.2.0"}
```

## Browser and visual evidence

- Fresh browser session: 0 console errors and 0 warnings.
- 1440 × 900 desktop: no horizontal overflow; six final screenshots visually inspected.
- 1366 × 768 laptop: no horizontal overflow on the landing presentation.
- 1024 × 768 tablet: no document-level horizontal overflow across Dashboard, Collection Queue, Invoice Detail, Call Console, Structured Result, Promise Tracker, Dispute Center, Activity, Architecture, Technical Notes, and Submission Hub.
- Keyboard navigation: the first Tab key reached the home brand link; global `:focus-visible` styling is present.
- Reduced motion: `prefers-reduced-motion: reduce` disables meaningful animation and transition duration.
- Static gallery assets load directly; the Submission Hub reported no broken images.

## Workflow evidence

- Judge flow: started from the landing page, completed both approvals, passed eight guardrails, completed the promise call, approved the result, created Rp7,500,000 due 10 August 2026 with follow-up 11 August 2026, and displayed related audit evidence.
- Refresh on Promise Tracker retained the approved commitment and guide state.
- Exit Demo restored the pre-demo snapshot; Promise Tracker returned to its empty seed state.
- Reset Demo Data confirmed the destructive browser-only action and returned to Dashboard.
- Presentation Fallback selected Instant Result, reset the main scenario deterministically, and displayed `Presentation Fallback — Demo Data`.
- Dispute scenario created the CV Maju Teknik dispute for `INV-2026-0774` and surfaced it in Dispute Center.
- Failed-contact scenario completed with `pic_unavailable`, no promise amount, and a 09:30 follow-up action.
- JSON and Markdown reports downloaded successfully. The inspected JSON masked the phone as `+[MASKED] 8401` and email as `[MASKED]@karyadistribusi.demo`.

## Repository structure

```text
app/                         multi-page UI and route handlers
components/                  shared shell, store, and Judge Demo controls
lib/domain/                  approval, guardrail, call, and result state machines
lib/demo/                    seed, persistence, reducer, reports, and simulation
lib/calle/                   provider contract, live adapter, mock, and webhook logic
lib/repository/              demo and optional Supabase repository boundaries
tests/                       offline automated critical-path tests
supabase/schema.sql          optional production database foundation
docs/submission-package/     judge copy, scripts, shot list, proof, and risks
public/submission-screenshots/ presentation-ready PNG evidence
```

## Critical implementation files

- CALL-E contract and adapters: `lib/calle/types.ts`, `lib/calle/client.ts`, `lib/calle/mock-provider.ts`
- CALL-E API boundary: `app/api/calls/route.ts`, `app/api/calls/[callId]/route.ts`, `app/api/calls/[callId]/end/route.ts`
- Webhook boundary: `app/api/calle/webhook/route.ts`, `lib/calle/webhook-handler.ts`
- Demo Store: `components/demo-store-provider.tsx`, `lib/demo/persistence.ts`, `lib/demo/reducer.ts`, `lib/demo/seed.ts`
- Judge and fallback mode: `components/judge-demo-provider.tsx`, `components/judge-demo-guide.tsx`, `lib/demo/judge-mode.ts`
- Supabase: `supabase/schema.sql`, `lib/repository/types.ts`, `lib/repository/supabase-repository.ts`
- Critical tests: `tests/guardrails.test.ts`, `tests/call-machine.test.ts`, `tests/results.test.ts`, `tests/persistence.test.ts`, `tests/reducer.test.ts`, `tests/calle-provider.test.ts`, `tests/webhook.test.ts`, `tests/judge-readiness.test.ts`

