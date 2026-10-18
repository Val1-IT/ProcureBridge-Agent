# DealTwin Task29 cloud gates — PARTIAL, release blocked

Continued in the same workspace/session. No application source, lockfile,
threshold, assertion, browser isolation, network policy, or release gate changed
in this batch. Tested clean candidate:
`413c0e42c9bc42c5ede838dbb24f8f914df9af38`, tree
`91630adc799c7cf5a3452c67ef76105c007d20e1`. Its application source remains the
pool fix in `523c9ede29afa3abed32e84023a6edbf728d579d`.
All later changes in this checkpoint are verification documentation/evidence.

Evidence directory: [cloud-gates-20261018](evidence/cloud-gates-20261018/).
Every command wrapper records candidate, arguments, exit code, elapsed time and
clean status. Coverage was started and finished on the clean candidate; its
older wrapper records candidate/time but not a separate dirty field. No test
selection or coverage exclusions were added. Existing historical evidence is
retained. Task29's mandatory checklist comes from the approved plan, CI and
`evaluation/dealtwin/release-gate.ts`; local successes do not waive other gates.

## Stable gate checklist

| Gate | Latest evidence and exact scope | State |
|---|---|---|
| Full regression + coverage | 124 files, **1264 PASS /0 FAIL /0 SKIP**, 263.924s; includes 25 real PostgreSQL suites | PASS locally |
| Coverage thresholds | Overall lines/statements95.98%, functions99.36%, branches83.60%; all five per-module thresholds pass unchanged | PASS |
| Typecheck / full lint | exit0,3.847s / exit0,12.278s | PASS |
| Migrations / restore | 3 migration digests,45 tables, full row and canonical catalog equality on separate PG16.15 target | PASS synthetic rehearsal |
| RLS / cross-tenant / least privilege | Whole-suite tests; restored app login sees zero rows in44 foreign-tenant tables; foreign insert/update denied; app/reset NOSUPERUSER NOBYPASSRLS | PASS locally |
| Payment / receipt / replay after restore | Original+reversal retained,3 immutable receipts, linked committed SO, proof replay, original retry responses; reset and new payment/cancel continue revisions5→6→7→8 | PASS |
| Repeated race / benchmark | 113 cases;3 independent-pool service iterations on restored schema; zero race/duplicate/staleness/idempotency failures | PASS |
| Independent mismatch replay | 57/57 fixed-rule discrepancies reproduced in a new process | PASS |
| Node build / public-client scan | exit0,4.923s;60 files,0 scanner findings | PASS |
| HTTP production asset boundary | Existing request-only Playwright case:1PASS,0FAIL/skip,5.078s wrapper; real JS/CSS, traversal404, foreign Host421, asset POST405 | PASS HTTP only |
| Browser Judge UX / responsive / accessibility / refresh durability | 10 browser cases not selected; unsupported sandbox/absent supported browser tool unchanged | BLOCKED |
| Configured Sites/Cloudflare build + scan | exit1, `SITES_HOSTING_CONFIG_REQUIRED`; canonical `.openai/hosting.json` absent | BLOCKED |
| Current dependency audit | Registry response received;22 affected package aggregates:2critical,14high,6moderate; exit1 | FAIL / release blocking |
| Source/config/credential check | Bounded571-file scan excluding read-only sources; no private runtime secret/token/key hits; historical local paths reviewed | PASS bounded scope |
| Public TLS / public identity / live provider integrations / hosted CI | Not executed or inferred from loopback synthetic checks | NOT PROVEN / outside current authorization |
| Final passing exact-candidate42-ID release packet | Cannot truthfully satisfy failing/missing gates above | BLOCKED |

HTTP asset delivery does not prove DOM hydration, navigation, responsive layout,
accessibility, visual polish, browser retries or every-step refresh. No final
video, submission, push, merge, deploy, public server, production data, paid
provider, or new network domain was used.

## Coverage and benchmark details

`coverage-tests.json`, `coverage-run.json`, `coverage-summary.json` and
`coverage-groups.json` retain the full results. Vitest counts283 nested suites;
**124** is the test-file count. Whole-suite execution used the existing serial
configuration and real SCRAM-authenticated PostgreSQL on127.0.0.1:55432.

| DealTwin group | Lines/statements | Functions | Branches |
|---|---:|---:|---:|
| domain |92.90%|100%|86.30%|
| compiler |95.09%|100%|88.82%|
| proof |93.02%|100%|75.17%|
| recompiler |100%|100%|90.38%|
| application |98.15%|98.46%|81.87%|

Existing thresholds remain70% lines/statements/functions and60% branches,
overall and per configured DealTwin group. Coverage is scoped to the unchanged
`vitest.config.ts` include list, not every repository file.

Fresh immutable benchmark run `cloud-gates-413c0e4-20261018`:
13 core+100 generated cases, compiler0/68 false-feasible and0/45 false-infeasible;
fixed-rule35/68 and22/45 errors. Same-day ordering0/40, proof replay0/113,
amendment0/113 mismatches. Each DB service metric observes0/3 failures.
Extraction4/4 uses the explicitly labeled offline synthetic contract fixture;
LLM-only/live provider remains `NOT_MEASURED`. Benchmark13.109s;
independent mismatch replay4.707s. Source fingerprint:
`19e06ca6b2aed71f4861b133282a0c2cdf903b6136f0af61b834e6d4cc505c73`.

## Synthetic restore rehearsal

