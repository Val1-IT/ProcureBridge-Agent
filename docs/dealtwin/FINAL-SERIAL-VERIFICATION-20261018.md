# Final serial verification plan — 2026-10-18

Status: **PARTIAL; full validation interrupted by the RAM guard, release blocked.**
The `df83051` attempt produced incomplete coverage only. The later UI change
`99ef77b` has focused evidence in `UI-CONSTRAINT-FAILURES-20261018.md`; it still
requires a complete new-candidate final pass when resources permit.
Planning baseline is `873abf7b4f39b242415945be0b533467ff8c87db`, lock SHA256
`57ff2662a534dad8d712bb35271bbb9d20d0141f51c195211185bcf084a68228`.
This is not a cleared release candidate. The same report's documentation-only
commit does not constitute a new test run. After the dependency decisions and
any code fixes settle, freeze one clean candidate SHA and replace this planning
baseline in the run manifest. Do not run a full suite on each dependency step.

## Entry conditions and provenance

- Resolve the [embedded Undici review](EMBEDDED-UNDICI-20261018.md), including the
  newly inventoried Next Edge and Node runtime families. Keep the braces version
  finding distinct; do not suppress audit results or silently treat its local
  mitigation as a waiver of the release gate.
- Record exact commit/tree, lock and maintained patch hashes, Node/npm versions,
  built-in and external Undici versions, installed bundle/native hashes, working
  status, free RAM/disk and command/environment descriptions without credentials.
- Preserve current worktree and prior Node/Sites/browser artifacts. Use a unique
  ignored `output/final-<candidate-sha>/` directory. Do not reset, delete caches,
  kill unrelated processes or overwrite previous reports.
- Start with at least the previously successful local resource envelope (about
  4 GiB free RAM, sufficient disk for two preserved builds). This is a conservative
  operational guard, not a proven minimum. Recheck between stages; stop the run
  on paging pressure rather than start concurrent work. One stage at a time,
  Node heap initially capped at 1536 MiB. No global settings changes.
- Confirm the disposable PostgreSQL fixture and least-privilege app/reset roles;
  use only the existing synthetic `dealtwin_test` fixture on loopback. Never use
  production or real financial data. Capture the version difference between local
  PostgreSQL 15 and CI PostgreSQL 16. Do not claim local execution is CI evidence.

## One sequential pass

1. Verify the exact installed graph and `npm run deps:patch -- --check`, then
   typecheck and lint. Any clean-install verification uses an isolated authorized
   directory and exact lock, without overwriting the working installation.
   Capture failures before proceeding; no package changes during the pass.
2. Start only the disposable PostgreSQL fixture, validate the test URL guard and
   role setup, then run **one whole-suite coverage invocation**:

   ```text
   npm run test:coverage -- --maxWorkers=1 --no-file-parallelism --testTimeout=60000 --hookTimeout=60000 --reporter=dot --reporter=json --outputFile=output/final-<sha>/tests.json
   ```

   Installed Vitest 4.1.11 rejects `--minWorkers`; the supported explicit serial
   controls above were confirmed by its local CLI help. The earlier rejected
   invocation loaded no tests. Use the pinned local Node launcher for the actual
   Vitest entry point as described in `LOCAL-NODE-RUNTIME-20261018.md`.
   `vitest.config.ts` already disables file parallelism. Preserve JSON counts,
   logs and coverage summary with the candidate SHA. All required PostgreSQL
   cases must run: skips are not passes. Retain existing overall and per-module
   thresholds (70% lines/statements/functions, 60% branches). Record measured
   counts; do not expect the old cloud 1289 count after added dependency tests.
3. Preserve existing `dist` hashes and real local Sites metadata. Run Sites
   `npm run build`, then `npm run security:client`; retain that complete output
   in the candidate directory. Build success is not ownership/deployment proof.
4. Run `npm run judge:build`, then `npm run security:client`; preserve this Node
   output separately. Record both build digests and scan counts. Validate metadata
   and preserved artifact hashes after any move/restore. Check absolute paths
   before directory moves. Do not combine output from different candidates.
5. With the freshly built Node target and disposable fixture, run the two commands
   from `judge:test` sequentially, capturing fixture output separately:

   ```text
   node node_modules/vite-node/vite-node.mjs --config vitest.config.ts scripts/dealtwin/prepare-browser-fixture.ts
   node node_modules/playwright/cli.js test --config=playwright.dealtwin.config.ts --reporter=json --output=output/final-<sha>/browser-results
   ```

   Capture the second command's JSON stdout as `browser.json` and stderr/logs
   separately; validate that the report parses. Existing config
   enforces one worker, no retries and Chromium sandboxing. Record 10 browser
   cases plus the HTTP control separately from Vitest counts. Preserve evidence
   at all configured viewport sizes. If Chromium sandboxing cannot run, report
   blocked rather than disabling it. No final video is produced.
6. Refresh npm audit and the explicit embedded-source/runtime inventory. Record
   all remaining findings and the gate outcome, including braces. Do not combine
   npm package aggregates with advisory version matches or call this all clear.
7. Stop only services started for this run, retain logs/artifacts, inspect both
   worktrees and `git diff --check`, and record final candidate/tree/hash equality.
   Assemble the 14-gate/42-requirement packet with PASS/FAIL/BLOCKED/NOT RUN and
   each gate's exact evidence. Live-provider and public identity/TLS/Alexa gates
   require their separately authorized evidence; local tests cannot substitute.

## Failure and rerun rule

Do not keep repeating the full suite after an unchanged failure. Diagnose with
the smallest relevant test. A code/dependency/runtime correction creates a new
candidate and invalidates the final-pass claim; rerun the affected checks and
schedule one consolidated final pass after fixes settle. An environment-only
interruption is recorded explicitly; do not relabel incomplete logs as a pass.
No push, merge, deployment, paid provider request or video follows automatically.
