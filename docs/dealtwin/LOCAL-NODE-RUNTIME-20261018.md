# Project-local Node 24.22.0

This Windows x64 runtime is isolated under the active worktree's ignored
`.cache/runtimes/node-v24.22.0-win-x64` directory. Global Node 24.19.0, PATH,
services and security settings are unchanged. No framework/dependency pin,
application architecture or production infrastructure changed.

## Reproducible setup and invocation

From this worktree in PowerShell:

```powershell
./scripts/dealtwin/setup-local-node.ps1
./scripts/dealtwin/run-local-node.ps1 --version
./scripts/dealtwin/run-local-node.ps1 --max-old-space-size=256 --test --test-reporter=tap tests/dealtwin/runtime/local-node.node.mjs
```

The setup reads the reviewed [runtime pin](../../scripts/dealtwin/local-runtime.json),
matches the official checksum list against the pinned ZIP digest, validates
archive paths before extraction, and checks the executable digest before running
it. A mismatched or incomplete existing installation/download is preserved and
rejected; it is never overwritten. Download refusal stops setup. The launcher
checks the executable hash on every invocation, sets only the child working
directory, and passes arguments directly. It does not alter PATH.

| Provenance | Value |
|---|---|
| Official ZIP | `https://nodejs.org/dist/v24.22.0/node-v24.22.0-win-x64.zip` |
| ZIP size | 37,733,703 bytes |
| ZIP SHA256 | `f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3` |
| `node.exe` SHA256 | `ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c` |
| Runtime identity | Node 24.22.0 / built-in Undici 7.29.1 |

The official [checksum list](https://nodejs.org/dist/v24.22.0/SHASUMS256.txt)
matched the previously reviewed pin. Initial extraction and a fresh extraction
through the committed setup script produced the same executable hash. The first
extraction is preserved under ignored `output/node-runtime-20261018/`; no cache
or old runtime was deleted. ZIP/executable hash verification is not a separate
Authenticode/signature-validation claim.

## Focused security evidence

`tests/dealtwin/runtime/local-node.node.mjs` exercises the selected runtime's
**actual global WebSocket and fetch**, not external Undici's WebSocket class.
External Undici Agent supplies only a small configured payload limit/transport.
The tests adapt these MIT-licensed upstream regressions at commit
`d39a83e7b0d631590c3b85b5cc0dbeab66c3a1d8`:

- `test/websocket/opening-handshake.js`: unsolicited subprotocol rejection.
- `test/websocket/permessage-deflate-limit.js`: deterministic inflater shutdown
  after an over-limit malformed compressed message.

Adaptations bind servers to loopback, add deterministic cleanup/timeouts, select
Node's global implementation, and reduce the decoded fixture to **17 KiB** with
a 1 KiB limit. No remote peer, large payload or paid call is involved. The MIT
notice is retained in `tests/dealtwin/runtime/undici-LICENSE`; exact source
receipts are in ignored `output/node-runtime-20261018/`.

Initial local-runtime run: **4/4 pass**, zero skipped/failed, 409.6154 ms. It
covers identity, both security paths, native HTTP fetch, Headers/Request/Response,
web streams and ordinary WebSocket echo. Two separate bounded negative-control
runs on unchanged global Node 24.19.0 both exited 1: the subprotocol case exposed
the null `includes` TypeError and timed out at 5 seconds; the inflation case
failed with unhandled `Z_DATA_ERROR`. These are expected negative-control
failures, not a passing old-runtime test. No installed old code was changed.

An initial sandboxed test-runner attempt failed at child spawn with EPERM before
tests executed. The approved child/loopback run then succeeded; no access block
remains. Runtime compatibility beyond these four tests is recorded separately
with candidate-bound final evidence, never inferred from old build results.

## Candidate verification harness

Use the pinned executable for tool entry points directly, avoiding npm script
shell resolution of a global `node`:

```powershell
./scripts/dealtwin/run-local-node.ps1 node_modules/typescript/bin/tsc --noEmit
./scripts/dealtwin/run-local-node.ps1 node_modules/eslint/bin/eslint.js .
./scripts/dealtwin/run-local-node.ps1 node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1 --minWorkers=1
./scripts/dealtwin/run-local-node.ps1 node_modules/vinext/dist/cli.js build
./scripts/dealtwin/run-local-node.ps1 node_modules/vite/bin/vite.js build --config vite.dealtwin.config.ts
./scripts/dealtwin/run-local-node.ps1 node_modules/playwright/cli.js test --config=playwright.dealtwin.config.ts
```

Apply the existing final plan's timeouts/reporters/environment and disposable
database prerequisites; these examples alone are not the whole plan. Playwright's
web server now uses `process.execPath`, and bootstrap/fixture child processes
already do so. Chromium sandboxing remains enabled.

Set `DEALTWIN_TEST_EVIDENCE_ROOT` to a fresh `output/final-<candidate-sha>` path
for the run. Security fixtures and Playwright auth/screenshots use that root;
omitting it preserves previous default behavior. Unique benchmark run IDs remain
unchanged. TypeScript/ESLint exclude ignored `output` and `.cache` artifacts so
downloaded runtime packages and saved evidence are not treated as project source.
This exclusion does not remove app/lib/scripts/tests from validation.

## Rollback and remaining gates

To stop using the isolated runtime, invoke the still-installed previous Node
explicitly; leave local runtime files intact for reproducibility. That also
restores its two known WebSocket defects, so rollback is not a security fix.
Reverting runtime/harness changes is a reviewed Git operation, not an automatic
cleanup step. No global installation needs to be undone.

The two checked Node built-in defects are fixed in this runtime. The installed
Cloudflare/Next Edge findings remain unresolved outside the reviewed private
Node journey; see [applicability](UNDICI-DEMO-APPLICABILITY-20261018.md).
Braces remains the locally mitigated published-version audit finding. Neither is
waived. Live-provider/model/budget authorization, public identity/TLS/Alexa and
the final complete same-candidate evidence packet remain separate release gates.
