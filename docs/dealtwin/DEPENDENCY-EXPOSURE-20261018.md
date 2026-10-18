# Current dependency exposure decision — 2026-10-18

Registry refresh on the existing clean8e7d99a dependency graph confirms five
unique npm advisories plus15 distinct embedded-Undici advisories. These are
separate sets, not the16 affected-package aggregate count. Current evidence is
from registry.npmjs.org only; no external advisory page or exploit was fetched.
Raw exact-version queries, timestamps, hashes, stable manifests and installed
call-path excerpts are in the companion recovery package.

No dependency was changed: reviewed stable upgrades still preserve vulnerable
paths, while the reviewed complete Cloudflare fix requires a prohibited
Miniflare5 prerelease. Existing framework/build contracts and required Sites
build remain intact. Dev-only classification does not waive any finding.

## Five current npm advisories

| Advisory | Installed / fixed floor | Actual path and exposure | Bounded next action |
|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm (high) | braces3.0.3 / no fixed published stable | Next lint→fast-glob→micromatch→braces; Vinext→commonjs→dynamic-import→fast-glob→micromatch→braces. Nested source/config globs reach recursive parse/compile. No customer request path established. | Reviewed source/config only; upstream stable fix or reviewed nesting-limit backport with semantic API tests. CI timeout is not a fix. |
| GHSA-f88m-g3jw-g9cj (high) | Sharp0.34.5 /0.35.0 | Miniflare imagesLocalFetcher→multipart body→Sharp→bundled libvips (CVE-2026-33327/33328/35590/35591). Native malformed-media prerequisites not reproduced. | Keep local Images unconfigured/private; stable fixed emulator plus image-format integration tests. |
| GHSA-rgj7-g3m4-5g8c (high) | Sharp0.34.5 /0.35.4 | Same local decoder→libheif; registry identifies heap-buffer overflow claims GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545. Requires affected HEIF decode path. | Reject untrusted local media; supported fixed native dependency, format validation and bounded decoding. |
| GHSA-wq5f-xc86-pv6w (high) | Sharp0.34.5 /0.35.5 | Same decoder→librsvg CVE-2026-96889 (use-after-free). Requires affected SVG decode path. | Do not expose this local decoder to untrusted SVG; supported fixed native dependency and integration validation. |
| GHSA-67mh-4wv8-2f99 (moderate) | nested esbuild0.18.20 /0.25.0 | DrizzleKit→esm-loader2.6.5→core-utils3.3.2→esbuild~0.18.20. Observed transform/transformSync; advisory requires esbuild serve plus victim browser/attacker origin. | Keep schema generation local/reviewed; do not expose old dev server/Studio. Upstream supported loader replacement followed by schema-generation tests. |

Sharp's local decoder is demonstrably present in Miniflare, but current Sites
bindings declare D1/R2, not Images; canonical Sites metadata is absent. Node
Judge target uses Vinext and pg. Next's separate Sharp0.35.5 is fixed for these
claims and is not the vulnerable Miniflare copy. The literal-import scan is
bounded evidence, not a claim that every dynamic/transitive path was proved safe.

## Stable compatibility decision

- `braces@3.0.3` latest registry manifest rechecked.
- `drizzle-kit@0.31.11` latest registry manifest rechecked.
- `miniflare@4.20260730.0` latest registry manifest rechecked.
- `@cloudflare/vite-plugin@1.64.0` latest registry manifest rechecked.
- `wrangler@4.151.1` latest registry manifest rechecked.
- `sharp@0.35.5` latest registry manifest rechecked.

Braces latest remains3.0.3. Drizzle Kit0.31.11 still requires
@esbuild-kit/esm-loader^2.5.5; direct newer esbuild does not repair its old nested
copy. Overriding0.18.x to0.25.x violates the helper contract. Latest stable
Miniflare4.20260730.0 pins Sharp0.35.2 (two Sharp advisories remain) and
Undici7.28.0. Current exact Sharp0.34.5→0.35.5 is an unproven0.x compatibility
change; no force override was applied. Latest stable plugin1.64.0 requires
Wrangler4.151.0; latest Wrangler4.151.1 requires Miniflare5.20261012.1-beta.
The earlier all150stable Miniflare4 manifest review found no Sharp0.35.5 chain.
A supported stable upstream chain or explicitly reviewed backport remains the
bounded remediation option, with Sites/Images/schema tests before acceptance.
No speculative dependency churn improves the current release claim.

## Embedded Undici7.28.0 — each current advisory

U1 = node_modules/@cloudflare/vite-plugin/dist/index.mjs (plugin1.43.1).
U2 = node_modules/wrangler/wrangler-dist/cli.js (Wrangler4.107.1).
Both contain7.28.0 source markers; external Undici7.29.1 override cannot patch
those bundled bytes. This current table supersedes the older7.24.8 inventory
for these installed copies. Fixed floors below follow registry affected ranges.

Tooling fetch is concrete: performApiFetchBase→import_undici.fetch→
fetchInternalBase→response.text. Thus compressed-response handling is relevant
when tooling contacts an attacker-influenced endpoint/response; the optional
cache/retry/WebSocket/BalancedPool paths have additional prerequisites below.
No Cloudflare API call was made; network policy still permits exactly npm and
the authorized Library transfer host. No production Node Judge caller to these
bundles was established. Do not equate that evidence limit with harmlessness.

