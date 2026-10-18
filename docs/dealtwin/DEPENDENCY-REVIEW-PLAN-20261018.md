# Remaining dependency review and minimum migration plan

Reviewed candidate: `7cd8abaf24d7529efa5cc2446230c3dff6520cc3` in the existing
cloud workspace. **Review only: no dependency installation, major migration,
source patch, lifecycle script, deployment or gate change in this batch.**
Task29 remains PARTIAL. The last measured full regression is 1274/1274 at
`cd1d8bdfa808395355bd66c3dd69e2286aecc84f`; its subsequent documentation checkpoint
is 7cd8aba. Those results are not tests of the proposed versions below.

This extends the previous static review using repository guidance in
AGENTS.md, LOCKED_PRODUCT_SPEC sections 10–16, DEPLOYMENT.md and docs/security.md.
It is not a new exhaustive security scan or a repeated triage-skill verdict set.
Current npm registry metadata and integrity-verified package archives were read
without executing their code. Only registry.npmjs.org was contacted; the effective
allowlist remains exactly that host and sdmntprwestcentralus.oaiusercontent.com.
Full GitHub advisory text/release notes were not fetched under that policy.
Native exploit details and undisclosed upstream breaking changes remain gaps.

## Counts and evidence

The audit at exact clean 7cd8aba reports **20 affected package aggregates**:
2 critical, 12 high, 6 moderate. It reports **9 distinct GHSA URLs**, not 20
independent vulnerabilities. The two critical aggregates are `tinypool` and
`vitest`; both inherit the same two Tinypool advisories. The 12 high aggregates
split into eight inheriting braces and four inheriting Sharp. No waiver exists.

A bounded registry advisory lookup in this review confirms the existing braces,
Tinypool, Sharp, mocker, ws and Undici claims. It is not a fresh full-graph audit.
The prior 32-URL inventory also remains relevant to embedded old ws/Undici,
which ordinary npm dependency audit no longer counts after external overrides.
The lookup additionally identifies GHSA-3wwx-pv8p-q78v in **candidate Undici
7.28.0**, affected >=7.28.0 <7.29.1. This is not a newly installed vulnerability:
neither current embedded 7.24.8 nor external 7.29.1 is in that range.

Evidence under [dependency-review-20261018](evidence/dependency-review-20261018/):
`reviewed-advisories-current.json` preserves registry IDs, URLs and ranges;
`installed-review-graph.json` records actual installed/locked paths;
`source-evidence.json` records reviewed line excerpts and complete-file hashes;
`release-alternatives.json` records published-version inventories and candidate
contracts; `archive-provenance.json` records verified archive integrity;
`ADVISORY-DETAILS.md` retains individual embedded-copy advisory prerequisites;
`gate-classification.json` preserves all 14 stable base IDs and the 42-ID policy.

## Critical chain: real test entrypoint, incomplete attack chain

Paths are `node_modules/vitest` 3.2.7 → `node_modules/tinypool` 1.1.1.
The direct coverage package is 3.2.7 but its npm aggregate severity is moderate;
do not describe it as a third critical finding.

