# DealTwin dependency remediation — Task29 remains PARTIAL

Follow-up: [remaining source review and migration plan](DEPENDENCY-REVIEW-PLAN-20261018.md)
documents compatible alternatives, individual exploit prerequisites and unchanged
gate scopes. It corrects the historical proposed vite-node version below to
the actual installed/published3.2.4. No further dependency update was applied.

Continued in the same cloud workspace from
`57782e8c84435050e3a6ed786a56b9c69ba69e4b`. Two separate compatible fix commits:

- `89d8d7f59f45f9f7f9dfcbfc82a70ff0969d3600`: external ws8.18.0→8.21.0 and
  Undici7.24.8→7.29.1, pinned through overrides; eight focused boundary tests.
- `cd1d8bdfa808395355bd66c3dd69e2286aecc84f`: esbuild0.28.0→0.28.1 only for
  matching0.28.x consumers; Next-resolved Sharp0.34.5→0.35.5; two native
  compatibility tests. This is the frozen candidate for the final checks.

No application financial logic, SQL, browser sandbox, Sites metadata, coverage
threshold, existing assertion, or Task29 gate changed. No dependency was removed
merely to reduce audit counts. No install lifecycle script, force resolution,
major migration, new domain, deployment or provider credential was used.

## Audit result and interpretation

The starting npm audit contains **22 affected package aggregates**:
2critical/14high/6moderate. Its33 direct advisory records refer to **32 distinct
advisory URLs**; Vitest and @vitest/mocker repeat one GHSA, and some Sharp records
group several underlying CVEs. These counts are not interchangeable.

Final audit on clean `cd1d8bd` reports **20 affected package aggregates**:
**2critical/12high/6moderate**, across **9 unique reported advisory URLs**.
The high/critical gate still fails, exit1. No waiver was applied.

The apparent advisory reduction does **not** prove all corresponding code was
removed: Cloudflare plugin1.37.1 embeds Undici7.24.8, while Wrangler4.92.0 embeds
both Undici7.24.8 and ws8.18.0. An npm override cannot rewrite embedded code.
These remaining copies are explicitly open even though npm no longer reports
the patched external Undici/ws packages. Source digests/version markers are
recorded in `reviewed-source-digests.json`.

See [complete22-package /32-advisory inventory](evidence/dependency-audit-20261018/TRIAGE-INVENTORY.md),
`advisory-inventory.json`, `package-triage.json`, `remediation-inventory.json`,
`triage-result.json`, and the original/final audit reports. Each advisory has its
identifier, severity/range, source URL, exploit preconditions and fixed-version
candidate; each package has installed paths/versions, direct/transitive status,
actual runtime/build/test exposure and remaining proof gaps.

Static triage used the security triage skill and repository guidance in
`docs/security.md` / `docs/dealtwin/DEPLOYMENT.md`. No applicable SECURITY.md was
present. Two shared security-skill reference resources were unavailable; local
product/deployment policy supplied the boundary instead. This is not an
exhaustive security scan or a certification of non-exploitability.

The22 original inputs remain distinct:19 need further reachability review and
three esbuild-kit/Drizzle aggregates are statically non-applicable to the
**configured transform-only/db:generate path** for the esbuild serve-CORS claim.
That narrow finding is supported by the actual loader's transform/transformSync
calls, not by a generic “dev dependency” dismissal. It does not waive npm audit
or cover an operator starting an esbuild server in another configuration.
No end-to-end application exploit chain was claimed confirmed by static triage.

The primary advisory evidence is the authorized npm registry response plus
installed code and package metadata. External GitHub advisory pages were not
fetched under the two-domain network policy. Exact format-specific native image
exploit details and unproven deployment preconditions remain explicit gaps.

## Why these updates are compatible and useful

