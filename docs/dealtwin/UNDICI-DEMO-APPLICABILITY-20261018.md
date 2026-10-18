# Undici applicability to the private Node demo

Reviewed candidate: `29aebb2c59f50ad0e849b410f520d99d85cb155c`.

**No reviewed affected advisory path was found reachable in the intended private
Node/PostgreSQL DealTwin journey.** Affected code is still installed. This is a
scoped reachability conclusion, not a waiver, an all-clear or evidence for a
public deployment. Prioritizing a Cloudflare/Next rebuild would not fix a
demonstrated problem in this demo. The smallest useful remediation proposal is
an isolated official Node 24 update, followed by focused compatibility checks.

## Per-copy classification

“Affected—not reached” means an unfixed code path was checked against the upstream
fix, and the reviewed demo does not invoke it. “Verified fixed” is limited to
the named reviewed issues/source. “Unknown” retains unverified applicability;
version markers alone do not establish it. No copy is classified
“affected—reachable” for this demo.

| Copy | Classification in this demo | Verified reason / remaining boundary |
|---|---|---|
| Cloudflare plugin 1.43.1, embedded 7.28.0 | **Affected—not reached** | Its source map matches 112 pristine upstream 7.28.0 files. Actual bundle still has the unguarded WebSocket subprotocol branch and raw blob-type header path. Dedicated Node config does not include the Cloudflare plugin. |
| Wrangler 4.107.1, embedded 7.28.0 | **Affected—not reached** | The same missing WebSocket fixes/raw blob header branch are present. Demo startup does not invoke Wrangler. Wrangler's API fetch/optional proxy configuration belongs to a separate tooling path. |
| Next `@edge-runtime/primitives/fetch.js` | **Affected—not reached** | Actual code lacks the fetch encoding-chain limit and WebSocket null-protocol guard; retains old frame-length calculation. Current Node target uses Vinext shims, not these primitives. |
| Next `@edge-runtime/primitives/load.js` | **Affected—not reached** | Same unfixed branches in its embedded primitive initialization; no demo loader/caller found. |
| Next `edge-runtime/index.js` | **Affected—not reached** | Manual inspection of minified code confirms the missing null guard and old frame-length calculation; fetch chain limit is absent. No Edge VM is used by the reviewed demo. |
| Node 24.19.0, built-in 7.29.0 | **Affected—not reached** for two WebSocket issues; **verified fixed** for the checked fetch-chain/blob-header issues | Runtime-extracted source matches official Node source after newline normalization. Missing fixes are GHSA-rfgv-xxqx-mfg5 and GHSA-3wwx-pv8p-q78v. No Node WebSocket construction is present in the journey. |
| External Undici 7.29.1, resolved by Miniflare | **Verified fixed** for the 15 reviewed 7.28.0 advisory ranges | Prior byte verification matched all 210 official package files. This external copy does not replace any embedded copy. No new regression run is claimed. |

**Unknown:** individual applicability of every remaining Next 6.21.0
version-range match, arbitrary future tooling/configuration, hosted Sites/Edge
usage and future application features. Those are not converted to “fixed.” The
concrete unfixed branches above are enough to classify the installed Next copies
without asserting that all 17 version matches are exploitable.

## Why the demo does not reach those paths

Current source wiring is `local-demo.mjs` → synthetic PostgreSQL/session bootstrap
→ `node-server.mjs` → compiled Node handler. The server binds loopback and invokes
only Vinext's request conversion, response sending and contained static-file
helpers. `vite.dealtwin.config.ts` includes `vinext()` and external `pg`, without
the Cloudflare plugin. `next.config.ts` contains no external rewrites. The checked
startup/config/provider files are unchanged since the earlier Node build.

One bounded **import-only** probe corroborated this: 87 loaded modules, zero
Cloudflare/Next Edge loads, zero connection/listen/fetch attempts, exit 0, 512 MiB
heap cap. Socket connections, listeners and fetch were rejected inside that
child process. It imported the preserved historical Node artifact, whose SHA256
is `ea7ad6c10b91e388c5a1d89f29e1d781595ea0ea799148bbef27d0a9f99783ae`;
this is **not a fresh candidate build or request-journey test**. Current source
inspection supplies the candidate-specific wiring evidence.