| Advisory | Installed/fixed | Source path and exploit prerequisites | Scope/conclusion |
|---|---|---|---|
| [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | Tinypool1.1.1; affected <=2.1.0; first fixed2.1.1 | Vitest `createForksPool` constructs Tinypool; `ThreadPool._addNewWorker` reads worker options and starts a child process. Requires a prior same-process prototype-pollution primitive affecting inherited options before worker creation. | Test tooling, including CI. Current Vitest supplies own filename/env/execArgv fields, which narrows some gadgets. No lower-trust pollution source into the runner parent was established; no confirmed application RCE claim. |
| [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | Tinypool1.1.1; affected <2.1.2; fixed2.1.2 | Vitest calls `pool.run(data,{name,channel})`; Tinypool destructures filename/runtime/etc from that ordinary object. A polluted inherited filename could override the configured worker module. Requires pollution in the runner process, not merely a value in a separate test worker or an HTTP payload. | Reachable test sink; missing attacker-to-pollution chain keeps exploitability unresolved. Not imported by the built Judge request handler. |

`vitest.config.ts` selects Node tests, serial files and no browser/UI/API setup;
installed defaults are `pool:'forks'`, `api:false`; scripts use `vitest run`.
Tests execute repository code, so a contributor already allowed to replace test
code has code execution independently of these gadgets. That observation does
not prove all CI/plugin/fixture inputs are trusted and is not an audit waiver.

Tinypool2.1.2's verified source normalizes constructor, worker, recycle and run
options with `Object.assign(Object.create(null), source)`. This shows a technically
backportable fix boundary. However, no 1.x fixed release exists and Vitest3.2.7
requires `^1.1.1`; overriding to2.1.2 violates that contract. A maintained 1.x
fork would need all affected entrypoints, own/inherited-property tests, worker
and fork parity, cancellation/recycle tests, provenance and explicit ownership.
An untracked edit to node_modules or a postinstall patch would not be durable.

The separate [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
affects `node_modules/vitest/node_modules/@vitest/mocker`3.2.7 and Vitest3.2.7,
fixed4.1.11. Its interceptor accepts a WebSocket redirect registration and later
`readFile`s the resolved path. It needs that interceptor plugin plus a reachable
client channel and module request; current Node one-shot tests do not configure
this browser interceptor. The fixed4.1.11 source checks `isFileLoadingAllowed`
before registration. A separate mocker3 backport is technically possible (the
installed nested Vite7.3.7 exports that API), but needs path, symlink, deny-list,
Windows and redirect compatibility tests. Patching Tinypool alone misses it.

**Decision:** no published compatible 3.x/1.x backport or deduplication removes
both families. A coordinated Vitest4 migration is the smallest reviewed upstream
route; a two-package maintained backport is an alternative project, not a trivial
override. Neither was applied. Vitest5 is unnecessary for these supplied claims.

## High chain A: braces, actual inputs and mitigations

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), registry
ID1240992, high/CWE-674, affects **all published braces versions <=3.0.3**.
This is the current stack-exhaustion claim, not an older numeric-range expansion
advisory already fixed by3.0.3. Registry latest is still3.0.3; there is no
published fixed version as of this review.

Actual paths:

- `eslint-config-next@15.5.28 → @next/eslint-plugin-next@15.5.28 →
  fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`.
- `vinext@0.0.50 → vite-plugin-commonjs@0.10.4 →
  vite-plugin-dynamic-import@1.6.0 → fast-glob@3.3.3 →
  micromatch@4.0.8 → braces@3.0.3`. The second fast-glob is nested under
  `node_modules/vite-plugin-dynamic-import/node_modules/fast-glob`.
  See the installed graph for authoritative versions if a future graph changes.

`fast-glob/out/managers/tasks.js` expands patterns by default;
`utils/pattern.js` calls `micromatch.braces(pattern,{expand:true,nodupes:true})`.
`braces/lib/parse.js` limits length to10000 characters and tracks depth but does
not cap it; `expand.js` and `compile.js` recursively walk nested nodes. A range
cardinality limit does not bound nesting depth. No exhausting payload was run.

For lint, `@next/eslint-plugin-next/dist/utils/get-root-dirs.js` invokes glob only
for explicit `settings.next.rootDir`; current eslint.config.mjs supplies none,
so that caller returns `context.cwd` without glob expansion. For build, vinext
registers CommonJS transformation; dynamic import conversion constructs patterns
from source literals/resolved aliases and replaces variable expressions with
`*`. It does not substitute a customer's runtime string. Deep braces in a source
literal/configuration can still reach recursive expansion. Configuration/import
source is build input, not DealTwin commercial JSON. No request-to-glob path was
found in app/lib/worker or the inspected built Node entrypoint. This is bounded
static evidence, not proof about every possible future plugin/configuration.

Real mitigations while the finding remains open:

1. Keep build/lint configuration and source inputs under review; do not add an API
   that forwards user patterns, uploaded project sources or AI-generated imports
   into these tools. In CI, treat untrusted PR execution as untrusted code:
   read-only permissions, no deployment/production secrets, bounded job resources.
   Current workflow has read-only repository permissions and a35-minute timeout;
   the timeout limits impact but does not repair synchronous stack exhaustion.
2. Keep development servers private and run reviewed-source builds. The Node
   Judge launch uses its built handler, not a build-on-request endpoint. These
   controls narrow exposure; they do not remove braces from the toolchain.
3. A future maintained patch should reject excessive nesting before any recursive
   parse/compile/expand/stringify walk, including public AST-input APIs, while
   retaining legitimate ranges, escaping and nested brace semantics. It needs a
   declared compatible input limit, bounded regression cases and upstream/fork
   ownership. Disabling all brace expansion would break the generated extension
   groups in dynamic imports. Replacing braces with another glob package is not
   API-equivalent. Neither patch nor replacement is approved or applied here.

No tests, lint rules, build plugins or features were removed. Deduplicating
fast-glob leaves the same micromatch/braces sink; latest micromatch4.0.8 and
fast-glob3.3.3 still use it. npm's Next/vinext downgrade suggestions are not fixes
for this boundary. A current owner-approved, dated exposure decision is possible
under repo policy, but has not been granted and must not silently renew the old
expired waiver.

## High chain B: Sharp and Cloudflare embedded dependencies

Remaining native path: direct plugin1.37.1/Wrangler4.92.0 →
`node_modules/miniflare`4.20260515.0 → `node_modules/sharp`0.34.5.
The production-installed Next copy is separately fixed0.35.5 at
`node_modules/next/node_modules/sharp`; do not conflate these copies.

| Advisory | First fixed Sharp | Required native input |
|---|---|---|
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) |0.35.0| Untrusted media decoded by affected libvips; groups CVE-2026-33327/33328/35590/35591. Format-specific details are not established by the registry synopsis. |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) |0.35.4| HEIF/AVIF decoding through affected libheif; upstream GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545. Actual codec build and malformed-input prerequisites require further upstream detail. |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |0.35.5| SVG decoded through affected librsvg, CVE-2026-96889 use-after-free; exact trigger not proven here. |

