# Dependency reachability and MCP follow-up — 2026-10-18

Task29 remains PARTIAL. No dependency finding is waived. The recovery package's
companion verification report binds final checks to the exact clean commit and
tree; older evidence retains its original SHA. All14 release gates,42 mappings,
coverage thresholds and both CI build targets remain required.

## Demonstrated MCP repair

Preparing a command previously replaced a known `refresh` intent with
`prepared`, allowing an unrelated successful read to erase the warning. Prepare
only validates shape; it cannot establish that the selected proof is current.
It now preserves `refresh` while recording the prepared tool. A liquidity
collision also requests a current-state refresh, retaining identifiers without
inventing a successful commitment. Server financial checks remain authoritative.

Three new unit cases cover prepare/serialization/unrelated-read/fresh-proof
recovery and collisions with/without a stale-status field. The existing real
PostgreSQL MCP Judge journey now asserts refresh after the actual Deal B
collision. Before repair the focused run had17passes/4failures; after repair
21/21 passed. An inferred optional-undefined test-data type then failed tsc;
explicit canonical-JSON record typing corrected it without weakening assertions.
The companion report records final broader focused verification.

## Current dependency measurement

Official npm registry metadata was checked on2026-10-18; complete retrieval
provenance/hashes, selected version contracts and installed-source excerpts
accompany the recovery package. This review did not install packages, run
lifecycle scripts, add overrides, remove a tool, change the lockfile or expand
network access. npm audit reports16 package aggregates:0critical,12high,
4moderate, representing **5 distinct advisory URLs**. Aggregate package entries
include affected parents and must not be reported as16 unique vulnerabilities.
Embedded Undici is tracked separately below; it is not included in those5 URLs.

### Braces: high, source/config tooling exposure

Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Installed `braces@3.0.3` remains the latest registry release, with no published
fixed version found. Paths:

- eslint-config-next15.5.28 → @next/eslint-plugin-next15.5.28 → fast-glob3.3.1
  → micromatch4.0.8 → braces3.0.3.
- vinext0.0.50 → vite-plugin-commonjs0.10.4 → vite-plugin-dynamic-import1.6.0
  → fast-glob3.3.3 → micromatch4.0.8 → braces3.0.3.

Source inspection confirms input-length checks but no bounded nesting in the
parser, with recursive compilation/expansion. Next lint globs depend on explicit
`settings.next.rootDir`; this repository does not set it. The Vinext plugin
derives globs from source import expressions. These are lint/build/development
inputs; no customer HTTP field flowing into braces was found in app/lib/worker/
scripts. This is bounded reachability evidence, not proof of universal absence.

Mitigation: use reviewed source/config only, private development and existing
bounded CI execution. CI timeout does not fix recursive exhaustion. Resolution:
upstream fixed stable release or separately reviewed compatible backport with
nesting limits and semantic tests across parse/compile/expand APIs. Forcing an
unreviewed replacement or removing the lint/build path is not an accepted fix.

### Sharp: high, conditional local Images decoding

Advisories: [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)
(fixed0.35.0), [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)
(fixed0.35.4), [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
(fixed0.35.5). Path: @cloudflare/vite-plugin1.43.1 / wrangler4.107.1 →
miniflare4.20260702.0 → sharp0.34.5. Next's separate Sharp0.35.5 is fixed and
must not be confused with this copy.

Miniflare's `imagesLocalFetcher` dynamically imports Sharp and passes uploaded
multipart bytes into decoding for image information/transformation. The worker
contains an Images route, but current Vite configuration declares D1/R2 only;
no Images binding is configured. No application import of this local Sharp
decoder was found in the Node Judge request path. Native exploit prerequisites
were not reproduced, and conditional exposure is not an audit waiver.

Stable blocker: all150 published stable Miniflare4 versions were inspected;
none pins Sharp≥0.35.5. Latest stable4.20260730.0 pins0.35.2, leaving two of
these advisories. Its plugin1.49.0/Wrangler4.116.0 path also requires a different
Workers-types family. Plugin1.64.0/Wrangler4.151.0 reaches Sharp0.35.5 through
Miniflare5.20261012.0-beta, which is prohibited here. Forcing0.35.5 across the
current exact0.34.5 contract is not proven compatible. Full Sites validation
also lacks canonical owner metadata.

Mitigation: keep Images unconfigured and development private; do not process
untrusted images through local emulation. Resolution: a stable supported
Cloudflare/Miniflare chain using fixed Sharp, followed by actual Images and
Sites integration validation; or a separately reviewed compatibility backport.
No broad update is installed merely to change version numbers.

### Esbuild: moderate, legacy schema-tool server prerequisite

Advisory: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
Path: drizzle-kit0.31.10 → @esbuild-kit/esm-loader2.6.5 →
@esbuild-kit/core-utils3.3.2 → esbuild0.18.20. The helper declares
`esbuild~0.18.20`; fixed≥0.25.0 violates that contract. Current latest stable
Drizzle Kit0.31.11 has identical dependencies, retaining this loader. Its other
top-level newer esbuild does not eliminate the nested vulnerable copy.

The advisory concerns old esbuild's development server and cross-origin access.
Inspected core-utils calls transform/transformSync, not serve. The supported
repository workflow is `db:generate`; Judge runtime uses pg/explicit SQL.
No application HTTP invocation of this esbuild server was found. Mitigation:
reviewed local schema generation only; do not expose legacy esbuild servers or
Drizzle Studio. Resolution: upstream removal/update of the loader, or reviewed
loader replacement/backport followed by schema-generation compatibility tests.
No force override or removal of the existing schema workflow is justified.

### Embedded Undici: separately tracked, not silently cleared

Current plugin/Wrangler bundles still contain Undici7.28.0 markers despite the
package override to7.29.1. Prior individual advisory analysis remains in
`evidence/dependency-review-20261018/ADVISORY-DETAILS.md`; the subsequent supplied
GHSA-3wwx-pv8p-q78v is an additional moderate claim, making15 tracked embedded
claims. This batch reconfirmed bundle markers and version contracts, not every
advisory's external content. Do not add these blindly to npm aggregate counts.

These copies execute in tooling, not established Judge business routes. Keep
development private, the exact two-domain allowlist, and unused proxy/cache/
WebSocket features disabled. Applicability differs by advisory and requires
its stated conditions; development-only classification is not a blanket fix.
Stable Miniflare4 also retains Undici7.28.0; newer reviewed tooling with7.29.1
requires the prohibited Miniflare prerelease. Resolution needs supported stable
bundled fixes and specific feature validation. Override alone cannot patch
bundled source; no unsupported string replacement was performed.

## Remaining readiness boundaries

Ten browser cases remain BLOCKED/not run: the official archive attempt returned
HTTP200 with195bytes of unavailable-page HTML, not ZIP. No download retry,
root-cache access or sandbox change was made. Canonical Sites configuration,
the unresolved audit, and a complete same-candidate14-gate packet remain open.
Owner-supplied competition research permits simulated Alexa; scripted local MCP
and real PostgreSQL provide bounded simulation evidence, not actual Alexa voice,
account, public identity or live Nebius evidence. Live provider work still needs
exact model, authorized secret/domain and a defensible spending bound; timeouts
are not dollar caps. No external provider call, paid service, push, deployment,
submission, final video or laptop execution occurred.