| Change | Compatibility evidence | Actual validation / limits |
|---|---|---|
| ws8.21.0 | Same major, supported Node engine, unchanged MIT license; two existing Cloudflare consumers keep their APIs | Default finite count limits and a nine-byte, three-fragment rejection; valid two-fragment control passes. No listener or exhaustion payload. Embedded Wrangler copy remains. |
| Undici7.29.1 | Same major; Node>=20.18.1 fits project>=22.13.0; MIT unchanged | Rejects three invalid SameSite substrings while retaining None/Strict/Lax. Other advisory paths were not individually exploited. Embedded copies remain. |
| esbuild0.28.1 | Vite accepts ^0.27.0 or ^0.28.0; tsx accepts ~0.28.0; pin touches the matching0.28.x family only | Native TS/bigint transform and Node build pass without postinstall. Linux execution does not prove the Windows-specific security scenario. Wrangler0.27.3 and loader0.18.20 remain visible. |
| Next Sharp0.35.5 | Existing Next15.5.28 explicitly allows ^0.34.3 or ^0.35.5 and handles both APIs | SVG decode/resize/PNG encode+decode via Next's actual require resolution succeeds. Miniflare's ^0.34.5 contract is preserved, so its old Sharp remains. No malicious image exploit was run. |

The project uses the vinext Node target rather than `next start`; current
vinext image handling passes local images through. Native image risk therefore
must be scoped to the actual decoder path, including future configured targets.
Sharp is still production-installed through Next and deserves an explicit
compatible update; that is distinct from asserting an exposed production
image-upload endpoint. No Images binding is configured in the supplied Sites
configuration source, and canonical hosting metadata is still absent.

Selected package licenses remain MIT/Apache-2.0; old/new packaged libvips both
declare LGPL-3.0-or-later. No new service terms were introduced. Both clean
installs used `npm ci --ignore-scripts --no-audit --no-fund` with the workspace
cache and registry.npmjs.org. Native optional platform packages worked without
running postinstall. Unrelated lockfile libc metadata removed by npm's metadata
refresh was restored; version changes are recorded in `lock-change-inventory.json`.
The extra native lock entries represent separate platform artifacts for the two
required Sharp versions, not a broad framework upgrade.

## Regression and final verification

The new dependency test initially produced5 failures/3 passes on the old
versions: absent default ws count limits, absent explicit fragment-count
rejection, and three SameSite substring cases. After updating, ws checks passed.
The new cookie test's initial expected representation (`Default`) was corrected
to the patched public API's omitted attribute; exact-object equality still
rejects the old unsafe None/Strict/Lax interpretations. This changed no existing
project assertion. Final targeted checks: **43/43**, then **45/45** including
native compatibility; typecheck and focused lint also passed for each batch.

Final checks on clean `cd1d8bdfa808395355bd66c3dd69e2286aecc84f`:

| Check | Result |
|---|---|
| Whole suite with real PostgreSQL + coverage | **1274/1274 PASS,126 files,0fail/0skip**,459.923s |
| Coverage | Lines/statements95.98%, functions99.36%, branches83.60%; unchanged overall and five-module thresholds pass |
| Typecheck / full lint | PASS |
| Node build / client scan | PASS;60 client files,0 issues |
| Sites build | FAIL with unchanged `SITES_HOSTING_CONFIG_REQUIRED`; no metadata fabricated |
| npm audit | FAIL;20 package aggregates,2critical/12high/6moderate;9 unique reported GHSA URLs |
| Post-install native/dependency checks |10/10 PASS after optional-package prune |

`npm ls --all` records four optional WASM support packages as extraneous
(@emnapi/core/runtime/wasi-threads and @tybys/wasm-util). They are present in the
cross-platform lockfile and referenced by optional wasm bindings. A bounded
`npm prune --offline --ignore-scripts --no-audit --no-fund` exited0 and removed
three other unused installation entries, but npm still lists those four;
subsequent `npm ls` exits0 with no invalid/missing peer errors. The cross-platform
lockfile was preserved byte-for-byte after npm's unrelated libc-field rewrite.
No package requirement was deleted to hide these labels. Ten native/dependency
checks passed after pruning. This diagnostic is retained in the evidence rather
than presented as a perfectly clean physical dependency tree.

