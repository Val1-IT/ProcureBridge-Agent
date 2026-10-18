# Task28 — local security gate closed; public release BLOCKED

Base: `7b8037d40d94926f306d316cdfe085c809d80fe6`.
Final tested source: `40c87fb13b9953785193311b8b37a6d71874b082`.
The following handoff checkpoint changes documentation only; it does not claim
that the resulting documentation-only SHA was rerun as a release candidate.
Same isolated, externally managed detached worktree; Task27 was not restarted.
Stop for owner review before Task29. No push, merge, deploy, publication, live
provider call, production infrastructure or real financial data.

## Actual result and environment

Windows LENOVO-VT; Node24.19.0, npm11.17.0, Vitest3.2.7.
Native PostgreSQL15.4 at loopback55632/dealtwin_test, preserved ignored
.cache/dealtwin-pg-task18. Exact target, fsync=on, synchronous_commit=on,
source_text fixture, actual dealtwin_app_login/dealtwin_reset_login
NOSUPERUSER/NOBYPASSRLS and zero other clients checked together before the
long gate. FORCE-RLS test owner/table ownership rolled back correctly.
Heavy tests/builds ran serially after checking other project processes.
Local15.4 evidence is NOT hosted CI/PostgreSQL16 evidence.

Final frozen full regression/coverage: **119files,1185/1185PASS,0fail,0skip,
387.77s,exit0**, JSONsuccess=true. Includes actual payment/save/reload/
cancellation/reversal(2), reset(6), RLS(10), commitment transaction(28),
lifecycle(37), race(23), failure injection(7), invalidation, cross-tenant API,
all original finance/sales and new security(35) cases. Existing pg queued-query
future9 deprecation remains a warning, not a failure or driver-upgrade claim.

| Configured group | Lines/statements | Functions | Branches |
|---|---:|---:|---:|
| Global configured include list |95.98%|99.36%|83.60%|
| DealTwin domain |92.90%|100%|86.30%|
| Compiler |95.08%|100%|88.81%|
| Proof |93.02%|100%|75.17%|
| Recompiler |100%|100%|90.38%|
| Application |98.15%|98.46%|81.87%|

Unchanged thresholds70/70/70/60 all PASS; no exclusions/skip/timeout relaxation
to conceal a regression. Coverage applies to the configured module list, not
every file in the repository.

Typecheck incremental=false and lint max-warnings=0 PASS after the scanner
fix. Both Cloudflare and Node production-artifact builds PASS serially on
8219cd1; the only subsequent source delta is one CI comment, not runtime/
dependency/build configuration. With synthetic signing/provider canaries,
the corrected scanner checks **all regular public files**, including SVG and
binary metadata: Cloudflare73/Node70files,0issues. Earlier60/59counts were
extension-limited and do not serve as the final hygiene evidence.
Existing ineffective dynamic-import/static route-classification notices remain.
No browser or live-provider smoke was rerun or relabelled fresh.

## RED to GREEN and failure transparency

- Required initial RLS/security behavioral RED:25assertion failures/9passes,
34cases4.85s, not import/config errors. MinimalGREEN36/36PASS4.24s;
tightenedSQLSTATE/owner36/36PASS2.67s; expandedsecurity/RLS40/40PASS2.64s.
- Tool group Vitest/coverage3.2.7,Vite8.0.16:67/67PASS6files21.24s and
NodebuildPASS. RuntimegroupNext15.5.28,React/DOM/RSC19.2.8,
ESLintNext15.5.28 plus same-major overrides:118/118PASS19files80.96s
andNodebuildPASS. Named compatible transitive group13changedpackages:
40/40PASS and both buildsPASS. No force, legacy-peer or blind downgrade.
- Independent Astra review found plaintext public SVG/TXT/XML assets bypassed
the scanner. New mixed safe-JS/leaking SVG/TXT/XML/extensionless/PNG fixtures
produced genuineRED5FAIL/30PASS35cases4.40s. Removing only the extension filter
givesGREEN45/45security/RLS cases2files3.45s. Symlink refusal/value redaction
remain intact. This is bounded plaintext detection, not encoded-secret proof.
- First full run8219cd1:1184PASS/1FAIL1185cases372.84s,0skips. Sole failure:
the existing judge-readiness CI guard's /deploy/i matched a new comment
forbidding deployment. No financial/PG test failed. Rephrased only that comment;
the guard and all CI job behavior are unchanged. Related17/17PASS541ms,
then the final full run above PASS. Failed JSON/log evidence is preserved.
task-done correctly refused completion for the failed run and recorded Task28
complete only after the final exit0.

