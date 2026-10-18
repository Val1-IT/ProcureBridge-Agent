# Task26 — local service-level MCP checkpoint

Resumed3133988 on2026-10-13, LENOVO-VT. Existing seven scaffold/test files retained;
old14 behavioral RED assertions read rather than rerun. Runtime source0150da5
and native-client fix24a3df5; witness correction4d1b754. Only Task26 is in scope.
Task25 implementation/provider/browser work was not restarted.

## Delivered local boundary

Seventeen strict allowlisted tools delegate to existing services for draft/update,
extract/confirm, compile/generate/stress/replay/recompile, reserve/commit/release,
allowlisted AP mutation and graph/proof/timeline reads. No SQL/table/tool/session
or consent-issuance argument. Identity comes from the signed server session.
Prepare validates shape only: no database client, provider or mutation; it never
means financially eligible. Execute requires a five-minute maximum signed grant
bound to actor/tenant/role/tool/exact payload/revision/key. The trusted host must
collect actual human intent before calling the private issuer; a model boolean
is not consent, and there is no public issuer endpoint or MCP issuer tool.

Conversation serialization contains IDs, revision and pending intent only. It
is not financial/auth authority. Durable entities remain PostgreSQL truth.
Historical receipt data is unchanged; older returned revisions cannot rewind
known conversation state. Current STALE/INVALID selected proof requests refresh.
New executor instances read the same persisted version/proof/constraints.

## Actual focused evidence

- Retained14RED →14/14PASS12.74s; route7RED501 →7/7PASS13.93s.
- Historical receipt rewind and successful STALE-read handling:4FAIL/5PASS
  (two pure plus two actual repository conversations), then9/9PASS11.68s.
- Combined focused25/25PASS100.44s,3files,0skips. Actual app/reset login roles,
  ordinary application commands, real locks/receipts/rollback; not SQL business
  fixtures masquerading as commands.
- Native-origin omission: actual403 instead200 RED;8/8routePASS39.12s after fix.
  A Cloudflare/global Request clone typing collision was corrected only in the
  test constructor; assertions and browser-origin denial retained.
- Typecheck incremental=false/lint max-warnings0/diff check PASS. Staged bounded
  secret/artifact scan11files0findings; not exhaustive release certification.
- Dedicated Node build PASS all five stages. Existing dynamic-import notice
  remains; no broad framework/dependency patch.
- Actual private Node HTTP smoke8namedchecks PASS: initialize/discovery, harmless
  prepare, missing-grant denial, real Rp3m/date compile, exactly one revision and
  unchanged cash, original-response retry, payload mismatch, SQL/anonymous/origin
  denial. Production artifact24a3df5, helper correction subsequently4d1b754.
  Report: ignored output/dealtwin/task26/native-mcp-smoke.json. Owned4177server
  stopped afterward. First smoke failed before scenarios because it incorrectly
  assumed reset rewinds revision to1; witness now reads actual revision and still
  asserts current+1. No reset/compiler/service contract weakened.

First frozen-source completion gate at4d1b754:114files/1109tests PASS,
zero failures/skips,684.69s. Legacy configured coverage97.78% statements/lines,
85.64% branches,99.21% functions; not full DealTwin coverage.

One fresh independent GPT-6 Astra read-only review of3133988..4d1b754 returned
CHANGES_REQUIRED: two Important findings, no Critical/Minor. Successful graph or
unrelated reads could erase the selected STALE warning; replay/stress selecting
another proof without owner IDs could retain the previous Deal/capacity tuple.
Parent retained both Important grades. Reproducer:8FAIL/8PASS16tests14.85s,
including actual app-role PostgreSQL conversations. Minimal reducer fix:
16/16PASS14.62s; fresh typecheck/lint0warnings/diffcheck PASS. Fix source checkpoint
e284d9be257c223efc67f6d54bc7a4924e6f5c92. No financial-service response, receipt,
compiler, schema or permission contract changed. One fix pass only; no re-review.
Post-fix frozen full at e284d9b:114files/1116tests PASS,0failures/0skips,
1305.49s, including all33MCP cases (16conversation/8route/9handler) and retained
finance/sales/payment/reset/schema/RLS/race regression. Coverage scope unchanged:
97.78% statements/lines,85.64% branches,99.21% functions. Gate command:
`npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot --reporter=json --outputFile=.cache/task26-review-final-20261013.json`.
The executing-plans task-done helper recorded3133988..e284d9b only after exit0.
Source stayed frozen; only checkpoint documentation changed during that run.
One pg queued-query deprecation warning was emitted (future pg9 compatibility);
this was not a failed test or lint warning, and no driver patch is included.

