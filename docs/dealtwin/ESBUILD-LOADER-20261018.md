# Narrow esbuild loader replacement — 2026-10-18

Implementation: **`7831e624b9cfa0380ce49fd90e199611e25bd82f`**, on
`local/dealtwin-continuation-20261018`, following the maintained braces commits.
This is an exact, scoped dependency replacement with an official fixed release,
not a rewrite of esbuild or a patch to embedded bundles.

## Applicability and scope

[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
affects esbuild through 0.24.2; the fixed release begins at 0.25.0. The issue is
the development server's permissive cross-origin responses. The installed
0.18.20 package was affected, but the reviewed core-utils module uses only
`version`, `transform` and `transformSync`. No server call was found in this
path. This work does not claim that the server exploit was reachable through
DealTwin, and did not start a server to reproduce it.

The exact dependency chain was DrizzleKit 0.31.10 -> esm-loader 2.6.5 ->
core-utils 3.3.2 -> esbuild 0.18.20. Drizzle's current CLI uses its bundled tsx
loader and its own esbuild 0.25.12; the legacy dependency is still installed.
Both paths therefore received focused compatibility checks.

The root override is deliberately limited to:

```json
"@esbuild-kit/core-utils@3.3.2": { "esbuild": "0.25.12" }
```

Only the scoped esbuild record and its 26 native platform records change in
the lock: four platform records are additions required by the official package.
All other dependency records are unchanged. Root/Vite/Wrangler esbuild remains
0.28.1, and Drizzle's own copy remains 0.25.12. Core-utils, esm-loader and
Drizzle's bundled code are byte-for-byte unchanged. The braces installer and
all its patched hashes remain valid. No override touches embedded Undici.

## Official provenance and compatibility boundary

Official npm tarballs were fetched and checked against their existing locked
SHA-512 integrity. Installed core-utils (5 files), esm-loader (4 files),
esbuild 0.25.12 (7 files) and Windows x64 native package (3 files) matched.
The replacement and the clean-install fixture were checked against those same
verified JavaScript/native bytes, not just version labels.

- [esbuild 0.25.12 archive](https://registry.npmjs.org/esbuild/-/esbuild-0.25.12.tgz): SHA-256 `227584145829e5c4782734b3fb7b91b49c6aa12876d6cf070e6a3d9d4de543f9`.
- [Windows x64 archive](https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.25.12.tgz): SHA-256 `c77076b48f96323cae6257bd515e5ea96ecf38ab8f7fa34364d4fc4ae5905b74`.
- Current lock SHA-256: `c7db7153b10815a067aaa1e7e3c327b2d45274fd90d3355dbe84d22208ebb7cc`.

Upstream [0.25.0 release notes](https://github.com/evanw/esbuild/releases/tag/v0.25.0)
describe incompatible changes, including the server return shape and watch
behavior. Those APIs are outside the reviewed loader contract. Compatibility
is established for the exercised transform/loader/schema behavior, not every
esbuild API or arbitrary source program. The deprecated esbuild-kit packages
remain present; this does not migrate the framework or claim they are maintained
upstream. The project owner maintains this override until a supported parent
upgrade removes the need for it.

## Measured verification

Windows, Node 24.19.0 and npm 11.17.0; sequential execution, about 4663 MiB
available RAM before work. Regression subprocesses cap the Node heap at 512 MiB.

| Check | Result |
| --- | --- |
| Bounded RED, original installed 0.18.20 | One resolution assertion failed; three behavioral cases passed. Initial fixture path/syntax setup failures are preserved separately. |
| A/B transform comparison | 18 sync/async outcomes across 9 cases match between 0.18.20 and 0.25.12: types/enums, type-only imports/generics, exact bigint arithmetic, private/static fields and names, optional/nullish operations, JSX, legacy decorators, both class-field modes. Source maps validate and malformed syntax is rejected in both versions. |
| Real esm-loader | TypeScript `.js`-to-`.ts` resolution, dynamic TS import and legacy JSON import execute successfully; output matches baseline. Existing Node experimental-loader warning remains. |
| Drizzle CLI generation | Two synthetic PostgreSQL tables, bigint column and foreign key generate without a database. SQL and normalized snapshot match baseline exactly; second generation reports no changes and leaves SQL unchanged. Existing project schemas/migrations were not changed. |
| Fresh isolated installation | `npm ci --offline --ignore-scripts` from the exact projected loader lock installs 9 platform-selected packages; native/JS hashes and all 18 transform outcomes pass. This is a small dependency-closure fixture, not a full-project reinstall. |
| Final focused suite at clean **7831e62** | **35/35 pass, 5 files**, including the 31 existing braces/dependency/native cases. Exact timing and hashes are in the verification manifest. |
| Typecheck / changed-file ESLint | PASS on the implementation. |
| Braces installed-byte check | PASS, one copy, no changes required. |
| Fresh npm audit | 16 -> **12 affected-package aggregates**: 0 critical, 12 high, 0 moderate. esbuild advisory removed; four advisory URLs remain. Audit still exits1 and blocks release. |

The first incremental npm install reported 0.25.12 in its hidden metadata while
actual package files remained 0.18.20. The runtime resolution test caught this.
The old scoped directory was preserved under ignored output, then npm restored
the two exact packages from its existing cache. No cache was deleted. Both
actual file hashes and a separate clean installation verified the correction.
Earlier failure logs are retained and are not counted as passes.

[Verification manifest](../../output/esbuild-loader-20261018/verification.json),
[clean-commit tests](../../output/esbuild-loader-20261018/committed-results.json),
[official archive/file provenance](../../output/esbuild-loader-20261018/official-provenance.json),
[lock delta](../../output/esbuild-loader-20261018/lock-delta.json), and
[audit](../../output/esbuild-loader-20261018/npm-audit.json) are local ignored
evidence. No full suite, coverage, browser, application build or external CI run
is claimed for this commit. Prior build/browser/cloud results retain their
original SHA scopes.

## Maintenance, rollback and residual gates

Normal clean installs reproduce the exact override via package.json and lock
integrities. Existing installations must verify actual runtime resolution;
`npm ls` alone was insufficient in this session. Run the focused compatibility
test and `npm run deps:patch -- --check` after installing. Parent/loader/esbuild
upgrades require reviewing call sites, upstream changes and these regressions.
Remove this override only after the parent supplies a verified fixed path.

Rollback target: `7831e624b9cfa0380ce49fd90e199611e25bd82f`. A reviewed revert
followed by reinstalling that reverted exact lock restores 0.18.20 and its
advisory; a git revert alone does not change installed package bytes. This
rollback preserves the earlier braces commit and its postinstall hook. It is a
documented procedure, not an executed rollback.

The remaining npm advisories are braces (locally mitigated, still flagged) and
three Sharp findings. Embedded Undici findings are unchanged. No suppression,
waiver or risk acceptance was added. Task29/DT-042 remains PARTIAL, with those
dependency findings, authorized Nebius/Nemotron model/access/budget and live
provider evidence, real public identity/TLS/Alexa evidence, and the final
14-gate/42-requirement packet still open. No new service, production access,
security setting, credential, paid call, source push, deployment or video.
