# Task22 — server-authoritative Deal workflow APIs

Local LENOVO-VT, 2026-10-07 (Asia/Yerevan), isolated worktree continuation from `1ffecf244d5e94bfa6fd6ad6d6525dd69e812feb`. Original checkout remains clean at `e69b60c`. No production, cloud executor, push, merge, deployment, real money, grants or schema migration changes.

## Actual verification

- Final frozen-source full suite: **99 files / 1010 tests PASS, zero skips, 310.08s**. Includes 175 real PostgreSQL cases and 835 non-PostgreSQL cases (18 client-fake cases included). Finance/sales, payment/reversal/reset, RLS, repositories, lifecycle/races, Task16/21 allocation and legacy proof hashes/replay remain green.
- Task22 final focus: **23/23 PASS, 43.42s**. Registered exported route handlers receive real Request/Response objects, signed sessions, strict parsers and actual app-role PostgreSQL persistence. These are not network-socket/browser E2Es; Task24 owns that evidence.
- Expanded new API plus Task16/21 and proof regression focus: 73/73 PASS,167.92s before the final four additional boundary cases; no separate full-readiness claim is based on that intermediate result.
- Typecheck, lint (zero warnings), five-stage vinext local build, and diff-check PASS on frozen final code. Existing static-route classification notice is not a deployment. Coverage PASS:97.78% statements/lines,85.64% branches,99.21% functions; configured legacy include list, not all DealTwin code coverage.
- Code commit: `857ef26df737d4a03f45275d070bc5ee6f44b29a`. Completion script on that committed source: **23/23 PASS,50.94s**, Task22 complete. Local ignored artifacts: `.cache/task22-final-full.json`, `.cache/task22-final-focused.json`, `.cache/task22-focused-with-legacy.json`.

## Implemented behavior

Thin create/read/edit/compile/proof/replay/stress/recompile/confirmation/approval/allowlisted-AP/atomic-replacement routes derive tenant, actor and role only from the signed server session. Origin, content type, streamed byte cap, nested strict JSON shape, exact money strings, target/version identities and revision/key contracts are validated. No route executes SQL or financial arithmetic. Invalid body identity/role/AI authority, foreign ERP references, stale revision/version, unknown targets and unsupported stress fail without business writes.

The workflow port uses one PostgreSQL client/transaction, workspace lock first, actual least-privilege app role, immutable receipt before revision or current aggregate lookup. Successful graph mutation persists all version/constraint/snapshot/run/proof/approval data and adopts one revision before one immutable receipt; unexpected failure rolls everything back. ERP AP saves adopt the domain revision, never double bump. Approval uses the existing service/transaction adapter with the same actual-role guard, not owner/reset credentials.

Immutable confirmation clones a new version only after all material constraint IDs match; partial/unknown confirmation is denied. Structured edits preserve old versions and validate ERP references. A real20% compile returns the exact Rp3m shortfall on2026-09-22; real bounded recompile persists the25%/Rp5m version and v2 named-stress proof. A fresh runtime/repository reads persisted records. Replay executes the historical compiler and records current status separately without rewriting the proof; retry replays its original response without another revision.

Named stress runs execute over the immutable historical proof input, explicitly labeled `historical_proof`, never current allocation authority. Scenario/input/result hashes and parent proof/run linkage are persisted; different scenarios have different hashes. Optional diagnostics cannot define required eligibility. Invalid/duplicate/missing receipt targets fail before writes; no stress operation creates cash movements or liquidity rows.

After the allowlisted AP changes18m→19m, invoice, matched PO and GR unit totals/source chain remain valid; existing bank/cash/SO data is preserved and Task19 invalidation stales the old proof. Still-reserved recompile keeps old capacity occupied until the signed atomic replacement route uses Task21; its original receipt survives Judge reset. Committed recompile persists a separate27%/Rp5.2m proposed version/proof while retaining old operational current version, commitment and single SO. Second COMMIT remains denied.

A supplier-timing test with profitable58.5m direct cost and6-day customer balance forces the locked supplier10-day winner under required+3 stress and deposit cap40%. Its two requirements have distinct immutable approval bindings. Conditional RESERVE is allowed over fixed terms; one approval cannot authorize COMMIT. Both live approvals permit one SO/revision. Legacy kind-only snapshots with multiple required codes remain `UNSUPPORTED_APPROVAL_BINDING`, with unchanged historical hashes.

No feasible candidate produces a persisted no-solution run, not an invented proof/cash movement. An out-of-policy draft gets a stable422 validation reason, not a503 database-unavailable label or partial evidence. Failure injected after version, proof or receipt persistence returns a scrubbed503 and leaves the entire prior graph/revision intact.

## TDD record

1. Original11/11 behavioral RED20.15s reached501 after real PG setup. Minimal handler scaffolds were not implementation.
2. Actual owner-role approval adapter incorrectly succeeded (RED3.93s); same-client app-role guard GREEN4.36s. No role/grant permissions were relaxed.
3. Initial integration503 was a test configuration error: missing mandatory DATABASE_SSL_MODE. Only disposable-loopback fixture configuration was corrected, preserving production SSL rules. Initial12/12 GREEN37.16s.
4. Stress/replacement route2/2 RED7.95s reached501 after genuine workflow state. Expanded10/10 GREEN50.30s.
5. Supplier binding fixture initially had a wrong39.6m oracle: actual16Sep acceptance and20Sep AR make21% deposit win. Corrected only fixture to58.5m, preserving40% cap and arithmetic. Genuine RED then exposed duplicate business requirements stored as the same kind-only DB key. Exact code binding GREEN4.05s, legacy negative cases retained.
6. Edit accepted an unknown product (RED1failure/1existing-boundary-pass22.98s); minimal same-client ERP reference validation fixed it.
7. Real no-solution case already passed. Known out-of-policy draft wrongly returned503 (RED1failure/1pass6.00s); mapping only the known pure policy exception to422 fixed it. Unexpected failures still rollback.

## Rulings and retained boundaries

1. Reuse the existing canonical proof decoders, with strict nested request validation separately, rather than duplicate financial parsing. Cost if wrong: a later shared DTO extraction may be needed.
2. Committed remediation does not adopt the operational current-version pointer; its new version/proof is a separate durable proposal. Uncommitted remediation adopts the new version but retains old occupied capacity until replacement. Cost if wrong: UI must distinguish proposal from operational current terms.
3. Stress API is historical diagnostics, explicitly separate from current status/allocation policy. Cost if wrong: UI must not label historical stress as current-state authorization.
4. New approval DTOs optionally hash/replay `requirementCode`; existing DB column stores the actual business code and kind is resolved from the exact immutable approval snapshot. Legacy fields/bytes remain unchanged and ambiguous legacy multi-code data remains fail-closed. Cost if wrong: consumers must tolerate the optional binding field; legacy ambiguity is not auto-upgraded.

No SQL migration or broad ERP rewrite. Known ERP document item/source-array reduction mapper limitation is retained. UI, actual browser E2Es, three clean Judge runs, hosted CI/PG16, providers, publishing/submissions and production remain separate unverified gates. Synced `sources/` and locked product/traceability/plan were not edited. Final independent whole-branch review remains at the roadmap end, not a new per-task review loop.