## Rulings (and cost if wrong)

1. Constructor/factory-bound ports preserve executeDealTwinTool(actor,request).
   Cost: consumers must bind services; no ambient database dependency in core.
2. Mechanically move existing request schemas into a transport-neutral application
   module; original HTTP exports/byte parser unchanged. Cost: parity regression
   must catch schema drift, rather than maintaining two competing validators.
3. Domain-separated HMAC reuses the private session signing key, with separate
   purpose/actor/payload/expiry validation; no public issuer. Cost: trusted host
   human-confirmation integration is still required, not provided by a model.
4. Explicit legacy compatibility binding, not latest2026/Alexa/OAuth support.
   [MCP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
   permits JSON replies/405 for no SSE and optional sessions; tools use
   [structured plus text results](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
   Cost: live client/account/auth interoperability needs separate evidence.
5. Originless nonbrowser calls allowed only after session authentication and no
   browser fetch metadata; browser omissions/cross-origin rejected. Normalize at
   this route only to reuse unchanged4KiB parser. Cost: this private cookie profile
   is not a public transport/auth solution; generic ERP origin checks stay strict.
6. Replay preserves original receipt and uses refresh for older convenience IDs;
   no extra database read or financial calculation in the adapter. Cost: callers
   must refresh after historical/stale responses; stored identifiers never grant
   capacity or bypass the underlying proof/revision/approval gates.
7. Native smoke uses live monotone revision, not fixed fixture revision1. Cost:
   canonical business output remains separately asserted (Rp3m/Sept22/unchanged
   cash), so changed seed cannot pass merely because a counter increments.

## Reviewer-declined boundaries, parent rulings

8. Public OAuth/Alexa registration and remote-client interoperability stay
   outside the private local profile. Cost: separate authorized integration and
   authenticated client evidence are required before a public-edition claim.
9. End-user confirmation UI is not supplied by the private signing helper.
   Cost: a trusted host must collect actual intent; no model self-consent or
   public signing tool may be substituted.
10. Live Nebius Task25 execution is not restarted. Cost: credential/quota
    authorization and a later real-provider smoke remain required separately.
11. Parent executes regression; reviewer made no independent runtime/deployment
    assertion. Cost: these local tests do not prove hosted CI/PG16, migration
    release, production readiness or broader Tasks18–25 independent acceptance.
12. Preserve the worktree and ignored plan ledger/artifacts, and stop atTask26,
    as expressly requested, instead of skill cleanup/automaticTask27 continuation.
    Cost: retained private artifacts need deliberate later maintenance; next tasks
    and any integration need a new human instruction. No deferred Minor findings.

## Boundaries and next step

No new dependencies/schema/grants; no public OAuth/Alexa account, hosted CI/PG16,
live Nebius call, push/merge/deploy/publish/submission or production/real data.
Native disposable PostgreSQL15.4 only,55632/dealtwin_test, same owned data directory,
fsync/synchronous_commitON and NOSUPERUSER/NOBYPASSRLS app/reset logins verified.
No heavy tests/builds overlapped. Private auth/grants/traces are not shareable.
Task27–29 and broader release/security/provider gates remain outside this request.
Task26 local gate closed after one review-fix pass; no unresolved Important or
Critical finding from that review. No second independent approval is claimed.
Original checkout reverified clean at e69b60caa8d4aa108cebc199b4ce49a42f64b3b7,
branch feat/dealtwin-proof-carrying-commerce. Code checkpoint is e284d9b; this
report/status/README/traceability closure adds documentation only. Worktree,
private ignored evidence and plan ledger retained. Owned4177server was stopped
after smoke; owned55632cluster stopped normally after final suite and verified
zero other clients, preserving its data directory. Unrelated5432/other services
were not stopped. Task27 is the next roadmap
task, NOT started or implicitly authorized by this checkpoint.

## Changed paths (Task26 range, including documentation closure)

- lib/dealtwin/application/workflow-schemas.ts; lib/server/dealtwin/workflow-request.ts
- lib/dealtwin/mcp/tool-schemas.ts; tool-handlers.ts; conversation-state.ts
- lib/server/auth/mcp-confirmation.ts; app/api/dealtwin/mcp/route.ts
- scripts/dealtwin/mcp-smoke.ts
- tests/dealtwin/mcp/tool-handlers.test.ts; multi-turn.test.ts; route.test.ts
- README.md; STATUS.md; docs/dealtwin/PAUSED-20261013.md; TRACEABILITY.md;
  TASK26-VERIFICATION.md
