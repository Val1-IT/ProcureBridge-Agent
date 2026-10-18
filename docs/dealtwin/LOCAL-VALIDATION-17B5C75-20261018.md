# Local candidate validation — 17b5c75

Status: **PARTIAL; browser interrupted by resource guard; release blocked.**

This report follows the owner's [16:01 UTC checkpoint](CHECKPOINT-20261018-1601UTC.md). All measured results below belong to clean candidate `17b5c75be4b9116a59e7db4606c0dac9fc49db18`, not the later documentation commit containing this report. Product code remains `99ef77b45700d7e96686273972ab2b088c20e363`.

## Completed checks

| Check | Observed result |
|---|---|
| Whole Vitest suite with coverage | **1328/1328 PASS, 135 files, zero failed/skipped**, exit 0, 1103.50 seconds |
| Coverage | Lines 95.38%, statements 87.39%, functions 95.58%, branches 83.35%; configured module thresholds all passed |
| Native runtime regression checks | 4/4 PASS, zero failed/skipped, 381.1139 ms; separate from Vitest |
| Exact braces mitigation, runtime inventory, TypeScript, full source lint | PASS, exit 0 for each |
| Sites build and client scan | PASS; 66 client files, zero issues |
| Node build and client scan | PASS; 63 client files, zero issues |
| Previous artifacts / hosting metadata | Preserved and hash-verified; metadata unchanged |
| Synthetic browser fixture preparation | PASS, exit 0 |
| Fresh official-registry npm audit | **FAIL**, exit 1: 8 high package aggregates, zero critical/moderate/low; no execution error |

Coverage includes real local PostgreSQL RLS, races, rollback, idempotency, approval and lifecycle tests. Local PostgreSQL is 15.4; this does not claim CI PostgreSQL 16 execution. Vitest used one worker and a 1536 MiB heap cap with pinned Node 24.22.0. No full-suite run was duplicated.

The audit completed after the checkpoint was written. The eight entries are braces and affected ancestors, all from `GHSA-vfj7-8cjw-p6xm`. The checked local mitigation is not a version-audit waiver. Existing Cloudflare/Wrangler and Next Edge embedded Undici review remains bounded; this report does not grant public-release clearance.

## Browser interruption and process cleanup

One fresh browser run was started with Chromium sandboxing, one worker, no retries and the newly built Node target. Available memory fell from 4481 MiB before the corrected fixture start to **3511 MiB at 16:00:16 UTC**. The fixed 4096 MiB guard required interruption. Execution session 41069 completed with exit 1. Both browser report streams are empty; therefore **none of the ten browser cases or HTTP control is claimed passed on this candidate**. Historical browser 11/11 evidence retains its earlier source scope.

The first PostgreSQL start omitted the fixture port and failed. Authorized status confirmed no server remained; the corrected start explicitly used the existing synthetic cluster on `127.0.0.1:55632`. No cluster, service or database was newly provisioned for this attempt. After interruption the owned server was already gone; explicit stop returned 1, then authorized status returned **3 / no server running**. Purpose-bound authorized inspection found no matching owned browser, Playwright or demo Node processes. The audit subsequently completed; no validation execution remains active.

An earlier restricted PostgreSQL status had incorrectly implied shutdown while the same fixture still ran. The preserved correction receipt is `output/final-17b5c75/database-cleanup-correction.json`. The later authorized cleanup evidence establishes the final state; raw historical evidence was retained.

## Evidence and remaining work

`output/final-17b5c75/` contains `tests.json`, `coverage.log`, `coverage-results.json`, source/runtime logs, build/scan logs, three artifact manifests, audit JSON/exit, RAM samples, browser interruption and authoritative cleanup receipts. Previous build artifacts remain under `prior-dist-preserved/`, the fresh Sites output under `sites-dist/`, and the fresh Node output in worktree `dist/`.

`verification-packet.json` preserves **14 base gates and all 42 trusted requirement mappings**, with `ready: false`. Its PASS scopes are local candidate verification, not public deployment. Physical migration/backup-restore and the standalone measured benchmark/replay remain NOT RUN on this candidate. Unit/integration benchmark and reset tests do not substitute for those separate drills.

Other blockers remain unchanged: sufficient browser-run resources; dependency audit and embedded-source disposition; Nebius model/access/approved budget and real-provider evidence; real Alexa account/profile/consent; public identity/session-to-tenant/TLS and ownership/deployment evidence. Local Sites metadata is available and unchanged. Task 29 and DT-042 remain PARTIAL.

No production, real financial data, paid provider calls, secret changes, security weakening, new services, unrelated process kills, reset/discard/cache deletion, push, merge, deployment or final video occurred. Resume from the checkpoint; preserve completed evidence and use a unique folder for an explicitly continued browser attempt when resources safely permit it.
