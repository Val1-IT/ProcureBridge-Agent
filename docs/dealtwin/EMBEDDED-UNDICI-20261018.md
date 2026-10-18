# Embedded Undici review — 2026-10-18

**UNRESOLVED.** Review candidate: `873abf7b4f39b242415945be0b533467ff8c87db`.
No dependency, installed bundle, runtime, product code or security setting was
changed. The earlier two-copy inventory was incomplete. There are five detected
installed bundle files, plus Node's separately embedded implementation.

The fresh npm audit still exits 1: eight high affected-package aggregates, zero
critical/moderate, with only GHSA-vfj7-8cjw-p6xm reported. That is the **braces
published-version finding**: the maintained depth guard passes its installed-byte
check, but npm cannot recognize that local patch. The gate remains blocking;
there is no waiver. Embedded Undici is a separate unresolved source/runtime
problem, invisible to that ordinary package audit.

## Verified inventory and callers

The [machine-readable inventory](evidence/embedded-undici-20261018/inventory.json)
contains full SHA256s, affected-range results and verification limits. A serial
scan read 14,915 installed `.js`, `.mjs` and `.cjs` files, looking for Undici module
paths/version markers and a secondary implementation signature. This is a
bounded source scan, not a complete semantic SBOM. Saved historical output and
source maps are not counted as active executable copies.

| Installed artifact | Evidence | Caller boundary |
|---|---|---|
| `@cloudflare/vite-plugin@1.43.1/dist/index.mjs` | Undici 7.28.0; SHA256 `d6c43f41b42e6930f5a02fe7e9568f1c4715f98318f3764c05fe637dde5ac419` | Bundled workers-utils imports fetch, Headers, FormData and Response; API fetch and cloudflared update/download functions call them. |
| `wrangler@4.107.1/wrangler-dist/cli.js` | Undici 7.28.0; SHA256 `b3463ef8ab69da1d600bc694bc91df89dea8fa9179f6cf0fb020854b8d924bac` | 31 static fetch member references, Request/Response/FormData/Headers, Dispatcher, and global-dispatcher access. The CLI conditionally installs EnvHttpProxyAgent when proxy configuration is present. |
| `next@15.5.28/dist/compiled/@edge-runtime/primitives/fetch.js` | 6.21.0 source-path markers; SHA256 `1577109d1e286a11e66bb56ba3dfa07d53d6c0e0610c08fed994f82838bb7658` | Edge primitive fetch delegates to bundled Undici; also exports WebSocket, Headers, FormData and Request/Response wrappers. |
| `next@15.5.28/dist/compiled/@edge-runtime/primitives/load.js` | 6.21.0 markers; SHA256 `d36b91e07ff16e770688afc5578702030e7eccaa3de59303cd6b0cef0707d230` | Contains the same primitive initialization in the Edge loader. |
| `next@15.5.28/dist/compiled/edge-runtime/index.js` | 6.21.0 markers; SHA256 `06703ed6b001b0f02f8043bb499f3716f2c3b76b7df628a1cea30d1ee671edb2` | Embedded Edge VM/primitives implementation; separate compiled artifact. |
| Node 24.19.0 | `process.versions.undici === '7.29.0'` | Node fetch/WebSocket runtime, outside npm's lock graph. Optional package APIs are not all exposed by Node. |
| External `undici@7.29.1` | All 210 installed files match the official archive | Miniflare 4.20260702.0 resolves this copy. Its source map contains zero embedded Undici modules. This does not replace the copies above. |

All 20 plugin and 48 Wrangler installed distribution files match their official
npm archives, whose SHA512 SRI values were checked. All 112 Undici files in the
plugin's source map match the official 7.28.0 archive exactly. Each of the three
Next files matches the corresponding compiled file in the official `v15.5.28`
source tag byte for byte. Next includes `src/patches/undici-core-request.js`;
therefore its markers are **not** proof that every function is pristine 6.21.0.

