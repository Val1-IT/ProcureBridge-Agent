# Task19 - material ERP invalidation

Local continuation on LENOVO-VT from `d6f6f043e16f0eccc0153ed7a38dc11f657c0924` in the existing isolated managed worktree. The latest direct human continuation was verified in its source thread; the earlier Task17 stop is superseded. Existing uncommitted Task19 files were continued, not discarded. No production, cloud execution, Arvanta change, push, merge or deployment.

## Delivered behavior

- Every existing PostgreSQL business save enters the common workspace-lock/single-client transaction. Current proof snapshot contexts are captured under the lock; before/after dependency hashes come from authoritative persisted ERP state, not just the proposed request payload. Invalidation and stale audits roll back with the business save. No second revision increment.
- `ProofInvalidationService.afterErpMutation` validates revision/hash metadata, rejects conflicting duplicate keys, ignores equal hashes, and permits self exemptions only for commitment-capacity keys. Reserve/commit/lifecycle capacity publication now passes through this service using the existing transaction-local repositories and exact identity primitive.
- Each proof is revalidated in its own stored as-of/horizon/adapter context. The primitive accepts optional internal proof-ID scope and filters tenant, current status and intersecting dependency keys in SQL. No caller/browser identity is trusted and no immutable proof JSON is rewritten.
- Material new/changed/cancelled invoices, dates, payments/cancellations, original/reversal cash evidence, supplier terms and confirmed inventory reservations stale impacted proofs. Unrelated product-label edits preserve valid proof status despite the revision advance. Fresh repository instances retain the mutable STALE status separately from genuine historical replay.
- Valid legacy ERP decimals can be unsupported by the exact-money adapter. Only in that case, both sides use versioned raw financial record/query fingerprints, with numbers encoded as strings and presentation metadata excluded. This is staleness evidence, not rounded compiler money or financial authorization. Source creation dates remain material because they can anchor PO due dates.
- Actual propose/approve stock-adjustment commands now round-trip through the pre-existing normalized table and least-privilege application role. No schema, grants or package changes. Other browser-only unsupported legacy aggregates remain fail-closed rather than being silently dropped.

## Actual evidence

Fresh resumed RED: focused application/PG command failed **20/22**, two passed,39.63s. Missing invalidation left material financial writes VALID and the injected stale-audit failure resolved rather than rolling back. A dedicated stock-command round-trip exposed the unsupported mapper; the inventory fixture setup failure is not counted as proof of hook behavior. Scoped primitive test incorrectly staled both proofs. A supplemental fractional-credit test first stopped at invalid seed-phone validation; after only fixing the synthetic phone input, saved0.5credit still left proofVALID (genuine behavioral RED,3.51s).

Initial GREEN: focused application/PG command **23/23 PASS**, zero skips,65.83s; typecheck PASS. An additional foreign-tenant preservation test was added afterward.

An environmental patch write failed and truncated the untracked PG test file. The newly started full run was deliberately stopped (exit1), not treated as evidence. All prior assertions were restored from captured source, with the tenant case retained. Retry succeeded. Cause of the write failure is unproven; disk free was below1GB. Only the owned disposable PostgreSQL cluster was cleanly restarted with max_wal_size256MB/min_wal_size80MB rather than4GB, leaving fsync/synchronous_commit on and SQL statement timeout5s unchanged. No files or external services were deleted.

Final full command: `npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot --reporter=json --outputFile=.cache/task19-full.json` with the verified loopback disposable test URL. **93files941testsPASS0skips307.20s**. Includes **140 actual PostgreSQL cases** and801 non-PG cases (including18 injected-client transaction tests), all Task16-18/payment/reset/schema/RLS regressions and24 Task19 cases. JSON report retains individual case results. Coverage gate PASS97.78% statements/lines,85.64% branches,99.21% functions; configured legacy modules only, not full DealTwin coverage.

`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` and `git diff --check`: PASS. Lint has no warnings. Existing vinext unknown-route classification notice remains; no deployment is claimed. Original checkout remains clean at `e69b60caa8d4aa108cebc199b4ce49a42f64b3b7`.

## Rulings and remaining boundaries

1. Optional internal proof scope prevents cross-context false staleness while preserving existing callers. Cost if wrong: more snapshot-context fixtures may be required.
2. Conservative raw fallback preserves legitimate legacy writes without making unsupported values financially eligible. Cost if wrong: extra dependency invalidation is possible; it cannot authorize reserve/commit.
3. Only the proven stock mapper gap is extended. Common hook covers every existing server save; PR/RFQ/supplier-call/result aggregates not previously supported server-side still fail closed and their browser path remains unchanged. Cost if wrong: future server migration of those flows requires explicit mapping work, not a broad rewrite here.
4. Existing reduced-document-item/source pruning limitation remains. Comparing persisted state prevents non-persisted removals being used as authoritative evidence. No DELETE grant or claim of pruning support.
5. This gate does not implement stress, solver, workflow UI, Judge E2E or sponsor adapters. Hosted CI/PG16/public release remain unrun. One fresh whole-branch independent review is retained for the end of the approved inline roadmap; no per-task implementation agents or review loop.

Next executable gate: Task20 named deterministic Stress Lab, then Task21 solver and Task22-24 durable workflow/three clean Judge runs. Continue locally rather than stop at this checkpoint.

Completed code SHA: `c53d409f709caae30fe114db386bc6af92bbc68c`. Completion-gate rerun at this SHA: the focused application/PG command passed24/24, zero skips,35.29s. Subsequent closure documentation does not change runtime/tests/schema.