Miniflare's `imagesLocalFetcher` dynamically imports Sharp, consumes the `image`
multipart File and invokes `sharp(await body.arrayBuffer(),{})`. The source
`worker/index.ts` has an image route that uses `env.IMAGES`, but current
vite.config.ts only supplies D1/R2 binding metadata; no Images binding is
configured and canonical Sites metadata is absent. Its local Images decoder is
therefore conditional, not a demonstrated public upload endpoint. Miniflare is
local Cloudflare tooling, not the production Cloudflare Images service or the
Node/PostgreSQL handler. Next's fixed copy remains production-installed but the
chosen vinext Node image path does not establish an exposed Sharp decoder.

Embedded paths are `node_modules/@cloudflare/vite-plugin/dist/index.mjs`
(Undici7.24.8) and `node_modules/wrangler/wrangler-dist/cli.js`
(Undici7.24.8, ws8.18.0). Actual bundled fetch callers handle Cloudflare/tooling
HTTP responses; Wrangler also selects EnvHttpProxyAgent when proxy configuration
is supplied. WebSocket peer/response handling, configured proxy options, shared
cache and retry interceptors have different prerequisites. Presence in an export
table is not proof each optional interceptor is used. No application route was
found importing these bundles. The full per-advisory conditions and proof gaps
are retained in ADVISORY-DETAILS.md, including high WebSocket resource/error,
SOCKS routing/TLS, cache and BalancedPool findings. External ws8.21.0 and
Undici7.29.1 overrides do not rewrite this compiled code.

## Alternatives checked: a major is not assumed merely from npm audit

| Candidate | Verified contracts/content | Decision |
|---|---|---|
| Vitest3 / coverage3 / mocker3 | Latest published3.x is3.2.7; Tinypool latest1.x1.1.1. | No fixed compatible release. Dedup cannot change ranges. |
| Vitest4.1.11 + coverage4.1.11 | First fixed mocker4.1.11, no Tinypool or vite-node dependency; direct child-process/worker implementation; supports Vite8 and Node22/24. | Proposed minimum upstream batch. Registry now has4.1.12 and5.0.5; neither is required for these claims. |
| Cloudflare plugin1.43.1 + Wrangler4.107.1 | Last pair using Workers types4; Miniflare4.20260702.0, esbuild0.28.1, embedded ws8.21.0/Undici7.28.0; Sharp0.34.5. Current Workers types4.20260702.1 satisfies the peer. | Compatible partial alternative exists, but remaining Sharp/Undici plus candidate-only GHSA-3wwx remain. Not installed: affected Sites behavior cannot be fully validated without its real metadata. |
| Plugin1.49.0 + Wrangler4.116.0 | Last plugin pair on stable Miniflare4.20260730.0; now needs Workers types5. Embedded Undici7.28.0/ws8.21.0; external Sharp0.35.2. | Avoids Miniflare5 but not Workers types major, embedded Undici or all Sharp claims. External same0.35-family patch cannot fix embedded code. |
| Plugin1.63.1 + Wrangler4.149.0 | Earliest inspected plugin whose declared native/network pins are all fixed: Sharp0.35.5, Undici7.29.1, ws8.21.0. Plugin bundle markers verified; Wrangler4.149 archive not independently inspected. | Already requires Miniflare5.20261006.1-alpha and Workers types5; not a stable-major escape. No whole-bundle clearance claim. |
| Plugin1.64.0 + Wrangler4.151.0 | Both archives already inspected: ws8.21.0/Undici7.29.1; Miniflare5.20261012.0-beta→Sharp0.35.5, matching workerd1.20261012.1; Workers types^5.20261006.1. | Preferred fully inspected coordinated candidate, pending major/prerelease review. Registry4.151.1 exists but was not substituted blindly. |