Commands actually executed (focused groups and intermediate build logs are
retained in the evidence paths below):

```text
npm.cmd test -- tests/dealtwin/postgres/rls.test.ts tests/dealtwin/security/server-boundary.test.ts
npm.cmd test -- tests/dealtwin/security/server-boundary.test.ts
npm.cmd test -- tests/judge-readiness.test.ts
npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot --reporter=json --outputFile=.cache/task28-final-green-20261015.json
npm.cmd run typecheck -- --incremental false
npm.cmd run lint -- --max-warnings=0
npm.cmd run build
npm.cmd run security:client
npm.cmd run judge:build
npm.cmd run security:client
npm.cmd audit --json
```

The full command ran through task-done with Task28/base7b8037d; the actual
focused runs also used JSON reporters where indicated in the retained logs.

## Dependency disposition — public promotion is blocked

Fresh audit **35 to22 affected package aggregates**:
4critical/24high/7moderate to **2critical/14high/6moderate**; both exit1.
These are npm package aggregates, not22 independently demonstrated exploits.
Package-lock SHA256:
BE4C7D6DB1EA524F4A236D3FD6F7EF932FD0C2BADC9FD323D3F0436048E2FA54.
Remaining Cloudflare/miniflare/wrangler, test-pool/coverage, image tooling,
lint/matching, vinext and Drizzle toolchain findings are described in
docs/security.md. Static triage initially retained all35 as needs_review;
no universal runtime exploitability or non-reachability claim was made.
Managed static triage artifact: artifacts/triage/task28-audit-before.json,
digest dcecc198fc4a236cca525a4c464dc6e119012c8fd5dde409c55f984373a67553.

Human explicitly authorized audit metadata plus compatible patch downloads
from registry.npmjs.org after the first auto-review refusal. Registry is
HTTPS/no embedded URL credentials. No business/production payload was sent.
The newest and first-patched Cloudflare plugin groups require workers-types5
while this repository has4; ERESOLVE was not bypassed. No unauthorized major
migration, major downgrade, forced resolution or renewed expired waiver.
Any remaining high/critical finding blocks public deployment absent a separate
current owner-approved time-bounded non-reachability decision. None exists here.

An automatic GitHub artifact-upload addition was rejected before writing;
it was not applied. CI retains runner-local evidence only. No upload,
publication or remote workflow was triggered. Future remote evidence transfer
requires destination approval. Hosted CI is NOT RUN and would currently block
on the recorded dependency audit.

## Review, decisions and remaining boundaries

One read-only sol_reviewer/gpt-6-astra/high review covered7b8037d..dfb6ff1:
0Critical,1Important,1Minor. Parent confirmed the Important scanner bypass,
fixed it in one RED-to-GREEN pass and verified the full green suite. No
re-review. The CI comment regression was diagnosed within that same pass.

Deferred Minor: JavaScript regex end anchors accept final line terminators in
SHA/artifact metadata. The validator remains structural-only and cannot
authorize deployment. Follow-up should enforce exact SHA length/end-of-input
and reject control characters, with newline/CR/Unicode line-separator cases.

Rulings made, with costs if wrong:

