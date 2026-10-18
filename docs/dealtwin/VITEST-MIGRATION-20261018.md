# Reviewed Vitest migration candidate

Continuation of the approved test-toolchain batch from clean checkpoint
`4e78d748c1346cfb301146d1830dceafab1b1e17`. The existing branch/history is retained.
This batch pins Vitest and @vitest/coverage-v8 to4.1.11 together and makes the
already-used vite-node3.2.4 an explicit dev dependency. It does not migrate the
Cloudflare/Workers/Miniflare toolchain or change product behavior.

The resolved upstream runner no longer depends on Tinypool; @vitest/mocker is
4.1.11. Vitest uses root Vite8.0.16 while vite-node retains compatible nested
Vite7.3.7. There is no forced peer resolution or advisory exclusion. Review the
complete final graph/audit before interpreting this as security closure.

The new upstream testing graph includes Chai6.3.0, ast-v8-to-istanbul1.0.7,
magicast0.5.5 and the associated runner utilities. All changed/new installed
packages declare MIT. tinyexec declares a prepare script; it was not executed.
Installation used npm ci --ignore-scripts --no-audit --no-fund with the writable
workspace cache and existing registry.npmjs.org allowlist. No lifecycle script
or native rebuild was needed. Twenty-four unchanged platform libc metadata
entries were preserved after npm's unrelated metadata rewrite.

All126 existing test files remain byte-identical. vitest.config.ts is unchanged:
Node environment, fileParallelism:false, the existing include/exclude scope,
coverage reporters, global thresholds and five DealTwin module thresholds remain.
No source product file, SQL, browser sandbox, Sites metadata, credential,
release-gate ID or42-ID requirement mapping changed.

Before freezing this candidate, focused regression passed190/190 in30 files:
UI/module mocks, timers, env-stubbed authenticated API/MCP, dependency/native
boundaries and the actual benchmark CLI/replay. Typecheck passed. This focused
run had uncommitted package changes and is not represented as final-SHA evidence.
The new default forks/serial-file behavior and coverage instrumentation must also
pass the unchanged full real-PostgreSQL suite and thresholds.

Full tests/coverage, quality checks, Node Judge build, audit and source hashes
are recorded after this commit in the companion verification report/evidence in
the existing DealTwin-cloud-gates-20261018.zip Library item
`libfile_e64507e9df88819182035b655edf18a3`. Keeping that final evidence outside the
tested Git tree avoids adding an untested documentation HEAD afterward. This
preparation note does not assert those later checks passed.

Rollback is a new revert commit of this isolated batch followed by scripts-disabled
npm ci against its restored lockfile; preserve logs and history. No database
rollback or deletion is required. Existing Cloudflare embedded-copy/Sharp,
braces and old esbuild findings retain their documented reachability limits.
Task29 remains PARTIAL; browser, Sites and required external/public evidence
cannot be replaced by unit tests. See DEPENDENCY-REVIEW-PLAN-20261018.md for the
unchanged migration boundaries and all14 base gate classifications.
