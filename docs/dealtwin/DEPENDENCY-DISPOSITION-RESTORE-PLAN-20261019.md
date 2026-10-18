# Dependency disposition and Windows restore preparation

Review baseline: `d85cb8d50cdf80b492eaefe293c4c55e582990cc`. This follow-up adds a read-only restore-planning utility; it changes no installed dependency, product path, database, credential or network/security setting. Prior 1328/1328 full-suite results remain at `17b5c75`, browser evidence retains its recorded `5376bf0` scope, and the measured 113-case benchmark remains at clean `d9ae617`. None is relabeled as a current-HEAD full-suite pass.

## Eight audit entries: one locally mitigated root, not eight separate demonstrated flaws

The last completed npm audit is `output/final-17b5c75/audit.json`. All eight high entries trace to **GHSA-vfj7-8cjw-p6xm**. There is exactly one locked installed braces copy, `node_modules/braces@3.0.3`, marked development-only. Its full maintained-patch byte check passed again: one copy, zero omitted copies, zero files changed. The installed version string remains 3.0.3, so version-based audit continues to flag it.

| Audit entry | Dependency path to root finding | Disposition |
|---|---|---|
| braces | advisory root | Identified recursion path locally patched and exact bytes verified; published-version finding still open |
| micromatch | braces | Inherited finding from that root |
| fast-glob | micromatch | Inherited finding; installed 3.3.1 and nested 3.3.3 copies share the same patched braces root |
| @next/eslint-plugin-next | fast-glob | Inherited finding |
| eslint-config-next | @next/eslint-plugin-next | Inherited finding |
| vite-plugin-dynamic-import | fast-glob | Inherited finding |
| vite-plugin-commonjs | vite-plugin-dynamic-import | Inherited finding |
| vinext | vite-plugin-commonjs | Inherited finding |

The patch bounds parser/recursive AST depth and rejects malformed/cyclic trees. Its compatibility boundary and excluded resource-exhaustion classes remain those in `patches/braces-3.0.3/README.md`. Exact patched bytes and prior bounded regression coverage support mitigation of the named recursion issue; they do not establish protection against every denial of service. There is no audit suppression, fake package-version bump, exception or risk acceptance.

Fresh primary-source reads at about 23:48–23:50 UTC on 18 October confirm:

