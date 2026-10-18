# Stable Cloudflare tooling update and outstanding release decisions

Starting checkpoint: `da2b9d6be9e5056bc71bef8c1c12fa8ee8cfe13c`.
Task29 remains PARTIAL. This is a compatible tooling update, not application
readiness, a release waiver, or proof of the full Sites target.

## Change and bounded benefit

Pin `@cloudflare/vite-plugin`1.43.1 and Wrangler4.107.1 together. Their declared
graph selects stable Miniflare4.20260702.0/workerd1.20260702.1 and esbuild0.28.1.
Installed Workers types4.20260702.1 satisfies Wrangler's peer; Vite8 and Node24
satisfy the plugin/runtime contracts. No new major or prerelease entry was added.
Existing unenv/youch prereleases and all root overrides remain unchanged.
`npm ci --ignore-scripts --no-audit --no-fund` installed560 packages in14s.
No lifecycle scripts, forced rebuilds, embedded patches or architecture changes.

Verified upstream bundles now embed Undici7.28.0 instead of7.24.8; Wrangler's
embedded ws is8.21.0 instead of8.18.0. Seven supplied Undici ranges, two ws
ranges and the Wrangler Windows esbuild range no longer apply to those copies.
This does not clear the embedded toolchain. **GHSA-3wwx-pv8p-q78v now applies**
to embedded Undici7.28.0: moderate unhandled decompression error, requiring an
active Undici WebSocket with permessage-deflate and a malicious peer. An app
caller satisfying those prerequisites was not established. Fourteen other
supplied Undici advisories still apply; optional cache/retry/proxy/WS paths need
their own prerequisites. External Undici7.29.1 does not replace bundled code.
No advisory has been waived. The complete range comparison is in the companion
deliverable's `cloudflare-stable-evidence/candidate-benefit.json`.

Before checkpointing, the two new native compatibility cases passed: Wrangler's
resolved esbuild transforms typed Worker source; disposable local Miniflare serves
a Worker, writes/reads D1 and R2, and returns404 for an unknown route. This fixture
contains no Sites project metadata, remote binding, persistent data or credential.
The19 existing hosting/native/dependency/sandbox cases and typecheck also passed.
Final commit-bound checks are reported separately in the recovery deliverable;
these candidate checks must not be substituted for its final results.

## Disposition of the six previous unique npm advisory URLs

Counts describe package aggregates, not independent vulnerabilities. The candidate
audit remains16 aggregates (0 critical,12 high,4 moderate); unique reported URLs
drop from6 to5. The first five below remain open. Embedded Undici is additional
evidence not included in that npm count.

| Advisory | Installed path / stable fixed version | Exposure, mitigation and required decision |
|---|---|---|
| GHSA-vfj7-8cjw-p6xm (high) | `node_modules/braces`3.0.3; no published fixed version in the reviewed registry inventory | Next ESLint -> fast-glob -> micromatch, and vinext -> commonjs/dynamic-import -> nested fast-glob -> micromatch. Build/lint patterns can reach recursive brace expansion; current Next rootDir setting is absent and generated import patterns come from reviewed source/configuration, not customer deal values. Keep reviewed inputs, private dev servers, read-only CI and bounded jobs. These are mitigations, not a fix. Requires a supported upstream backport, an explicitly owned compatible patch with nesting tests, or a dated owner exposure decision. No patch/replacement/waiver was authorized here. |
| GHSA-f88m-g3jw-g9cj (high) | `node_modules/miniflare`4.20260702.0 -> `node_modules/sharp`0.34.5; first fixed Sharp0.35.0 | Affected native libvips decoders require untrusted media. Miniflare's local Images multipart decoder imports this Sharp; current Sites config declares D1/R2, no Images binding. No public image upload route into this decoder was established. Keep that binding disabled and dev runtime private. Requires a compatible Miniflare release fixing all three Sharp claims or separately reviewed coordinated migration. |
| GHSA-rgj7-g3m4-5g8c (high) | Same Miniflare/Sharp path; first fixed Sharp0.35.4 | HEIF/AVIF via affected libheif; actual codec build and malformed-input details remain unproven. Same local Images boundary and decision as above. |
| GHSA-wq5f-xc86-pv6w (high) | Same Miniflare/Sharp path; first fixed Sharp0.35.5 | SVG via affected librsvg use-after-free; exact exploit trigger not reproduced. Same local Images boundary and decision as above. Production-installed Next's separate `node_modules/next/node_modules/sharp`0.35.5 is already fixed. Do not count it as the vulnerable copy. |
| GHSA-67mh-4wv8-2f99 (moderate) | drizzle-kit0.31.10 -> @esbuild-kit/esm-loader2.6.5 -> core-utils3.3.2 -> `node_modules/@esbuild-kit/core-utils/node_modules/esbuild`0.18.20; first fixed0.25.0 | Requires the affected esbuild development server and a malicious origin reading its responses. Current Drizzle helper calls transform/transformSync, not serve. Node Judge uses explicit pg SQL migrations, not Drizzle at request time. Do not expose an old esbuild server. A transitive major override violates the old helper contract; removal/replacement of the existing Drizzle workflow or a maintained compatible backport needs explicit scope review. No such change made. |
| GHSA-g7r4-m6w7-qqqr (low) | Previous `node_modules/wrangler/node_modules/esbuild`0.27.3 removed; Wrangler resolves `node_modules/esbuild`0.28.1, the stable fixed version | Windows dev-server path issue; absent in the final Wrangler resolution. Native transform compatibility tested on Linux, not a Windows exploit reproduction. Old Drizzle esbuild has the separate CORS issue above. |