1. Reuse approved architecture/Task27 baseline, not a design restart or redundant
baseline suite. Pure14-check metadata validator is not artifact authenticity
or Task29's42-ID aggregator. Cost: trusted ingestion/actual target evidence
remains required; synthetic matching JSON is not promotion authority.
2. Audit live and pin compatible groups only, never force/downgrade/renew a
waiver. Cost: unpatchable current-line advisories remain release blockers.
3. Add minimal remote-TLS guard and emitted-artifact scanner beyond the listed
files. Cost: shared config needs regression; bounded patterns are not universal
secret/penetration certification.
4. Keep Cloudflare group unchanged after demonstrated workers-types major5
peer conflict. Cost: high findings require an approved compatibility migration.
5. Replace denied automatic GitHub upload with runner-local artifacts only.
Cost: future remote retention/transfer needs explicit approval.
6. Reviewer set aside artifact signing/content authenticity: structural checks
do not attest contents. Cost: consumers must independently verify provenance.
7. Reviewer set aside Task29's42-requirement aggregation: not implemented here.
Cost: release completeness remains unproven.
8. Reviewer set aside public auth/TLS termination/restore drills/hostedPG16CI/
production browser: only local authorized evidence is claimed. Cost:
target-specific defects remain untested and public promotion blocked.
9. Reviewer set aside universal advisory non-reachability: unproven.
Cost: no waiver, remediation/owner decision still required.
10. Reviewer set aside encoded/obfuscated secrets: bounded all-file plaintext
scan only. Cost: encoded secrets need separate controls.
11. Reviewer set aside final suite: parent ran actual frozen PostgreSQL coverage,
now1185/1185PASS. Cost: this does not certify other environments.
12. Preserve CI security assertion; rephrase only the forbidden-deployment
comment. Cost: legacy lexical guard remains fragile, no weakening/refactor.
13. Keep detached worktree, ignored ledger/data/artifacts and stop for review.
Cost: later cleanup/integration and Task29 require further authorization;
no finishing-skill cleanup or integration menu overrides the user's boundary.

Actual evidence locators (ignored/local, not automatically published):

- .cache/task28-audit-before-20261015.json and task28-audit-after-20261015.json
- .cache/task28-review-red-20261015.json and task28-review-green-20261015.json
- .cache/task28-final-20261015.json and task28-first-full-20261015.log (failed)
- .cache/task28-ci-comment-green-20261015.json
- .cache/task28-final-green-20261015.json and coverage/coverage-summary.json
- .cache/task28-final-typecheck.log and task28-final-lint.log
- .cache/task28-final-cloudflare-build.log and task28-final-cloudflare-scan.json
- .cache/task28-final-node-build.log and task28-final-node-scan.json
- .superpowers/sdd/2026-09-11-dealtwin-proof-carrying-commerce/task-28-tests.log
and progress.md (retained, not deleted).

Source checkpoints: ddba04ef47127a7038ffee63b2b32840dcc8b1cf,
dfb6ff1e9eaf57bcdc38387a9fc31d5d9aa0cc35,
8219cd1ff2a739dc8c07ea4af5fdf971882b09ca,
40c87fb13b9953785193311b8b37a6d71874b082.

Final environment readback: exact owned55632/dealtwin_test had zero other
clients, expected app/reset roles and restored cash-account owner; normal fast
shutdown completed and pg_ctl status3 confirms no server running. Data/cache
and ignored evidence remain. Original checkout is clean at e69b60c; sources/
unchanged. Bounded high-signal literal secret scan13changed files0issues,
not exhaustive certification. git diff --check PASS. Only STATUS.md, this
report and TRACEABILITY.md differ from the fully tested40c87fb source.

Changed files across Task28:

```text
.github/workflows/ci.yml
STATUS.md
docs/dealtwin/DEPLOYMENT.md
docs/dealtwin/TASK28-VERIFICATION.md
docs/dealtwin/TRACEABILITY.md
docs/security.md
evaluation/dealtwin/release-gate.ts
lib/server/postgres/config.ts
package-lock.json
package.json
scripts/dealtwin/check-client-artifacts.mjs
tests/dealtwin/postgres/rls.test.ts
tests/dealtwin/security/server-boundary.test.ts
```