Cloudflare plugin and Wrangler retain major1/4, but their required types/runtime
cross major boundaries. A hand-patched internal bundle would require upstream
source, reproducible build and exported artifact verification; string substitution
or external overrides are not a supported backport. There is no fully fixed,
published Workers4/Miniflare4 route established by this review. A future upstream
backport could change that conclusion. No additional update was deemed both
complete enough and safely verifiable in the available target environment.

## Reviewable migration batches (not executed)

### A. Test toolchain, independent of Cloudflare

Pin `vitest` and `@vitest/coverage-v8` to4.1.11 together; expect all matched
`@vitest/*` internals4.1.11 and no Tinypool. Add explicit dev `vite-node`3.2.4
to preserve current benchmark/bootstrap entrypoints. **Correction:** previous
migration-plan.json suggested3.2.7; installed and last published3.x vite-node is
3.2.4. This does not downgrade an installed package. It retains its own compatible
Vite7.3.7 family while Vitest4 can use root Vite8; do not force a shared Vite8
into vite-node's incompatible range. Longer-term runner replacement is separate.

Files: package.json/package-lock.json required; vitest.config.ts only if actual
compatibility demands it; review scripts/dealtwin/local-demo.mjs,
session-bootstrap.ts, prepare-browser-fixture.ts, evaluation/dealtwin/cli.ts,
tests/dealtwin/evaluation/benchmark-cli.test.ts, .github/workflows/ci.yml and
evidence tooling consuming JSON reporter output. Preserve script semantics.

Project-relevant changes/risks: worker pool implementation changes from Tinypool;
4.1.11 still documents `fileParallelism:false`→one worker and default forks.
No current poolOptions/workspace/custom-pool configuration needs translation.
Mock factories/hoisting, reset/restore behavior, fake timers and stubbed env affect
existing UI/API/MCP suites. Coverage uses ast-v8-to-istanbul1.x instead of0.3.x;
the project already uses AST coverage, so do not describe this as a first switch
from the older coverage engine. Includes and global/five-module thresholds stay
unchanged; new branch accounting must be investigated, not hidden. Node engines
fit current Node24 and pinned CI22.13; both still need actual candidate checks.

Acceptance after review: scripts-disabled clean install and no invalid peers;
enumerate 126 files/1274 existing tests without deletion or new skips; targeted
UI mock/API/MCP, benchmark CLI/bootstrap and10 dependency/native cases; serial
full coverage with real disposable PG and unchanged thresholds; two-client races
and failure injection;113 benchmark cases/57 replay mismatches reproduced;
typecheck/lint/Node build/client scan/HTTP fixture; candidate-bound audit and
bundle inspection. Sandboxed browser remains a separate blocked acceptance check,
not replaced by HTTP success. Verify no Tinypool/mocker3 remains in the resolved
graph. Do not claim native pollution exploits were reproduced.

### B. Cloudflare target, only after separate review

Pin plugin1.64.0, Wrangler4.151.0, Workers types5.20261006.1; require matching
Miniflare5.20261012.0-beta/workerd1.20261012.1. This explicitly accepts a prerelease
runtime only if approved. Minimum source contract still exposes `viteEnvironment`,
`childEnvironments` and config customizers; archive signatures alone do not prove
RSC/SSR runtime compatibility. Miniflare5 behavioral differences beyond those
interfaces are unresolved without target execution/release notes.

Files: package.json/package-lock.json; review vite.config.ts, worker/index.ts,
tsconfig.json, build/hosting-bindings.ts, build/sites-vite-plugin.ts and existing
hosting/security tests. Current Worker relies on global Fetcher/D1Database and a
local Images interface, not Durable Objects or a custom Miniflare API. Workers5
global Request/Response/stream type interactions need consumer type tests;
`skipLibCheck:true` alone is insufficient proof. No Sites metadata is fabricated
or changed. No image feature, D1/R2 binding or legacy route is removed.

Review overrides before resolution: existing `esbuild@~0.28.0:0.28.1` would
also match new Wrangler0.28.2 and downgrade it. Narrow/remove that selector as
appropriate to preserve upstream0.28.2 while keeping fixed versions for Vite/tsx.
Check all external and embedded ws/Undici/Sharp copies; remove an override only
when the complete new graph proves the upstream pin is safe. Native platform
packages must work with `--ignore-scripts`; inspect install script declarations
and licenses before installation and stop for a concrete necessity if they do not.