The Node/PostgreSQL Judge built handler and Alexa MCP application services do not
import Cloudflare's compiled CLI/plugin or Miniflare image decoder. Their source
build still traverses vinext tooling, so this is a runtime exposure distinction,
not permission to remove CI checks. The existing Sites target uses Cloudflare
build/dev machinery directly. Neither local success nor the Cloudflare update
proves public Cloudflare Images, live Alexa identity, or live provider behavior.

## Smallest honest competition verification path

1. Keep the Node/PostgreSQL synthetic Judge as the first local test target; run
   existing transaction/RLS/race/service tests, unchanged coverage gates, typecheck,
   lint, Node build, client secret scan and authenticated request checks. Preserve
   all14 release gate IDs and42 requirement mappings. Passing these is bounded
   local evidence, not public readiness.
2. Execute the existing10 browser cases only with a legitimately provisioned
   supported browser and intact sandbox. No official browser execution capability
   was exposed in this session. Playwright's expected Chromium1248 executable is
   absent; system chrome-sandbox is owned by nobody (uid65534), mode4755. Do not
   disable sandbox, change ownership/permissions or download from new domains.
   A platform-provided supported browser is needed. One read-only stat of
   `/root/.cache/ms-playwright` was denied by the OS (PermissionError13); no retry
   or escalation was made. Request-only smoke is not browser proof.
3. Preserve the existing Sites build/CI target. Actual `.openai/hosting.json`
   metadata must come from its authorized owner; do not invent IDs/bindings or
   create a new site/credential to make the build green. The isolated D1/R2 test
   proves tooling compatibility only. Full Sites RSC/SSR build remains pending.
4. Keep dependency audit blocked while high findings lack a supported fix or an
   explicit current, dated policy-compliant owner decision. A newer coordinated
   Cloudflare path reviewed earlier requires Workers types5 and Miniflare5
   prerelease; that separate major/prerelease decision is not authorized here.
5. Public HTTPS/session-to-tenant isolation, deployment backup/restore evidence,
   live Nebius extraction and real Alexa/account end-to-end integration need their
   own authorized environment and credentials. Offline fixtures/MCP contract tests
   do not satisfy them. No service creation, paid use, deployment, final video or
   submission is performed. Task29 stays PARTIAL until actual gates pass.

The HTTP allowlist remains exactly registry.npmjs.org and
sdmntprwestcentralus.oaiusercontent.com, with no additional TCP domains/IP ranges.
Prior reports and counts remain historical. The older review's incorrect claim
that Vitest3 already used AST remapping is corrected in its source document;
the approved Vitest4 migration's measured evidence remains unchanged.
