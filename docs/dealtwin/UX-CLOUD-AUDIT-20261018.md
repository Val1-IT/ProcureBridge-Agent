# Product UX continuation — source audit, 2026-10-18

Fresh-cloud update: JSX/typecheck, lint, Judge build and seven UI suites (42
tests) now pass. Interrupted-command recovery was fixed in `0361622`: the exact
attempt is retained before dispatch and uncertain responses are labelled
honestly. Six transport regressions pass; its added real-server browser case,
the prior three browser cases and visual/keyboard inspection remain unrun.
See [recovery evidence](CLOUD-RECOVERY-20261018.md). The following audit is
retained as the earlier source-level checkpoint, not current runtime certification.

Status: bounded improvements implemented; **browser and typecheck validation
pending**. This is not a visual certification or a claim of a polished product.
The owner requested a mature product prototype, within the locked DealTwin
workflow, and deferred video work until project readiness.

The product-design audit skill was requested but the skill service returned
`skill package is not available`. No corresponding repository skill exists.
This audit therefore uses the actual components, CSS, workflow/service contracts
and existing browser assertions directly.

## Baseline observed in current source

The existing implementation already has real server-owned state, explicit
compiler results, proof history, approval roles, synthetic labels, command
disablement during loading, and a twelve-step Judge guide. Existing E2E source
tests confirmation cancellation, commit denial, repeat commit, collision,
staleness and refresh persistence. Those tests were **not executed in cloud**.

Source inspection found these concrete presentation gaps before edits:

| Area | Baseline evidence | Implemented improvement |
|---|---|---|
| Recovery | `WorkflowView` returned `WorkspaceStatus` on read failure; that component had no callback or button | A real retry button invokes existing read-only `refresh`; no reset or local fallback |
| Navigation | Four links had no `aria-current` and there was no skip-to-main target | Active-page semantics/style, skip link and focusable main target |
| Narrow screens | CSS sets tables to min-width620px below700px; ledger/ERP tables lacked the existing scroll wrapper | Named keyboard-focusable scroll regions around ERP/ledger tables; existing timeline wrapper also focusable |
| Touch/keyboard | Focus style covered only buttons/header/inbox links; navigation did not wrap | General interactive focus, contrasting header focus,44px targets, wrapping navigation/actions |
| Action hierarchy | Compile/proof and reserve/commit controls appeared as two unlabeled groups | Explicit group headings and lifecycle explanations; underlying action names/handlers unchanged |
| Empty states | ERP and ledger displayed empty tables | Actual zero-row states explain absence of evidence/capacity |
| Error hierarchy | Command errors displayed raw JSON as the primary explanation | Visible stable reason code plus cautious guidance; raw server details remain inspectable in disclosure |

These findings are **source-level**, not a reproduced browser failure. The
changes are presentation/recovery enhancements, not a claimed fix of the old
Task23 HTTP500 or a transaction defect. Money, proof ownership, approval rules,
idempotency, request schemas, runtime provider, database and compiler code were
not changed. No new form, integration, fake button or fabricated transaction
data was added.

## Verification and remaining UX work

`git diff --check` passes. The supplemental11-case pure-core smoke predates
this UI package and covers only the unchanged pure engine; it does not validate
JSX, CSS, React interaction or the new recovery affordance.

Added three browser cases to the existing required E2E suite, **NOT RUN**:

- A deliberately interrupted workspace read, repeated failed retry, recovery
  after transport restoration, and exact unchanged server state with zero
  mutation requests. The transport failure is explicit test fault injection.
- At390px and1440px, keyboard skip-to-main, active navigation, focusable table
  regions, no whole-page horizontal overflow, back navigation, and unchanged
  authoritative server state.

Existing1440/1024/820full lifecycle assertions, per-command reloads, approval
denial, reset cancellation and idempotent retry were retained. No thresholds,
timeouts, skips or assertions were weakened. The new tests must be run against
the actual built signed-session app before this package is called verified.

A separate attempt to start installed Chromium with `chromium_sandbox=True`
failed with Playwright `TargetClosedError` before a page was created. Its
diagnostic output was truncated, so the underlying Chromium failure cause is
**undetermined**. No no-sandbox fallback or security configuration change was
attempted. No screenshot, actual app browser journey or video was produced.

Remaining product review: full lifecycle information hierarchy, selected proof
versus current-version clarity, route/back and interrupted mutations, uncertain
command outcome/retry messaging, focus after async recovery, screen-reader
announcements, contrast measurement, empty/missing-proof states, and visual
inspection at390/820/1024/1440. Review existing command retry handling for lost
responses before presenting it as interruption-safe; source review alone is
insufficient. Preserve explicit approval and cancellation boundaries.

## Bottom-up estimate, conditional on prerequisites

These are planning ranges in active working time, not measured completion
forecasts or a deadline promise. New failures can expand them.

| Remaining package | Active effort estimate | Waiting dependency |
|---|---|---|
| First real runtime result: locked install, fresh localPG, migrations, seed and build | 1–2h if prepared bundles work | Offline npm cache and PostgreSQL binaries; wait unbounded |
| Complete Task29 regression/coverage, races/RLS, benchmark/replay, two builds/scans, restore drill and evidence | 3–6h if no defects | Runtime, audit capability; defect repairs additional |
| Product UX implementation and real visual/interaction verification | 8–16h | Working signed-session browser environment |
| Alexa+ slice verification and complete simulated/actual interaction evidence | 4–8h | Working app/MCP; any external account path separately gated |
| Nebius runtime integration evidence | 4–8h provisional | Authorized runtime/model access and quota; wait unbounded |
| PayPal sandbox integration and failure/retry/webhook evidence | 8–16h provisional | Sandbox access and implementation review; wait unbounded |
| Submission package/readiness review | 2–4h after provider gates | Current audit/rules/setup/feedback and source changes evidence |

Minimum demo-ready requires durable shared core and one verified Alexa+ path;
it is not established by the pure smoke. A polished prototype additionally
requires the UX and interruption/accessibility checks above. Submission-ready
adds provider-specific evidence and required deliverables; publishing,
visibility/license changes, acceptance of terms and submission still require
separate authorization. Video effort is deliberately deferred, not scheduled
or included as completed work. Re-estimate immediately after the first real
runtime result; elapsed waiting time cannot be predicted from this environment.