- The [GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still lists no patched release; its API returns `first_patched_version: null`. The [official registry](https://registry.npmjs.org/braces/latest) still reports braces 3.0.3.
- The [latest Cloudflare Vite plugin](https://registry.npmjs.org/@cloudflare%2fvite-plugin/latest), 1.64.0, requires Miniflare `5.20261012.0-beta`; [Wrangler](https://registry.npmjs.org/wrangler/latest) 4.151.1 requires `5.20261012.1-beta`. These are not validated drop-in updates to the installed stable pair, and the manifests alone do not prove their embedded code fixed.
- [Stable Miniflare](https://registry.npmjs.org/miniflare/latest) 4.20260730.0 still declares Undici 7.28.0. The existing external override to 7.29.1 cannot replace compiled-in copies.
- [Next release tags](https://registry.npmjs.org/-/package/next/dist-tags) identify backport 15.5.28, already installed; latest is 16.4.2. A major framework migration is not a compatible minimal fix established by this review.

No newly available compatible dependency fix was justified. Raw receipts, including the initially unsuccessful registry URL and corrected endpoint, remain in `output/dependency-restore-review-20261018/`. No package archive was installed and no new npm audit was claimed.

## Embedded/runtime classification

| Copy/path | Current bounded classification |
|---|---|
| Maintained braces copy | Patched identified code, published-version finding remains |
| Cloudflare plugin / Wrangler embedded Undici 7.28.0 | Prior source comparison established unfixed branches. Not loaded by the reviewed private Node entry; tooling/public/Edge use remains separately unresolved |
| Three Next Edge compiled copies | Prior source comparison established unfixed branches. Not loaded by the reviewed private Node entry; do not infer all advisory-range matches are exploitable or all Edge exposure is safe |
| External Undici 7.29.1 | Previously verified fixed for the reviewed advisory set; does not substitute for embedded copies |
| Pinned local Node 24.22.0 | Previously verified native regression fixes; unchanged executable is enforced by the launcher. Does not establish CI runtime parity |
| CI Node 22.13.0 | Separate configured runtime; current Windows native-runtime evidence cannot be borrowed for it |

No unpatched affected path was established reachable through the reviewed private Node/PostgreSQL Judge flow. This is a scoped inference from source wiring, the completed browser flow, and import evidence, not a proof of absence from every dynamic path.

A fresh **import-only** probe used the actual verified Node artifact (`188c1a3d04093279712f62cd0bfd0c47f53fc0385d716f1ebee5a5c138a512a7`): **87 loaded modules, zero Cloudflare/Next Edge loads, zero connection/listen/fetch attempts, exit 0**. Its child process rejected those network/listener calls without altering system settings. It did not execute a new request journey or provider call. Five embedded file hashes remain identical to the reviewed copies. The result is `offline-import-probe.json`; source/data and byte receipts are retained beside it.

Smallest dependency next actions: retain the checked maintained patch and failing audit gate; replace it only with a supported fix plus equivalent bounded tests when one exists, or obtain a separate explicit time-bounded disposition. Reclassify and remediate embedded paths before enabling those tooling/public/Edge exposures. No unverified broad upgrade or generated-bundle edit is proposed.

## Windows restore planner: implemented preparation, no restore execution

`scripts/dealtwin/restore-plan.mjs` now provides `planWindowsRestore(workspace, runId, binaryDirectory)` and a dry-only CLI. It checks local workspace containment, rejects symlink/junction ancestry, requires the expected source major and existing PostgreSQL binary files, records binary hashes, and refuses any existing target, evidence directory or owner marker. It emits argument arrays and explicit pending checks. It imports no subprocess/network APIs and has no write/delete/cleanup capability.

Native unit tests use retained inert filesystem fixtures, never real PostgreSQL. Completed behavioral RED: **12 failed, 0 passed**, after the earlier sandbox spawn failure was separately recorded. GREEN: **12/12 passed**, zero failed/skipped, **203.733 ms**. Changed-file lint passed, exit 0. The initial spawn error is not RED evidence. Source/test hashes, exit receipts and logs are in `output/dependency-restore-review-20261018/verification.json`. The helper is not imported into the application; no full-suite repetition was performed.

Read-only invocation from this worktree:

```powershell
./scripts/dealtwin/run-local-node.ps1 scripts/dealtwin/restore-plan.mjs --run-id review-20261019-a
```

### Exact proposed target and ownership boundary

- Workspace: `C:\Users\Valen\Documents\ChatGPT\DealTwin\.worktrees\dealtwin-continuation-20261018`.
- Existing source, preserved: `.cache\pg-browser-20261018`, `127.0.0.1:55632/dealtwin_test`.
- **Proposed new target:** `C:\Users\Valen\Documents\ChatGPT\DealTwin\.worktrees\dealtwin-continuation-20261018\.cache\pg-restore-review-20261019-a`, PostgreSQL 15, `127.0.0.1:55432/dealtwin_test`.
- Proposed evidence directory: `output\restore-review-20261019-a`.
- Proposed ownership marker: `.cache\pg-restore-review-20261019-a.owner.json`, sibling to the data directory so initdb still receives an empty target.
- Current local execution account: `LENOVO-VT\Valen`. **Ownership is not established:** target, evidence directory and marker were all verified absent. There is no target process/PID and no authorization inferred from the port.
- Installed binaries: `C:\Program Files\PostgreSQL\15\bin`; exact file hashes appear in `proposed-restore.json`. Listener availability and version-command checks remain explicit pending preconditions, not silently assumed facts.

The new fixture has **not** been initialized or authorized for execution by this preparation request. The proposed operations, after explicit authorization and resource/identity checks, are: exclusively create and bind the new owner/evidence paths; generate synthetic target-only authentication without logging it; read/snapshot and `pg_dump` the existing synthetic source; `initdb` the absent target; start only that target on loopback 55432; create only its new `dealtwin_test`; prepare its roles/schema; restore with `--exit-on-error --single-transaction`; run the historical full row/catalog/RLS/payment/retry/proof comparisons adapted for Windows; gracefully stop the exact owned target. Preserve artifacts and failed fixtures. No automatic delete, existing-database overwrite, `--clean`, global process kill or service installation is included.

`proposed-restore.json` is deliberately an **incomplete execution description** until its pending conditions are satisfied. The target role/setup and verification phases still need Windows path/config adaptation and end-to-end validation against the authorized new fixture. Never execute the historical Linux `prepare-target` schema-drop phase against the existing source. Physical restore therefore remains NOT RUN, not a passed gate.

No push, deployment, paid API, Nebius/PayPal operation, credential configuration or security/network-settings change occurred. Task 29/DT-042 and external authorization gates remain open.