Acceptance: real authorized canonical hosting metadata must already be available;
configured Sites build, RSC/SSR and D1/R2 adapter contracts, image path behavior
without inventing a missing binding, no-public-dev-server guards, asset scan,
Node/Judge and legacy regression, typecheck/lint and fresh candidate-bound audit.
Verify the distributed bundles' versions and changed security code, not only
package-lock. No login/deploy/service connection is part of this batch.

### Rollback and residual gate policy

Keep A and B as separate commits with lockfile snapshots. On a failed acceptance
gate, preserve logs; revert that batch's reviewed files with a new revert commit,
then restore its exact previous lock via `npm ci --ignore-scripts --no-audit
--no-fund --cache /workspace/dealtwin-npm-cache`. No hard reset, SQL rollback,
database deletion or removal of other work. Re-run only checks affected by the
rollback; retain failure evidence. No schema/application financial change is
planned. Record source SHA before testing and bind evidence to it; documentation
commits must not relabel older browser/restore tests as current evidence.

Even a successful A+B does not clear braces, old Drizzle loader esbuild,
browser/hosting/public prerequisites or the final evidence packet. A reviewed
braces backport or explicit current owner decision is a distinct remaining item.

## Stable Task29 gates: requirement versus hosting choice

All14 IDs in release-gate.ts remain mandatory for its current **public-release**
packet; no optional-status bypass exists. The distinctions below explain target
scope, not a change to code, locked spec, current CI or the42-ID policy.

| Stable gate | Required scope from repository spec | Current evidence/status |
|---|---|---|
| dependency_audit | Public Judge/Alexa release; reviewed critical/high remediation or current dated owner decision (spec14/16). | FAIL20 aggregates; old embedded copies also open. |
| migration_restore | Durable Judge integrity; explicit Task29 clean migration/restore and public spec16. | Historical45-table restore413c0e4; final-candidate binding pending. |
| rls | Judge isolation and public/Alexa tenant boundary (spec9/14/16). | Local real-PG passcd1d8bd; public composition not certified. |
| cross_tenant_api | Same; requests cannot choose tenant authority. | Local passcd1d8bd. |
| secret_scan | Every target; public/client/log hygiene (spec14/16). | Bounded60-file client passcd1d8bd; not exhaustive. |
| typecheck | Product/repository completion (spec15/16, Task29). | Passcd1d8bd. |
| lint | Same. | Passcd1d8bd. |
| tests | Same; real PostgreSQL, exact-money, replay/races required. |1274/1274 passcd1d8bd; no candidate migration executed. |
| coverage | Same, unchanged configured thresholds. | Passcd1d8bd. |
| build | Production build for selected Node Judge required. Cloudflare/Sites is a separate hosting target (spec3 deployment inventory, DEPLOYMENT.md), not a prerequisite technology for Alexa MCP. Existing Task29 command and CI nevertheless require both builds until explicitly reviewed otherwise. | Node pass; Sites blocked by canonical metadata. Keep this gate blocked under current repo policy. |
| authenticated_judge_smoke | Real persistent Judge journey (spec15/16, Task29 desktop/1024/820). | Blocked sandbox/browser;1 HTTP case is not browser proof. |
| tls | Public endpoint/non-loopback DB (spec14); not a loopback fixture requirement. Public Alexa transport needs its actual authorized endpoint. | Not proven; no deploy authorized. |
| least_privilege | Local app/reset database roles and public deployed credentials (spec9/14). | Local pass; public environment not certified. |
| backup_restore | Explicit Task29 drill and public operational gate (spec14). | Historical45-table restore413c0e4; final-candidate evidence pending. |

Additional stable42-ID policy: DT-015 includes `nebius_live`; DT-039 includes
`alexa_account`; DT-042 includes `public_identity`. They remain pending and are
not removed. Spec10 explicitly makes canonical synthetic Judge independent of
external AI calls; that permits a local offline Judge demonstration, **not** a
claim of completed live Nemotron or Alexa integration. Spec12/MVP include those
integrations, so an Alexa competition claim needs actual account/transport and
durable multi-turn evidence. Local MCP suites prove contracts only. Public
identity/TLS apply to the public composition; current private signed sessions
cannot be presented as public identity infrastructure.

Hosted CI is existing repository validation (spec inventory/Task18); it is not a
separate literal ID among the14 gates and the spec does not prescribe a hosting
vendor. Local CI-equivalent results do not prove a hosted run. Cloudflare/Sites,
Supabase, VPS choice or paid providers are not inherently required technologies
for the Node/PostgreSQL Judge, but current preserved build obligations and live
integration claims still require honest disposition. Any target-policy change
needs explicit review; this report changes none. Final42-ID same-candidate
aggregation remains incomplete. No video or submission is authorized now.
