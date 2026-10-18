# PostgreSQL cloud verification — 2026-10-18

**25 database suites /224 tests PASS; one HTTP test PASS. Task29 remains
PARTIAL. Ten browser cases, full coverage and remaining release gates are pending.**

Work continued in the same session, workspace and container. No push, merge,
deployment, production connection, external credential, system service or final
video was created. Browser protections and the two-domain network policy were
unchanged. The earlier no-install/no-local-test-credential boundary was explicitly
superseded by owner approval for this source build and disposable synthetic DB.

## Source and runtime provenance

- Starting clean repository HEAD: `88d214a16efcb0210b4c123786efceb8546da40d`.
- Library source: `libfile_66385fc5eb0481918341bebe41d2ba9f`, version0,
  `postgresql-16.15.tar.bz2`,25,181,309bytes. The current official Library helper
  materialized it through the existing allowed host
  `sdmntprwestcentralus.oaiusercontent.com`; no new domain was requested or used
  by the executor. No token-bearing transfer URL is retained here.
- SHA256 verified before extraction:
  `c1575341fa7bd40f5274ea465b34390f4dc64cdd0770af327005caaeb9f6b7ed`.
  All9,094 entries were checked for absolute/parent paths, expected root, and
  regular-file/directory types before safe extraction; links/special files were
  rejected by the validation rule.
- Runtime: **PostgreSQL16.15**, x86_64 Linux, GCC14.2.0, GNU Make4.4.1.
  Build used2 workers on a4-CPU-quota/16GiB environment. Installation prefix:
  `/workspace/dealtwin-runtime/pgsql-16.15`; no sudo or system installation.
- Configure command, exit0:
  `../postgresql-16.15/configure --prefix=/workspace/dealtwin-runtime/pgsql-16.15 --without-icu --without-readline --with-openssl`.
  ICU collation and interactive psql editing are absent. OpenSSL and zlib are
  retained. No build dependency was downloaded or installed.
- `make -j2`: exit0,158.153s. `make install`: exit0,2.335s.
  Source/configure evidence, executable hashes and raw-log hashes are retained.
- New cluster: `/workspace/dealtwin-runtime/pg16-data`; database `dealtwin_test`;
  `127.0.0.1:55432` and a private workspace Unix socket. Local and host
  authentication use SCRAM-SHA-256. `fsync` stays on. Limits:128MB shared buffers,
  4MB work_mem,60 connections,2 parallel workers. No trust-auth fallback.
- Initialization, start, database creation and identity checks all returned0.
  An initial provisioning-helper attempt returned1 before initdb/password creation
  because `Path.open` does not accept `opener`; switching to Python's built-in
  `open` fixed the helper. This was not a PostgreSQL or project failure.

## Reproduced defect and repair

The first actual DB run on88d214a executed all25 files: **200 passed,24 failed,
0 skipped**, exit1,147.276s including npm startup. Failures were23 race cases
and the one application-role benchmark case, all reporting
`SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`.

`pg-pool` makes its `options.password` non-enumerable to prevent accidental
logging. Both the independent race pools and benchmark observer used object
spread, which discarded that password. Their main pool could authenticate, but
the extra real clients could not. No assertion or DB authentication rule was
changed to make the tests pass; no claim is made about the old environment's
authentication configuration.

Fix checkpoint: **523c9ede29afa3abed32e84023a6edbf728d579d**.
`createIndependentPostgresPool` explicitly retains the password/provider while
keeping endpoint, TLS configuration and limits, and creates a distinct Pool.
The new Pool still hides the password from enumeration/log serialization.
The race harness and benchmark use this helper. Two new non-DB regression cases
cover hidden credentials, independent configuration/limits and deferred providers.
The unchanged real race suite still verifies distinct backend PIDs, observed
workspace lock waits, one winning operation, and original idempotent responses.

## Validation after the fix

Final DB/HTTP code HEAD: `523c9ede29afa3abed32e84023a6edbf728d579d`.
Tree: `14d7d58f3af7f4a8d86d75061730594669a6c049`.
The full DB rerun and HTTP check began with this clean source; later changes are
this documentation/evidence checkpoint. Complete commands and selected paths
are recorded in [postgres-run.json](evidence/postgres-cloud-20261018/postgres-run.json)
and [http-run.json](evidence/postgres-cloud-20261018/http-run.json).