Fresh benchmark on the clean final candidate:113 cases, compiler0/68
false-feasible and0/45 false-infeasible; all three service/race iterations have
zero duplicate/staleness/idempotency/race failures. Independent replay reproduced
57/57 fixed-rule mismatches. Offline extraction fixture4/4 is not a live-provider
claim. Existing request-only Playwright case passes1/1; it verifies actual JS/CSS,
traversal404, foreign Host421 and asset POST405, not browser hydration or UX.

Both task-owned PostgreSQL clusters are now stopped; ports55432/55632/4177 are
closed and no postmaster PID file remains. Database binaries/data are preserved.
No other container, workspace or unrelated process was changed.

No browser was launched. Ten existing browser cases remain unselected, not
passing or skipped results. The supported sandbox/browser limitation and missing
Sites metadata remain independent blockers. Prior45-table restore evidence at
`413c0e4` is preserved; this dependency-only batch does not claim a new restore
at `cd1d8bd`. All SQL and PG application source are unchanged, and fresh real-DB
regression results are recorded separately.

## Concrete remaining work requiring review

1. **Critical test-runner chain:** Tinypool1.1.1 is affected by two prototype-
   pollution gadgets; exploitation also requires a lower-trust pollution source
   in the same process. This source is not established by the static review.
   The separate mocker redirect-read advisory requires the mock-interceptor
   server path; current commands use `vitest run`, with no public UI/API server.
   Neither condition justifies silently clearing the gate.
   Registry metadata shows no fixed3.x Vitest/coverage/mocker or1.x Tinypool
   release. The bounded candidate is Vitest+coverage4.1.11, whose dependency
   graph no longer lists Tinypool and whose mocker is4.1.11. This is a major
   migration, **not installed**. Existing benchmark/bootstrap commands depend
   on transitive `vite-node`; retain it explicitly at reviewed3.2.7 or migrate
   those commands with tests. Revalidate serial pools, mocks, coverage semantics
   and unchanged thresholds before approval of that batch. Do not blindly
   override Tinypool1→2 under Vitest3's incompatible dependency contract.
2. **Cloudflare embedded copies:** the inspected registry archives for plugin
   1.64.0 + Wrangler4.151.0 contain ws8.21.0 and Undici7.29.1. They require
   Miniflare5.20261012.0-beta and Workers types^5.20261006.1, plus matching workerd.
   This introduces a major/prerelease toolchain transition, **not installed**.
   The earlier plugin1.47.0/Wrangler4.114.0 pair is not a complete substitute:
   its Miniflare still pins Sharp0.35.2 and Undici7.28.0, while requiring Workers
   types5. A coordinated reviewed migration must preserve worker bindings,
   check packaged native dependencies, re-evaluate overrides so they do not
   downgrade newer upstream pins, and use actual authorized Sites metadata for
   build validation. No fake hosting metadata or peer-force option is allowed.
3. **Braces and inherited build/lint chain:** registry latest is3.0.3 and all
   published versions remain in the supplied affected range. Need an upstream
   fixed release, a reviewed toolchain alternative, or an explicit current
   owner risk decision with a proven input boundary. Do not remove vinext/Next
   lint tooling, accept a blanket dev-only exclusion, or take npm's suggested
   Next/Drizzle downgrades merely to turn the audit green.
4. **Other esbuild paths:** preserve loader-only non-applicability evidence and
   the Windows-only precondition for Wrangler's0.27.3. A supported upstream
   loader/toolchain migration is separate work; no force override across0.x
   compatibility ranges was applied.

These review boundaries follow the user's instruction to report a specific
install-script/major-migration/new-terms requirement before proceeding. No
specific install script is currently necessary, and no action was denied by
an approval reviewer. Major migrations are pending review, not attempted.

Task29's gate list is unchanged: audit, browser journey, configured Sites build,
public TLS/identity/live integration/hosted-CI evidence as applicable, and final
42-ID same-candidate artifact binding still prevent a readiness claim. No final
video, push, merge, deploy, submission, production data or paid service was used.