The browser uses browser fetch. PostgreSQL uses `pg`, not Undici. The local MCP
smoke script uses Node fetch to a fixed loopback origin. The Nemotron client uses
Node fetch only after its authorization flag; the observed flag is false (no
secret values read/reported). If separately enabled, its request is a fixed
HTTPS URL with JSON body, validated headers and `redirect: 'error'`. That still
does not construct an Undici WebSocket, cache/retry/decompress interceptor or
duck-typed blob. Vinext's fetch cache is its own implementation, not Undici's
cache interceptor. Preserved legacy ProcureBridge calls and future external
configuration are outside this DealTwin journey conclusion.

## Patch checks that change the earlier interpretation

- **Node's ten version matches narrow to two shipped affected features.** Its
  built-in bundle does not include retry-handler, cache interceptor, decompress
  interceptor, dump interceptor, BalancedPool or WebSocketStream. Those absent
  implementations account for the other eight matches; they are not ten Node
  vulnerabilities. The two present WebSocket branches lack the upstream null
  protocol guard and inflater destruction after the size limit. No exploit was
  attempted.
- **Ordinary fetch is not the blob-type advisory's API.** The official
  [GHSA-m8rv-5g2x-5cg5 description](https://github.com/nodejs/undici/security/advisories/GHSA-m8rv-5g2x-5cg5)
  limits it to low-level dispatcher calls with attacker-controlled duck-typed
  blob types; fetch validates through Headers. Cloudflare's observed normal
  fetch callers do not establish that prerequisite.
- **Two different decompression issues:** the optional interceptor issue
  GHSA-3xpg-4rpp-hhhm is not reached by ordinary fetch. The older fetch-chain
  issue [GHSA-g9mf-h72j-4rw9](https://github.com/nodejs/undici/security/advisories/GHSA-g9mf-h72j-4rw9)
  is genuinely present in Next Edge's unbounded encoding loop, but its five-layer
  fix is present in the checked Cloudflare and Node built-ins.
- **Next's custom patch is not a blanket fix.** Its
  `src/patches/undici-core-request.js` still lacks the later upgrade-header and
  duplicate Host/Content-Length checks and post-coercion header validation. The
  observed WebSocket and fetch-chain defects are outside that custom patch.
  Their code evidence—not just the 6.21.0 labels—supports the table.

## Minimal stable remedy and next work

Official Node **24.21.0** is the first checked newer 24.x release with Undici
7.29.1; 24.20.0 still has 7.29.0. Current **24.22.0 LTS** also has 7.29.1, and
both official bundled sources contain the two missing WebSocket fixes.
See [Node 24.21 release](https://nodejs.org/en/blog/release/v24.21.0) and
[Node 24.22 release](https://nodejs.org/en/blog/release/v24.22.0).

Concrete proposal: unpack the official
[24.22.0 Windows x64 ZIP](https://nodejs.org/dist/v24.22.0/node-v24.22.0-win-x64.zip)
into an isolated project tool directory and invoke its executable explicitly.
Official SHA256 from [SHASUMS256](https://nodejs.org/dist/v24.22.0/SHASUMS256.txt):
`f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3`.
Retain the current runtime for rollback; do not change global Node/PATH. Verify
archive/runtime versions and the two source fixes, then run focused bootstrap,
native Sharp/Miniflare and loader checks sequentially. This proposal was **not
downloaded, installed or executed** here; it needs no bundled rewrite or beta.

Keep Cloudflare/Next findings open for their separate tooling/Edge release
scope. No supported fixed drop-in stable Cloudflare pair was established by the
previous review; do not migrate frameworks merely to polish this private Node
demo. A future decision to use those paths requires reclassification/remediation.
Continue demo polish on the existing architecture, then use the already prepared
one-pass final verification plan on a frozen candidate, reporting unresolved
release gates honestly.

Evidence: [classification and source checks](evidence/undici-applicability-20261018/assessment.json),
[official-source receipts](evidence/undici-applicability-20261018/source-receipts.json),
[offline probe](evidence/undici-applicability-20261018/offline-import-probe.json).
Raw sources/diffs/probe script remain in ignored
`output/undici-applicability-20261018/`. No audit, build, full suite, service,
live provider call, deployment or settings change was performed. Braces remains
the separately documented locally mitigated version finding; no gate was waived.