Read-only npm advisory queries match 15 advisory ranges for 7.28.0, 17 for
6.21.0, ten for 7.29.0 and zero for 7.29.1. These are version-screening results,
not demonstrated exploit counts, and must not be added to npm's eight package
aggregates. The three Next files and the Node runtime require their own
feature/patch applicability review. No unsafe payload or live endpoint was used.

Static caller excerpts are retained for
[plugin](evidence/embedded-undici-20261018/plugin-bundle-callers.json),
[Wrangler](evidence/embedded-undici-20261018/wrangler-bundle-callers.json) and
[Miniflare](evidence/embedded-undici-20261018/miniflare-callers.json).
No direct Cloudflare consumer of cache/retry/dump/decompress interceptors,
BalancedPool, Undici WebSocket or WebSocketStream was found in those excerpts.
This does not prove their absence from every dynamic path. Wrangler's observed
EnvHttpProxyAgent is not evidence of the separate BalancedPool/custom-TLS
advisory prerequisites. No proxy settings were read or changed.

No explicit Edge-runtime selection/import was found in the scanned project
`app`, `lib`, Vite configurations or security tests. Loading these dependencies
does not establish a Judge production route to the Edge copies. The server-side
Nemotron client does default to Node fetch when enabled and not injected
(`lib/dealtwin/ai/nemotron-client.ts:13`); it was not enabled or called here.

### Correction to the earlier exposure report