| Advisory / severity | Copy / version / fixed floor | Prerequisite and observed limit |
|---|---|---|
| GHSA-8xcm-r25x-g524 / moderate | U1/U2 7.28.0 / 7.29.0 | A retry interceptor forwards responses across a downstream HTTP boundary; attacker-influenced response framing causes desynchronization. A matching retry/interceptor caller and downstream boundary were not established; implementation presence alone is insufficient. |
| GHSA-4cwx-7wf7-3272 / high | U1/U2 7.28.0 / 7.29.0 | Shared cache processing receives degenerate private directives, producing disclosure or a parse-time failure. Shared cache interceptor construction with these application inputs was not established; its library implementation is present. |
| GHSA-m8rv-5g2x-5cg5 / moderate | U1/U2 7.28.0 / 7.29.0 | An attacker influences a blob-like body type property containing CR/LF and it is serialized as a request Content-Type. Requires a nonstandard attacker-influenced body object; a remote URL string alone is insufficient. |
| GHSA-jr45-8vmc-qm54 / moderate | U1/U2 7.28.0 / 7.29.0 | Shared cache parses attacker-controlled whitespace around Cache-Control equals signs inconsistently. Shared cache interceptor construction with these application inputs was not established; its library implementation is present. |
| GHSA-v3r7-h72x-cjcm / moderate | U1/U2 7.28.0 / 7.29.0 | Attacker influences domain/unparsed cookie fields that setCookie serializes into response attributes. No lower-trust tooling cookie parse/serialize path with the specified propagation was established. |
| GHSA-3wwx-pv8p-q78v / moderate | U1/U2 7.28.0 / 7.29.1 | Negotiated WebSocket permessage-deflate receives a peer-controlled invalid compressed frame; the decompression error escapes. Matching WebSocket caller/negotiation is not established. |
| GHSA-pmjh-fq2x-6v4x / moderate | U1/U2 7.28.0 / 7.29.1 | A retry handler leaves an attacker-controlled response body orphaned, retaining resources across retries. A matching retry/interceptor caller and downstream boundary were not established; implementation presence alone is insufficient. |
| GHSA-r53p-7pc4-xj5r / low | U1/U2 7.28.0 / 7.29.1 | Retry interceptor response forwarding mishandles framing across a downstream HTTP boundary. A matching retry/interceptor caller and downstream boundary were not established; implementation presence alone is insufficient. |
| GHSA-rfgv-xxqx-mfg5 / high | U1/U2 7.28.0 / 7.29.1 | A WebSocket server replies with an unrequested subprotocol; the client error path can terminate the process. Requires this Undici WebSocket implementation, not simply any ws connection; a corresponding plugin/CLI caller remains a proof gap. |
| GHSA-3xpg-4rpp-hhhm / moderate | U1/U2 7.28.0 / 7.29.1 | HTTP response decompression processes an untrusted compressed response without a sufficient expanded-size bound. Tooling HTTP fetch is reachable when invoked; attacker control of a compressed response/endpoint is an additional prerequisite. |
| GHSA-2jfj-6hjv-fm6j / moderate | U1/U2 7.28.0 / 7.29.1 | A shared cache stores/replays Set-Cookie responses across users. Shared cache interceptor construction with these application inputs was not established; its library implementation is present. |
| GHSA-2gqq-gqf2-x968 / low | U1/U2 7.28.0 / 7.29.1 | Dump interceptor receives an oversized chunked response; failure/truncation handling crosses the response boundary. A matching dump-interceptor caller was not established. |
| GHSA-w293-vg96-wgc3 / high | U1/U2 7.28.0 / 7.29.1 | BalancedPool is configured with custom TLS connect options; dropping options changes intended certificate validation. No project-configured BalancedPool/custom TLS caller was found. |
| GHSA-8436-99hf-9mmv / low | U1/U2 7.28.0 / 7.29.1 | Shared cache caches/replays unsafe HTTP method responses under attacker-influenced traffic. Shared cache interceptor construction with these application inputs was not established; its library implementation is present. |
| GHSA-rx4f-c7p8-82vq / moderate | U1/U2 7.28.0 / 7.29.1 | An untrusted WebSocketStream peer closes uncleanly and triggers a process-level error path. Requires this Undici WebSocket implementation, not simply any ws connection; a corresponding plugin/CLI caller remains a proof gap. |

Bounded mitigation: private reviewed tooling inputs, existing exact-domain
policy, no optional shared cache/retry/dump/proxy/WebSocket feature enablement.
For every finding, resolution requires fixed bundled source from a supported
stable toolchain and tests exercising its specific feature; a package override
or lack of observed exploit is not sufficient. No risk acceptance is recorded.

## Readiness work after the dependency decision

A separate UI change binds replay/stress diagnostics to the exact proofId
returned by the service. Previously the last response survived navigation and
could label another proof with the wrong success/diagnostics. Focused static
React rendering tests exercise same-deal proof changes, missing identity,
correct matching results and navigation back. They are not browser evidence.
The initial fixture lacked a required approval snapshot; it was corrected
before the behavioral RED (four assertions failed) and production fix.

Ten browser cases, actual responsive/accessibility behavior, live provider,
public Alexa/identity/TLS, Sites metadata and the final14-gate packet remain
open. No browser retry, credential creation, paid call, security change,
deployment, submission, laptop work or final video occurred.
