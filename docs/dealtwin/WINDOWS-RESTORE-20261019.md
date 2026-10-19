# Authorized Windows synthetic restore rehearsal

Completed 2026-10-19 at 00:34:01 UTC on **clean candidate `684cc24ea102dd89cbba426dadead2e9990c9ede`**. This is a PostgreSQL custom-format **logical backup/restore** rehearsal, not a physical/base-backup or WAL/PITR test. No application behavior or dependency was changed. The original checkout remains preserved.

## Scope and ownership

The owner explicitly approved creating the previously proposed isolated synthetic target. Before startup: target, marker and evidence directory absent; ports 55632/55432 unoccupied; source stopped; filesystem/execution owner `LENOVO-VT\Valen`; PostgreSQL binaries 15.4; 6,175 MiB available RAM and 14.1 GiB disk. The 4,096 MiB RAM guard remained in place. Successful-run samples ranged from 5,624 to 5,832 MiB; final read-only closure sampled 5,836 MiB. These are samples, not a continuous memory trace.

Workspace: `C:\Users\Valen\Documents\ChatGPT\DealTwin\.worktrees\dealtwin-continuation-20261018`.

| Resource | Exact scope |
|---|---|
| Preserved source | `.cache/pg-browser-20261018`, `127.0.0.1:55632/dealtwin_test` |
| New owned target | `.cache/pg-restore-review-20261019-a`, `127.0.0.1:55432/dealtwin_test` |
| Exclusive ownership claim | `.cache/pg-restore-review-20261019-a.owner.json` |
| Retained evidence | `output/restore-review-20261019-a/` |
| Successful attempt | `output/restore-review-20261019-a/attempt-684cc24/` |

The source is the existing local synthetic Judge/benchmark fixture. Checks found only the expected database names and public schema, exactly 45 migration-defined tables, one `dealtwin-judge-v1` tenant, only that tenant's rows, and the known synthetic supplier/customer names, addresses and `example.invalid` contacts. The known fixture lineage, these content checks and expected role inventory bound this claim; a tenant label alone was not treated as proof of synthetic origin.

Source sessions and its temporary startup option were read-only. No source seed/reset/schema preparation ran. Source snapshots before and after the dump are byte-identical. The source was stopped before target initialization, so the two task-owned clusters did not run concurrently. No existing database was overwritten, no schema was dropped, and no filesystem cleanup/deletion ran. Target data, owner marker, dump and logs remain on disk. The generated target-only synthetic authentication file is retained locally and excluded from evidence indexes; no real credential was used or printed.

## Implemented Windows adaptation

- `restore-support.mjs` rejects mismatched database/path/port/major, non-read-only source sessions, unexpected synthetic masters/tenants/tables, elevated app roles and unexpected memberships.
- `restore-snapshot.mjs` reads all public rows and twelve catalog sections in a repeatable-read read-only transaction. Both sides' CHECK definitions are normalized through the same PostgreSQL parser using temporary tables **only on the target**; original snapshots are retained.
- `restore-check.mjs` validates source provenance/identity, prepares roles only in a fresh empty target, and compares restored rows/catalogs. The restore TOC excludes only creation of the already-empty bootstrap public schema; its owner/ACL and every table/constraint are restored and compared. No `--clean` or destructive source phase is used.
- `run-isolated-restore.ps1` exclusively claims the target, verifies binaries, binds process ownership and exact data directories, captures staged evidence, and gracefully stops owned clusters in its finalizer. Its narrowly scoped resume accepts only the known uninitialized pre-dump checkpoint, never an existing target.
- `tests/dealtwin/restore/verification.ts`, selected only by `vitest.restore.config.ts`, exercises the restored target without invoking the destructive integration harness setup or Judge reset.

## Results and provenance

| Check | Result |
|---|---|
| Native planner/safety tests at clean `684cc24` | **23/23**, zero failures/skips; 196.810 ms |
| Isolated restored-target integration test at clean `684cc24` | **1/1**, zero failures/skips; native command exit 0 |
| Data comparison | **174 rows across 45 tables**, equal |
| Catalog comparison | Tables/RLS flags, columns, constraints, policies, triggers, functions, indexes, table grants, public schema, roles, memberships and sequences equal after CHECK parser normalization |
| Source preservation | Before/after snapshot SHA-256 identical |
| Proof replay | **2/2** stored proofs genuinely recomputed |
| Stored success receipts | **92/92** decoded and response hashes verified |
| Actual idempotent retries | **10 reserve + 7 commit**, same stored responses, no row/catalog changes |
| Tenant isolation | Other tenant sees zero rows in **44** tenant tables; cross-tenant insert/update denied |
| Audit immutability | App-role audit update denied; subsequent snapshot unchanged |
| Target payment/cancellation | Synthetic receivable payment then cancellation; expected original/reversal amounts and link; revision **92 -> 94** |
| PostgreSQL shutdown | Source PID **10736** and target PID **10420**: stop exit **0**, status exit **3** |
| Final closure at 00:34:51 UTC | Both clusters stopped; no listener on 55632/55432; both directories preserved |

Preparation typecheck and changed-file ESLint passed with exit 0 before the native startup/host-format corrections. PowerShell parsing and `git diff --check` passed for the corrections. The final native and live database results above belong to `684cc24`; no earlier full-suite result is reassigned to it.

Dump: 374,866 bytes, SHA-256 `0502e9c6f9c19600ee621914caa14f4393cb4a911aa667ecd73e3ba1865929c6`.

Both source snapshots: SHA-256 `1b94d722c469001a500acff24aaf3993cb1a5bdc17c3b57e24eedce329367797`.

Raw receipts include `comparison.json`, `behavior-tests.json`, `behavior-verification.json`, `evidence-summary.json`, `process-ownership.json`, `final-closure.json`, and successful-attempt `steps.json`, `resources.json`, `cleanup.json`, `result.json`. The ownership marker retains the original claim candidate; `attempt-684cc24/resume.json` records the actual successful execution candidate. This does not make the initial attempt a pass.

## Earlier attempts retained honestly

1. `fb7516e`: source startup succeeded, but PowerShell native pipeline capture waited on inherited server handles. Exact postmaster PID 6768 was verified and gracefully stopped, releasing the wrapper. Target remained absent; no dump or target mutation occurred. Original logs and recovery receipt remain.
2. `9fc504d`: corrected detached startup worked; source identity check rejected PostgreSQL's `inet::text` output `127.0.0.1/32`. Source was gracefully stopped; target remained absent. `684cc24` uses PostgreSQL `host(inet_server_addr())` to compare the exact loopback address without weakening the guard.
3. `684cc24`: complete successful source/dump/restore/comparison/behavior/closure sequence. No failed data restore was retried over an existing target.

## Remaining readiness boundaries

The authorized local logical restore blocker is resolved for this candidate. This is not a claim of physical recovery/PITR, Linux CI parity, production/public readiness or a consolidated exact-SHA full-suite release packet. Previous 1,328-test full-suite evidence remains at `17b5c75`; prior browser and benchmark evidence keep their documented provenance.

The eight audit aggregates/root advisory and embedded-code disposition remain open, as do CI runtime parity, Nebius model/access/budget/live evidence, real Sites metadata and public identity/session/TLS/hosting ownership, actual Alexa account/consent, and the final consolidated readiness run. No external service, paid call, security-setting change, push, deployment or video was performed.