| Check / command | Result |
|---|---|
| `npm test -- tests/dealtwin/postgres/pool.test.ts tests/dealtwin/postgres/transaction.test.ts` |20 PASS,0 FAIL,0 skipped; exit0. Two are new regressions;18 are existing fake-client/configuration tests, not additional DB cases. |
| `npm run typecheck` |exit0 on the final fix source. |
| ESLint on pool.ts, report.ts, race-harness.ts and pool.test.ts |exit0; exact file scope retained in the fix. |
| `python3 /workspace/dealtwin-runtime/run-db-suites.py` |25 actual PostgreSQL files, **224 PASS,0 FAIL,0 skipped**, exit0;163.507s wrapper /162.78s Vitest. Uses all25 previously excluded paths, serial file execution, CI-standard60s test/hook timeouts. |
| Canonical HTTP fixture through the existing PostgresHarness and bootstrapLocalJudge |exit0; migrations applied to fresh public schema and synthetic seed loaded using the real app/reset roles. |
| `npm run judge:build` with the new runtime |exit0,3.782s. |
| `npm run security:client` with the same private test environment |exit0;60 emitted files,0 issues. Bounded secret/artifact scan, not a complete security audit. |
| `node node_modules/@playwright/test/cli.js test --config=playwright.dealtwin.config.ts --grep 'Node production target serves real hydration assets and denies traversal' --reporter=list,json --output=output/playwright/cloud-pg-20261018/results` |**1 PASS,0 FAIL,0 skipped**, exit0;4.902s wrapper. Ten browser cases were not selected. |

The25 DB files cover13 PostgreSQL,8 API,3 MCP and1 benchmark suite. They exercise
actual schema/roles, transactions, two-client races, idempotency, failure rollback,
proof invalidation, payments, reset, API/MCP services and benchmark observations.
They do not establish external Alexa/Nebius/provider integration.

The HTTP case uses Playwright's request fixture only. It checks actual built JS
and CSS delivery, traversal rejection, foreign Host rejection and non-read asset
method rejection. No browser was launched; no DOM hydration, visual, accessibility,
responsive or interactive Judge lifecycle pass is inferred. Sandbox configuration
remains explicitly enabled. The ten browser-dependent cases remain unrun.

Final DB inspection found45 public tables, only the `dealtwin-judge-v1` workspace,
and app/reset roles/login roles with both superuser and bypassRLS false. The
bootstrap owner is separate. No other client connection remained before shutdown.
Three SQL migration source hashes are retained; this is not a backup/restore drill.

## Process state and remaining work

Both test runners completed. Playwright stopped its loopback web server.
`pg_ctl -D /workspace/dealtwin-runtime/pg16-data -m fast -w -t 30 stop`
returned0. Subsequent status returned3 (no server running), the PID file was
absent, and neither55432 nor4177 accepted connections. **No task-owned database,
web server, browser or test workload remains active.** Source, installed binaries,
cluster data and private local fixture files remain in the workspace for reuse.
No replacement environment/container is needed to resume.

Earlier **97 non-DB files /1,037 PASS** remain scoped to the prior source as
documented in [cloud recovery](CLOUD-RECOVERY-20261018.md). They were not rerun
or combined with these results into a claimed full-suite pass. The intervening
sandbox-config regression and current20 focused tests have their separate scopes.

Still pending:10 browser cases and visual review, full candidate-bound coverage,
backup/restore rehearsal, fresh dependency audit, configured Sites build and
client scan, final Task29 packet, external integrations and readiness review.
The standalone benchmark test passed real service observations; a new full
candidate-bound benchmark report/replay was not generated in this pass. Public
release and final video remain blocked/deferred. There were no automatic approval
denials, unknown transfer outcomes, network-policy expansions or sandbox bypasses.

Evidence: [postgres-cloud-20261018](evidence/postgres-cloud-20261018).
Unabridged raw runtime logs remain under `/workspace/dealtwin-runtime/logs`;
committed copies omit credentials and normalize terminal formatting. Private
password/session files are excluded from the evidence and from Git.
