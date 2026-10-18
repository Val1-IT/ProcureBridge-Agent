# Maintained braces mitigation — local evidence, 2026-10-18

Implementation commit: **`6e9911bcc10383f1443c59f6d7735b25ad2098c9`** on
`local/dealtwin-continuation-20261018`, descended from imported cloud06f7505
through local browser/evidence commits. The original checkout remains clean at
`e69b60caa8d4aa108cebc199b4ce49a42f64b3b7`.

The owner approved maintaining a narrowly scoped braces backport. This revision
adds a project-owned depth/AST guard, a dependency-free hash-checked installer,
root postinstall/check commands, a CI verification step and bounded regression
tests. It does not change DealTwin financial logic or the dependency graph.
The lockfile's only semantic change is the root `hasInstallScript` flag.

## Patch and provenance

[Patch contract, maintenance and rollback](../../patches/braces-3.0.3/README.md)
and [manifest](../../patches/braces-3.0.3/manifest.json) identify the official
3.0.3 archive, locked SHA-512 integrity and original/patched SHA-256 values.
All nine source/license/package files matched the integrity-verified archive.
This is a local implementation for
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), not a
claim of an upstream patch. The advisory currently lists no fixed release.

The original parser checks the active stack before pushing a brace/parenthesis,
so depth65 fails before creating that container or entering recursive helpers.
The recursive entry points also validate direct ASTs iteratively, including
child/parent cycles and malformed/shared child nodes. Depth64 remains valid.
Quotes, escapes, bracket literals and range behavior remain upstream behavior.
The bounded implementation intentionally rejects deeper patterns/shared-node
ASTs and does not claim protection against all expansion/regex resource usage.

`npm ci` applies the reviewed hook; `--ignore-scripts` requires an explicit
`npm run deps:patch` before use. `npm run deps:patch -- --check` verifies exact
patched bytes. Unexpected source/version/integrity fails closed. Production
installs may explicitly omit absent dev-only copies; installed copies are
always patched. The original version remains3.0.3 so audit findings remain.

## Measured validation

Runtime: Windows, Node24.19.0, npm11.17.0. Work ran sequentially, with about
4314MiB free RAM before builds and a1536MiB Node heap cap for both targets.

| Check | Result and source scope |
| --- | --- |
| Bounded RED against original3.0.3 | 9 fail /4 pass in319ms; failures show absent depth rejection. Inputs are65/66 containers, not stack-exhaustion payloads. Cycle cases are gated behind the failed depth assertion and were not executed against the unsafe original. |
| Final focused suite at **clean6e9911b** | **31/31 pass,4 files,1.460s**, zero skipped/pending/todo; braces guard/installer plus existing dependency/native compatibility suites. |
| Normal-pattern differential corpus | 540 results agree with pristine3.0.3 across60 patterns,3 option sets and3 walkers; included in the31 tests. |
| Install mechanism | Original-byte fixture application, all-file hash verification, idempotence, unknown-byte refusal before writes, changed version/integrity rejection, nested copies, partial-patch recovery, tamper detection and explicit omitted-dev behavior pass. Root postinstall and installed `--check` pass. |
| Typecheck / changed-file ESLint | PASS on the completed implementation before commit. |
| Sites build / client scan | PASS;66 client files, zero issues. |
| Node Judge build / client scan | PASS;63 client files, zero issues. |
| Artifact preservation | All128 prior Node files restored with matching hashes. Existing `.openai/hosting.json` unchanged. New build artifacts retained separately. |
| npm audit | Expected exit1:16 affected-package aggregates,0 critical/12 high/4 moderate; five distinct advisory URLs remain. |

Builds ran at base`305c3daa6ab9b8c70bd408a4f8a106d52af25bce` plus the
implemented patch later committed as6e9911b, not at a clean6e9911b checkout.
Only newline formatting in root package/lock/CI files was normalized afterward
to satisfy `git diff --check`; the guard and installer were unchanged.
The explicit clean-commit focused run above is separate evidence. No claim is
made that the prior cloud1289/1289 suite or local11/11 browser run was repeated
on6e9911b. Full coverage, PostgreSQL and browser suites were not rerun for this
tooling-only patch. Existing vinext chunk/static-classification warnings remain.

Local ignored evidence:

- [Verification manifest](../../output/braces-backport-20261018/verification.json)
- [Committed test results](../../output/braces-backport-20261018/committed-results.json)
- [RED log](../../output/braces-backport-20261018/red.log)
- [Build preservation record](../../output/braces-backport-20261018/build-verification.json)
- [Fresh residual audit](../../output/braces-backport-20261018/npm-audit.json)

Initial installer path/import errors were corrected before final validation;
their logs are retained and do not count as passes. No external CI run is
claimed. Fresh-install behavior is established with isolated pristine fixtures
and the root hook, without another full dependency reinstall.

## Residual gates and rollback

Braces' identified recursion path is locally mitigated when this patch is
applied. The published advisory remains open and npm audit remains blocking.
Three Sharp advisories, old esbuild and embedded Undici findings are unchanged.
No audit suppression, exception or risk acceptance was added. A maintained
patch requires ongoing owner review and eventual replacement with an audited,
compatible upstream fix; hashes must never be refreshed blindly.

Rollback target is6e9911bcc10383f1443c59f6d7735b25ad2098c9: perform a reviewed
`git revert` in this continuation branch, then reinstall the reverted exact
lockfile to remove patched installed bytes. A revert alone leaves node_modules
patched. Reinstall restores the vulnerability and does not clear the release
gate. This is a documented procedure, not an executed rollback.

Task29/DT-042 remains PARTIAL. Remaining external gates include authorized
Nebius/Nemotron model/access/budget and live-provider evidence, real public
identity/TLS/Alexa evidence, and the final14-gate/42-requirement packet. Existing
Sites metadata now supports a local build; hosted ownership/deployment evidence
is not established by that build. No production access, provider call, new
credential, security-setting change, unrelated dependency backport, push,
merge, deployment, publication or final video occurred.