Used the already installed workspace PostgreSQL16.15 binaries, no new package
or image. Source cluster55432 was preserved. A separate task-owned cluster at
55632 used the exact guarded database name `dealtwin_test`, loopback binding,
private Unix socket, SCRAM authentication, fsync,128MB shared buffers and bounded
workers. Existing private bootstrap credential was reused; app/reset roles
were provisioned by the existing synthetic harness. No credentials are in the
shared evidence. Cluster data, binaries and dump remain available locally.

The fixture used actual application/repository commands: canonical reset,
partial AP payment and cancellation, fixed-term approved proof, reserve and
commit. Revisions progressed1→2→3→4→5. `pg_dump --format=custom` then
`pg_restore --exit-on-error --single-transaction` restored into the separate
empty target. No global role/password dump was made. Login roles are target
prerequisites; their non-secret attributes and memberships were compared.

The verifier compares every row of all45 public tables and10 catalog groups:
tables/RLS/owners/ACLs, columns/defaults, constraints, policies, triggers,
functions/owners/ACLs, indexes, grants, roles and memberships. This schema has
no sequences. The harness has no migration tracking table: the real sorted
three-file inventory/digests and resulting catalog are recorded; no migration
rows are invented. See `migration-restore-inventory.json`.

All CHECK definitions are canonicalized through PostgreSQL's own parser by
adding each definition to a temporary `LIKE` table, then reading it back.
No parentheses are stripped, constraints omitted, or financial assertions
relaxed. One raw CHECK definition changes only associative AND grouping after
dump reload. The original definition and exact difference are retained.

Restored row hash:
`7e39956c0c49115e581f0419460429bb01356d9756b1e1bb90c092c2566e2d7d`.
Canonical catalog hash:
`5e168018d709f4c52ecfc6134a41325a9660425716982e11b05f481c8d0a6617`.
Canonical Judge business seed before backup and after restored reset:
`64d53829e3755c1c872680d05e82adfc170f985702cbfa50582aedd1505eca85`.

The restored database preserved both cash entries,3 success receipts, the
commitment/version/deal/Sales Order relationship and replayable proof.
Repeating original reserve/commit returns identical responses without changing
any row/catalog; receipt update is denied. App-role cross-tenant reads are
empty and writes denied. Reset advances5→6 with the same seed hash; a fresh AR
payment/cancel advances7→8. Benchmark then exercises three real two-client
races plus retry/staleness flows on the restored schema. HTTP fixture setup
resets synthetic business state only, without dropping the restored schema.

Runner development failures are preserved, not counted as product regressions:

- Initial target preparation dropped `public`; PG16's dump expected the
  pre-existing standard schema. First restore exited1 and rolled back;
  verification consequently failed against an empty target. Creating empty
  `public` fixed preparation; restore then exited0.
- Exact raw catalog comparison failed on the single AND-parenthesis rendering
  difference. PostgreSQL parser canonicalization now compares every CHECK.
- Receipt counting initially expected only string`"true"`; stored receipts use
  boolean`true`, also supported by the production decoder. Verifier now accepts
  both supported encodings and still requires receipts. Final verification
  passed,4.126s wrapper. No application code/assertions/thresholds were changed.

## Audit, provenance, and shutdown

`npm-audit.json` is a fresh successful registry response, not a network failure.
No dependency fix or waiver was applied. Some suggested fixes are major changes
or downgrades; automatic `npm audit fix --force` was not used. A bounded follow-up
must triage reachable paths and compatible updates, preserving both build
contracts and rerunning affected/final checks. The22 counts are affected package
aggregates, not22 distinct exploits or proven runtime-reachable vulnerabilities.

Effective HTTP network policy still has exactly `registry.npmjs.org` and
`sdmntprwestcentralus.oaiusercontent.com`, with no additional TCP domains/IPs.
Lockfile SHA256 remains
`be4c7d6db1ea524f4a236d3fd6f7ef932fd0c2badc9fd323d3f0436048e2fa54`.
Bounded source/config review confirms disposable DB guards, remote verified TLS,
loopback HTTP Host/method checks, required Chromium sandbox and fail-closed Sites
metadata. Seven historical documentation/handoff files contain old personal
machine paths; one security test deliberately tests path leakage. They are
preserved and never used as executable paths in this workspace.

Playwright's JSON serializes webServer environment. The shared report redacts
its private session value and local credential URLs; counts/assertions remain
unchanged. Original raw reports stay private outside Git and outside the
Library package. `raw-artifacts.json` hashes original bytes; `SHA256SUMS` hashes
shared sanitized evidence. The package contains no auth-state files, signing
keys, owner password, node_modules, live database directory or raw secret report.

Both task-owned PostgreSQL clusters were stopped normally. `pg_ctl status`
returns3 for each, PID files are absent, ports55432/55632/4177 are closed; no
other client's process was stopped. Source remains revision5; the target retains
a canonical synthetic HTTP fixture after the measured benchmark. Prior
containers/workspaces were not touched. See `stopped-process-state.json`.

## Minimal remaining steps

1. Triage and remediate the current high/critical dependency findings in a
   bounded compatible batch, or obtain a documented policy decision; do not
   relabel the failed audit as pass.
2. Obtain a legitimate supported sandboxed browser runtime/tool, then execute
   the10 existing browser cases at the required viewports and inspect UX,
   accessibility, error recovery and persistence. No sandbox bypass is permitted.
3. Supply canonical authorized Sites configuration to verify the preserved
   target, or obtain an explicit approved gate/scope decision. Do not invent
   hosting metadata or delete the gate.
4. Resolve required external live/TLS/identity/hosted-CI evidence only with
   specific authorization. Freeze the resulting candidate and bind all42
   requirements to actual same-candidate artifacts before any readiness claim.
   Final video remains deferred until the project is ready.
