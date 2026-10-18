# Scoped Miniflare Sharp replacement — 2026-10-18

Implementation commit: **`9400db028e3e2124dc391446d53392175e60d3f8`**, on
`local/dealtwin-continuation-20261018`. Earlier braces/esbuild commits remain
intact. The original checkout stays clean at e69b60c.

The installed Miniflare is **4.20260702.0**, originally resolving Sharp
**0.34.5**. The earlier 0.35.2 reference described a newer Miniflare release
reviewed in registry metadata, not the installed dependency. This change keeps
the installed framework version and adds only:

```json
"miniflare@4.20260702.0": { "sharp": "0.35.5" }
```

## Security and compatibility decision

Three published Sharp findings cover the old dependency:

- [libvips — GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), fixed from 0.35.0.
- [libheif — GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), fixed from 0.35.4.
- [librsvg — GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), fixed from 0.35.5.

Miniflare's local Images and cf.image handlers dynamically import Sharp and
call metadata, resize, rotate, format encoders, buffers and stream responses.
Those exact local handlers passed after the replacement. No exploit payload,
untrusted remote image, production binding or paid Images API was used.

The [0.35.0 changelog](https://sharp.pixelplumbing.com/changelog/v0.35.0/)
documents incompatible changes. Node >=20.9 is supported by the project's
Node >=22.13 requirement. Official Windows x64 prebuilt binaries work without
rebuilding or install scripts. The reviewed handlers do not use removed
deprecated constructor/metadata/sharpen properties. AVIF quality tuning changed;
the contract checks dimensions, format and bounded color behavior, not identical
lossy output bytes. Invalid resize error text now includes the coordinate limit.
Tests were run on Windows/Node24.19.0, not on Linux or every supported platform.

This is a scoped official-package upgrade with maintained compatibility evidence,
not a source backport, framework migration or claim of universal API equivalence.

## Provenance and installation

Both official archives matched the SHA-512 integrity already pinned by the
existing Next Sharp dependency, and all installed files were compared:

- [Sharp 0.35.5 archive](https://registry.npmjs.org/sharp/-/sharp-0.35.5.tgz): 47 files; SHA-256 `3b6bbbe6b308f5c383938ca4a31926cd5d79c4651ed8c5fda16a97da2014a9ac`.
- [Windows x64 native archive](https://registry.npmjs.org/@img/sharp-win32-x64/-/sharp-win32-x64-0.35.5.tgz): 8 files; SHA-256 `16a804181ddd258ca6fe7079b2faa0c0356654c9db3d93ab0a80ec5e5161c3d4`.
- Final lock SHA-256: `57ff2662a534dad8d712bb35271bbb9d20d0141f51c195211185bcf084a68228`.

Actual Miniflare resolution reports Sharp0.35.5, libvips8.18.7, libheif1.23.5
and librsvg2.63.2. Next now shares the same fixed package. Exactly51 lock records
change semantically: Sharp/native replacement, duplicate removal, and unchanged
semver7.8.5 placement/metadata. Other dependency records are unchanged. One
retained PostCSS record has newline-only normalization for diff checking.
Miniflare, Vite-plugin and Wrangler bundle hashes are unchanged, including their
embedded Undici. The esbuild override and braces installed-byte check pass.

Lock resolution ran in an isolated prefix, leaving live npm metadata unchanged.
The reviewed lock was applied from the existing official-package cache with
scripts disabled:2 packages changed and3 duplicate packages removed. The old
Sharp/native files were preserved under ignored output. Real file hashes and
runtime versions were verified after install. No source/native rebuild or
untrusted package was needed. Clean installs use the exact override and lock;
the root postinstall still applies braces, or explicitly run `npm run deps:patch`
when installing with `--ignore-scripts`. No full-project reinstall was performed.

## Measured evidence

| Check | Result |
| --- | --- |
| Original bounded baseline | 11 normal cases pass; fixed-version assertion and new upstream validation-message checks fail as expected. |
| Clean-commit focused suite at **9400db0** | **48/48 pass,7 files**, zero skipped/failed; includes prior braces/esbuild regressions and real disposable D1/R2 round trips. Timing/hashes are recorded in the manifest. |
| Selected official upstream tests | **10/10 pass**, run in a child process against Miniflare's actual resolved package. Test bodies unchanged; only harness/import selection adapted. Apache2 license retained. |
| Decoder inputs | Six generated8x6 images: PNG/JPEG/WebP/GIF/AVIF/TIFF, plus a small inline SVG. Every encoded input is under16KiB. Resize/color, malformed-input rejection and a47-pixel input limit are checked with48-pixel input. No exhaustion payloads. |
| Actual Images/cf.image handlers | Metadata, PNG/JPEG/WebP/AVIF streamed outputs, rotate/resize/DPR, JSON metadata and unsupported GIF behavior pass. SVG cf.image behavior remains original-byte passthrough with200, not an exposed internal422. |
| Normal behavior comparison | All12 normalized decoder/binding/cf.image records match the old version; synthetic input hashes are unchanged. |
| Typecheck / changed-file lint | PASS. The test uses Sharp's new default-export type; no product code needed changes. |
| Sites build / client scan | PASS;66 client files, zero findings. All128 prior Node output files restored with matching hashes; hosting metadata unchanged. |
| npm audit | **12 ->8 affected-package aggregates**, all high;0 critical/moderate. All three Sharp advisory URLs disappear. Remaining npm URL is braces; audit still exits1. |

Upstream source:
[`sharp/v0.35.5/test/unit/resize.js`](https://raw.githubusercontent.com/lovell/sharp/v0.35.5/test/unit/resize.js),
SHA-256 `ee135f278e421dc840db818d6fb1f466cfb006b8186f5b9672aae8b77a43d343`.
The selected cases use no external fixture; their largest synthetic output is
50x50. They cover invalid dimensions and minimum-edge/contain behavior.
The full upstream suite was not run.

Initial A/B setup attempted to load old/new libvips DLL families together and
hit a Windows procedure-resolution error. Inputs are now generated in a
separate process using the fixed Next package, while each comparison process
loads one family. The final installed dependency graph has one fixed version.
The initial failure and upstream old-version wording failures remain in logs.
All image-origin fetches use a mock with network connections disabled; the local
Miniflare runtimes are disposed after testing. No global service was installed.

Sites build ran on base136e00a plus the replacement later committed as9400db0,
not a clean9400db0 build. Subsequent changes were test-harness/type corrections
and lock newline formatting. The separate clean-commit test run is identified
above. No full coverage, whole-suite, browser, Node build, deployment or external
CI run is claimed for this commit. Prior results retain their original scopes.

Local ignored evidence: [manifest](../../output/sharp-miniflare-20261018/verification.json),
[committed results](../../output/sharp-miniflare-20261018/committed-results.json),
[upstream log](../../output/sharp-miniflare-20261018/upstream-tests.log),
[official archive/file hashes](../../output/sharp-miniflare-20261018/official-provenance.json),
[build preservation](../../output/sharp-miniflare-20261018/build-verification.json),
and [audit](../../output/sharp-miniflare-20261018/npm-audit.json).

## Maintenance and rollback

Review Miniflare/Sharp/native upgrades against the actual image handlers, bounded
tests, upstream changes and supported runtime platforms. Keep exact pins until
a supported parent supplies a fixed version and equivalent behavior is measured.
This override is not permission for future unrelated dependency migrations.

Rollback target is `9400db028e3e2124dc391446d53392175e60d3f8`: reviewed revert,
then reinstall the reverted exact lock. Revert alone does not change installed
native bytes. This restores the old Sharp findings while preserving earlier
braces/esbuild fixes. The procedure is documented, not executed.

Task29/DT-042 remains PARTIAL. Braces is locally mitigated but still flagged by
version; embedded Undici findings remain unchanged. Live-provider model/access/
budget authorization, real public identity/TLS/Alexa evidence and the final
14-gate/42-requirement packet remain open. No audit suppression, waiver, security
setting change, new credential, paid call, source push, deployment or video.