GHSA-3xpg-4rpp-hhhm specifically concerns `interceptors.decompress()`.
Ordinary tooling fetch calls do **not** alone demonstrate that interceptor's
reachability. Its fixed implementation bounds each decompression stage and adds
`maxSize`; that is distinct from the older fetch decompression-chain advisory
GHSA-g9mf-h72j-4rw9. This corrects the broad compressed-response inference in
`DEPENDENCY-EXPOSURE-20261018.md`; it does not clear either installed code family.
See the [official advisory](https://github.com/nodejs/undici/security/advisories/GHSA-3xpg-4rpp-hhhm).

## Official source and smallest bounded rebuild options

The registry refresh still reports plugin 1.64.0 and Wrangler 4.151.1 as latest.
Their declared dependencies require Miniflare 5.20261012.0-beta and
5.20261012.1-beta respectively. Latest stable Miniflare 4.20260730.0 still
declares Undici 7.28.0. None is a validated drop-in stable replacement for the
current pair. These manifests were read; nothing was installed.

Both current Cloudflare publish-provenance payloads identify source commit
`c5d5e893e575b00a62a886d1da395b6246948d18`, also resolved from the Wrangler tag.
The attestation payloads were decoded and compared, not independently Sigstore
signature-verified. The source and archives are licensed MIT or MIT/Apache-2.0;
Undici is MIT. Licensing does permit a maintained source rebuild with notices.

The [official Undici comparison](https://github.com/nodejs/undici/compare/v7.28.0...v7.29.1)
has 30 commits, 54 changed files and **20 changed implementation files**.
It includes fixes across request serialization, retry, cache parsing/storage,
decompression, dump, BalancedPool and WebSocket behavior, plus other changes.
It is not a one-function backport. A complete pinned Undici update is a more
auditable source input than hand-transcribing many fixes into generated code.

The smallest identified **source-build proposal**, not a completed patch, is:

1. Pin the exact Cloudflare source commit and its pnpm lock; change only the
   Undici catalog resolution 7.28.0 to 7.29.1 for the relevant build closure.
   Preserve current stable Miniflare/workerd/framework contracts and the existing
   external Sharp/esbuild overrides and braces patch.
2. Rebuild workers-utils, Wrangler and the Vite plugin with their official
   recipes. workers-utils leaves Undici external; Wrangler and the plugin bundle
   it at the next stage. Rebuilding workers-utils alone cannot fix either file.
3. First reproduce an unmodified baseline, then rebuild the candidate, record
   all source/input/output digests and licenses, account for every output change,
   and prove a clean reinstall reproduces the maintained artifacts. Install a
   candidate only after its isolated package/feature regressions pass.

**Concrete validation blocker:** there is no baseline-reproduced or tested
replacement artifact yet. Published Wrangler does not contain its CLI source
map/build inputs. Its official build uses tsup 8.3.0, tsdown 0.16.3, private
workspace source, embedded Worker template builds, injected import-meta handling
and compile-time environment definitions. The plugin's official tsdown build
also embeds a build-date compatibility constant and emits multiple Worker
entries. A whole-bundle rebuild must pin/account for those inputs; it cannot be
presented as a verified narrow byte patch. The workspace calls for pnpm 10.33.0.
No workspace dependency installation or experimental rebuild was performed in
this review. This is an unresolved build/validation scope, not a tool denial or
a claim that source rebuilding is impossible.

Next needs a **separate** maintained Edge-runtime/primitives source rebuild or a
supported fixed Next distribution. Its taskfile copies primitives 6.0.0 and
bundles edge-runtime 4.0.1, with custom Request behavior and VM rewrites. Replacing
these with plain Undici 7 would cross a major and discard those adaptations.
The Cloudflare rebuild cannot solve these files. Node's built-in copy likewise
needs an official runtime version/patch assessment; changing a shared laptop
runtime is not a repository-local dependency patch. Neither action occurred.

Official build recipes:
[Wrangler](https://github.com/cloudflare/workers-sdk/blob/c5d5e893e575b00a62a886d1da395b6246948d18/packages/wrangler/tsup.config.ts),
[external dependency boundary](https://github.com/cloudflare/workers-sdk/blob/c5d5e893e575b00a62a886d1da395b6246948d18/packages/wrangler/scripts/deps.ts),
[Vite plugin](https://github.com/cloudflare/workers-sdk/blob/c5d5e893e575b00a62a886d1da395b6246948d18/packages/vite-plugin-cloudflare/tsdown.config.ts),
[Next taskfile](https://github.com/vercel/next.js/blob/v15.5.28/packages/next/taskfile.js).
The [source receipts](evidence/embedded-undici-20261018/official-source-receipts.json)
record URLs, fetch times, statuses and hashes. Two initial wrong source filenames
returned 404; corrected official paths succeeded. Initial sandbox network
refusals were followed by approved read-only fetches; no access block remains.

## Required candidate validation, not results

Use official upstream regressions from the pinned Undici source comparison:
`test/request-crlf.js`, `test/header-function-crlf.js`, cookie validators,
`test/interceptors/cache.js`, cache utilities, retry-handler and interceptor
tests, `test/interceptors/decompress.js`, dump-interceptor,
`test/node-test/balanced-pool.js`, WebSocket opening-handshake,
`permessage-deflate-limit.js` and `stream/close-locked-writable.js`.
Run bounded relevant cases against the **rebuilt implementation actually loaded
by each bundle**, not only external Undici. Preserve licenses and exact source
provenance; adapt harness setup explicitly. Use small synthetic loopback fixtures,
strict child time/memory bounds and no unbounded compression or remote peers.

Then verify offline Wrangler/plugin initialization, local HTTP/streaming/form
behavior and proxy configuration semantics without real proxies, disposable
Miniflare D1/R2/Images, both product builds/client scans, and clean-install hash
reproduction. Next additionally needs its Edge fetch/Request/Response/WebSocket
and VM compatibility tests. A source-marker replacement or successful import
does not meet these requirements. No such tests are claimed in this review.

The separate [final serial plan](FINAL-SERIAL-VERIFICATION-20261018.md) is
provisional until these dependency decisions settle. No full suite, coverage,
browser run or build was repeated. Prior 48/48 focused tests remain evidence for
clean `9400db0`, not a new run at this review's SHA. Current read-only checks
confirmed braces installed bytes, loader esbuild 0.25.12, Miniflare Sharp 0.35.5,
the unchanged lock digest and original bundle digests. Original worktree and all
earlier artifacts remain intact; no services were started.

Task29/DT-042 stays PARTIAL. Dependency disposition, live-provider authorization
and budget/model evidence, public identity/TLS/Alexa evidence and the complete
same-candidate 14-gate/42-requirement packet remain open. No push, deployment,
paid call, new credential, security change or final video was performed.
