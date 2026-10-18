# DealTwin fresh-cloud recovery — 2026-10-18

**Migration complete. Non-database validation passed. Task29 remains PARTIAL;
product/demo readiness is not verified; public release remains BLOCKED.**

## Source and environment

The fresh workspace started at baseline
`6f51368a674953bdcc9cdb8031f76e1da6081875`. The confirmed Library archive
`libfile_3a5abc8f502c81918a47520463346a40`,
`DealTwin-runtime-recovery-20261018.zip`, was materialized by the consuming
executor using the current Library helper. Its readable local bytes have SHA256
`744a85d7d8def9aa42d5a927c969706fd3d1b130813ad425d8187a3e5a162369`.
ZIP integrity, all ten payload checksums, and the incremental Git bundle passed.

All three original commits were imported without rewriting them onto local branch
`cloud/dealtwin-continuation-recovered-20261018`. Restored HEAD is
`0c6a4210221ea8f043ec76ca21e953b30f44c0d3`; restored tree is
`d27fbdf3f194ff7ddfe02052807b579d80f7ff9c`. The restored checkout was clean and
`git fsck --full` passed. No previous container was modified or deleted.

Requested configuration: `cecfgver_6ad4569fcd9881a19b34dbecf73f1929`.
The effective local policy was independently read: restricted HTTP egress has
exactly `registry.npmjs.org` and `sdmntprwestcentralus.oaiusercontent.com`, with
no additional TCP domains or IP ranges. The configuration-version ID itself is
not exposed by that policy file. The returned transfer hostname matched the
authorized host. No domain, permission, sandbox or security setting was changed;
no alternate transfer route or denied-action retry was used.

`AGENTS.md`, the locked specification, traceability and implementation plan were
read. No repository `.agents/skills` exists; the workspace `.agents` is empty.
Synced `sources/` references were not edited.

## Bounded fixes and checkpoints

1. `fe678a13c4acb071d16216714980260882e1fa27` fixes typecheck portability.
   The restored static import of missing `.openai/hosting.json` caused TS2307.
   Deployment binding metadata is now read only when configuring the Sites
   target. Existing bindings are preserved and malformed/missing configuration
   fails explicitly. No site ID, resource or credential was invented. Eight
   configuration regressions pass; Node/PostgreSQL Judge remains a separate target.
2. `0361622badf4c6dad5d13bf9d50bcf83e15a35d4` fixes interrupted-request recovery.
   Previously, a lost response left no retry identity, or retained an older
   successful action. The client now remembers the exact operation before sending
   it, including method, body, expected revision and idempotency key. Starting a
   new attempt clears old displayed results. The UI labels an interrupted outcome
   as uncertain and offers the original request. Six transport regressions cover
   first-request loss, replacement of an older action, exact retry identity,
   unreadable responses and ordinary success. The old ordering failed five of
   six cases before the fix. This is in-memory transport evidence, not proof of
   PostgreSQL idempotency. One corresponding real-server browser test was added
   but could not run.

The final code tree is `8a860bb9abb2023f0f192f921066d370f455947b` at `0361622`.
This report and its evidence are a subsequent documentation checkpoint.

## Measured validation

Evidence: [cloud-recovered-20261018](evidence/cloud-recovered-20261018).

| Check | Result and exact scope |
|---|---|
| Locked install on restored `0c6a421` | `npm ci --ignore-scripts --no-audit --no-fund --cache /workspace/dealtwin-npm-cache`: PASS, 599 packages in 16s. No lifecycle script or rebuild ran; lockfile unchanged. |
| Restored non-DB regression | 95 files, 1,023 passed, 0 failed/skipped, 44.26s. |
| Final non-DB regression | 97 files, 1,037 passed, 0 failed/skipped, 50.53s. Explicit selection excludes 25 PostgreSQL-dependent suites; these are NOT passed or skipped-test claims. |
| Focused UX recovery | All seven UI files / 42 tests pass; six recovery cases included. |
| Final typecheck and lint | Both PASS against the source subsequently committed as `0361622`, including the added browser test's TypeScript. |
| Judge production build | `npm run judge:build`: PASS on restored source and after the recovery fix. Existing third-party chunk/directive warnings remain; no lifecycle rebuild needed. |
| Emitted Judge client scan | `npm run security:client`: PASS, 60 files scanned, zero detected issues. This is the repository's bounded artifact scanner, not a complete security audit. |
| Generic Sites build | BLOCKED, exit1: `SITES_HOSTING_CONFIG_REQUIRED`; `.openai/hosting.json` absent. The error now identifies the missing deployment configuration and available Judge build. No Cloudflare build pass is claimed. |
| Pure benchmark on clean `0c6a421` | `--no-services --run-id cloud-restored-20261018`: 113 cases; compiler false-feasible 0/68, false-infeasible 0/45; fixed-rule errors 35/68 and 22/45. |
| Independent benchmark replay | 57/57 recorded fixed-rule mismatches reproduced, zero failures. |
| Database/service/provider benchmark metrics | NOT_MEASURED. The explicit no-services run is not race, duplicate-commitment, staleness, idempotency or live-provider evidence. |

The final regression began while the `0361622` checkpoint commit was pending,
at HEAD `fe678a1` with the final code changes present. No code changed during
that run; the exact tested source was committed as `0361622`. This is not a
fresh clean-checkout release-candidate gate. The selection manifest records this
distinction. Full raw machine test reports also remain in
`/workspace/dealtwin-validation`; concise summaries and complete text logs are
committed here. Coverage was not measured; full DB-inclusive regression was not run.

## Remaining blockers and action outcomes

| Action / target | Outcome | Reason and next prerequisite |
|---|---|---|
| Disposable PostgreSQL migrations, transactions, race/RLS, durability and restore drill | Pending; not executed, not denied | PostgreSQL server/client/backup executables are unavailable. Installation, image acquisition and credential creation were prohibited for this task. No external/private DB was substituted. |
| Browser Judge journeys and responsive/accessibility inspection | Pending; not executed, not denied | Installed `/usr/lib/chromium/chrome-sandbox` remains owned by nobody/nogroup with mode4755. No supported browser/computer runtime tool is exposed. No sandbox permission changes, disabling flags or browser download occurred. The prior three UX tests and new lost-response test remain unrun. |
| Configured Sites/Cloudflare build and client scan | Build attempted and failed; no uncertain result | Missing hosting metadata. No deployment identity was created or copied from another machine. |
| Full Task29 coverage and current release packet | Pending | Requires the unavailable database/browser gates and remaining exact-candidate evidence. Existing historical results are not promoted to this cloud candidate. |
| Fresh dependency audit, live Nebius/Alexa/other providers | Not run | Outside this bounded install/validation pass; no credentials or domains added. Historical vulnerability counts are not a current audit. |
| Video, push, merge, deployment, production data and submission | Not performed | Video is deferred until verified readiness; the other actions were outside authorization. |

No automatic approval-review rejection occurred. No action has an uncertain
tool outcome. The product error-recovery tests deliberately simulate a lost
response; that simulation is not an uncertain real-world mutation.

Resume with supported disposable PostgreSQL and browser capabilities within the
authorized environment, then run the existing migration/transaction/browser
gates and inspect the actual UI at 390/820/1024/1440px. Preserve both historical
evidence and this scope distinction. Do not call the product polished, integrated
or release-ready until those checks and remaining release requirements pass.
