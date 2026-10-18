# Maintained braces 3.0.3 nesting mitigation, revision 1

This project-owned patch mitigates [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory lists versions through 3.0.3 as affected and no patched release. This is a local implementation of depth guards, **not an upstream fix or a version-scanner clearance**.

## Provenance and installation

- Upstream: [micromatch/braces, tag 3.0.3](https://github.com/micromatch/braces/tree/3.0.3), MIT; original license retained here and in the installed package.
- Source archive: `https://registry.npmjs.org/braces/-/braces-3.0.3.tgz`; SHA-512 integrity is pinned in `manifest.json` and `package-lock.json`. The archive was downloaded from that official URL, verified against the lock integrity, and its nine source/license/package files compared byte-for-byte with the installed package before patch creation.
- Archive SHA-256: `1cd18e862c8640b4568b1425a7df4ee030ff201d45b2da8f9f222d2987494ffc`.
- `manifest.json` records original/patched SHA-256 values and exact one-occurrence edits. No original package version or audit metadata is rewritten. The dependency graph and archive pins are unchanged.
- `npm ci` runs the reviewed root `postinstall` hook. For installations using `--ignore-scripts`, run `npm run deps:patch` explicitly **before** tooling or tests. Run `npm run deps:patch -- --check` to verify; CI does so after install. No new patching dependency, network request or third-party script is invoked by this hook.
- Every locked installed braces copy is preflighted before writes. Unexpected package versions, integrity, paths or source bytes stop installation for review. Explicit production/omit-dev installs can omit an absent dev-only copy; installed copies are still checked/patched. Results report installed and omitted counts separately.
- Re-running is idempotent. File replacements are individually atomic; the whole batch is not transactional. After interruption, rerun the hook and check before using dependencies. Known original/patched mixtures are recoverable; unknown bytes require inspection. Failed temporary files are retained for inspection.
- `.gitattributes` fixes the guard payload to LF so its hash is stable across Windows and Linux checkouts.

## Behavior and limits

The existing parser's lexical handling is retained. Before allocating/pushing a brace or parenthesis container, `assertDepth(stack.length)` rejects a 65th active container. Both kinds count together; unmatched nesting counts until the parser closes it. Thus recursive parser helpers never receive an over-limit tree. Escaped delimiters, quotes and bracket contents keep their existing literal handling, without a second divergent tokenizer.

Before `compile`, `expand` or `stringify` recursively walks an AST, an iterative guard checks container depth (64, excluding the outer root), child-tree identities, node/children shapes and parent chains. Child cycles, repeated child objects and parent cycles are rejected. Normal parser `parent` and `prev` backlinks are preserved; `prev` is not traversed. Direct library entry points receive the same guards. Depth violations throw `SyntaxError` with `ERR_BRACES_DEPTH`; malformed/cyclic ASTs throw `TypeError` with `ERR_BRACES_AST`.

Compatibility boundary: caller-created ASTs must be trees with unique child identities. Deliberately deeper patterns and shared-node DAGs are now rejected. The validator is for ordinary data objects, not hostile JavaScript proxies/getters. It does not promise a bound on expansion cardinality, all regex processing, arbitrary private utility calls, or every possible denial of service. Existing range limits remain unchanged. Callers accepting untrusted patterns should handle controlled errors.

## Maintenance and rollback

The repository owner now maintains this patch. Every braces/consumer update requires reviewing upstream advisory status, source hashes, parser/walker semantics, both regression files, and actual build consumers. Do not refresh hashes blindly. Replace it with a supported fixed release once available and independently verified; remove the hook/manifest only after equivalent security behavior passes. Broader dependency advisories remain release blockers.

Tests: `tests/dealtwin/security/braces-depth.test.ts` and `braces-patch-install.test.ts`, plus the dependency/native compatibility cases. The normal-pattern differential corpus compares 540 compile/expand/stringify results with integrity-verified original bytes. Bounded RED demonstrated absent guards at depth 65 without intentionally exhausting stack/RAM; cycle cases only execute after that guard assertion succeeds.

Rollback is a reviewed revert of the commit introducing this directory, root lifecycle/CI changes and tests, followed by an exact-lock reinstall in the selected worktree. A revert alone does not unpatch existing `node_modules`. Reinstalling unpatched 3.0.3 reintroduces the vulnerability and leaves the audit/release gate blocked. Never reset/discard other work or automatically downgrade dependencies. The exact commit and validation artifacts are recorded in the task completion report and `docs/dealtwin/BRACES-BACKPORT-20261018.md`.
