# DealTwin Requirement Traceability

Status: implementation contract
Baseline: `1b3f75905f39c75cc6c7e06b23a3f553e6b136fe`
Plan: `docs/superpowers/plans/2026-09-11-dealtwin-proof-carrying-commerce.md`

This matrix is bidirectional: every listed requirement must have implementation and evidence, and every DealTwin implementation task must serve a listed requirement. All implementation and test paths below are planned, not already implemented. Test names are the planned authoritative suites; they must exercise behavior rather than source-string presence unless the contract being tested is itself a file/schema contract.

| ID | Task | Locked requirement | Module / service | Persistent entity | Automated evidence | Judge / competition evidence |
|---|---|---|---|---|---|---|
| DT-001 | 2, 22 | Product remains a pre-commit financial compiler | `lib/dealtwin/domain/deal.ts` | `dealtwin_deals`, `dealtwin_deal_versions` | `tests/dealtwin/domain/deal-lifecycle.test.ts`: rejects direct Draft-to-Commit and Sales Order aliasing | Deal Inbox shows Draft before any ERP Sales Order exists; product coherence |
| DT-002 | 2, 24 | Lifecycle is DRAFT -> COMPILE -> PROOF -> RESERVE -> COMMIT -> STALE -> RECOMPILE | `lib/dealtwin/domain/state-machine.ts` | deal/proof/commitment status columns | `tests/dealtwin/domain/deal-lifecycle.test.ts`: transition table tests cover every allowed and forbidden edge | Judge guide advances only on authoritative lifecycle state |
| DT-003 | 1, 2 | Authoritative IDR arithmetic is exact | `lib/dealtwin/domain/money.ts` | all `*_rupiah bigint`; canonical JSON decimal strings | `tests/dealtwin/domain/money.test.ts`: boundary, rounding, overflow, JSON round-trip tests | displayed values reconcile exactly to proof payload; correctness |
| DT-004 | 1 | Rates are fixed point | `lib/dealtwin/domain/rate.ts` | basis-point integers in terms/constraints JSON | `tests/dealtwin/domain/money.test.ts`: inflow-floor and outflow-ceiling multiplication tests | 40% appears as 4,000 bps in proof evidence |
| DT-005 | 3, 7 | Same-day order is deterministic and conservative | `lib/dealtwin/domain/cash-event.ts` | `same_day_order`, ordering provenance in snapshot/proof JSON | `tests/dealtwin/domain/cash-event-order.test.ts`: permutation, stable-ID tie-break, conservative-order tests | compiler explains which same-day ordering caused failure |
| DT-006 | 3, 8 | Unknown material order is never silently favorable | `lib/dealtwin/domain/cash-event.ts` | unresolved assumption in compile/proof payload | `tests/dealtwin/domain/cash-event-order.test.ts`: unresolved material order returns UNRESOLVED_SAME_DAY_ORDER | UI requests resolution instead of showing COMPILES |
| DT-007 | 5, 7 | Confirmed and expected cash remain distinct | `lib/dealtwin/erp/normalize-cash.ts` | event certainty in snapshot/proof JSON | `tests/dealtwin/erp/financial-normalization.test.ts`: quote/invoice/acceptance are not confirmed receipt tests | proof labels confirmed minimum separately from projected minimum |
| DT-008 | 4, 13 | One authoritative active IDR cash account | `lib/erp/commands/cash.ts` | `erp_cash_accounts` | `tests/dealtwin/erp/cash-foundation.test.ts` and `tests/dealtwin/postgres/schema.test.ts`: domain account invariant plus actual partial-unique-index denial | ERP Sandbox shows opening balance and active account provenance |
| DT-009 | 4, 13 | Dated cash movements have explicit provenance | `lib/erp/commands/cash.ts` | `erp_cash_movements` | `tests/dealtwin/erp/cash-foundation.test.ts`: original unchanged, opposite reversal, one reversal only, no reversal-of-reversal, opening-date entries included | source links visible for posted supplier/customer payments |
| DT-010 | 5 | ERP snapshot normalizes AP without lifecycle triple count | `lib/dealtwin/erp/normalize-payables.ts` | `dealtwin_erp_snapshots` | `tests/dealtwin/erp/financial-normalization.test.ts`: PO/receipt/invoice/payment chain matrix tests | source-of-truth view shows one remaining obligation |
| DT-011 | 5 | ERP snapshot normalizes AR and posted receipts once | `lib/dealtwin/erp/normalize-receivables.ts` | snapshot | `tests/dealtwin/erp/financial-normalization.test.ts`: invoice/partial-payment/paid/cancelled matrix tests | projected customer balance matches receivable evidence |
| DT-012 | 6 | On-hand inventory is not an invented cash outflow | `lib/dealtwin/erp/normalize-inventory.ts` | snapshot dependency manifest | `tests/dealtwin/erp/inventory-normalization.test.ts`: stock-on-hand and reserved-stock tests | proof separates inventory availability from new procurement cash |
| DT-013 | 6 | Existing reservations reduce inventory availability | `lib/dealtwin/erp/normalize-inventory.ts` | snapshot | `tests/dealtwin/erp/inventory-normalization.test.ts`: confirmed Sales Order reservation tests, including warehouse key | competing inventory demand appears as a dependency/failure |
| DT-014 | 8 | Horizon cannot hide relevant obligations | `lib/dealtwin/compiler/horizon.ts` | snapshot horizon fields | `tests/dealtwin/compiler/horizon.test.ts`: 31st-day relevant AP expands horizon; irrelevant data does not | proof displays effective horizon and expansion reason |
| DT-015 | 22, 25 | Natural language becomes structured candidate constraints | `lib/dealtwin/ai/constraint-extractor.ts` | `dealtwin_constraints.source_text`, immutable version/receipt | `tests/dealtwin/ai/constraint-extractor.test.ts` and `api/constraint-route.test.ts`: strict/missing/injection/conflict/source-reload/human-confirmation/rollback cases; local27PASS | reviewable pending candidates; live Nebius smoke NOT RUN |
| DT-016 | 25, 28 | AI is not authoritative for arithmetic or state | `lib/dealtwin/ai/nemotron-client.ts` | non-authoritative extraction metadata in immutable receipt | `tests/dealtwin/ai/constraint-extractor.test.ts`: adversarial role/confirmation/balance/outcome/tool output denied, live flag/timeout/size limits; Task28 `security/server-boundary.test.ts` and both emitted-client scans prove bounded plaintext secret isolation | same compiler financial authority; provider cannot self-confirm; no live-provider certification |
| DT-017 | 7, 8, 9 | Pure compiler returns exact violation evidence | `lib/dealtwin/compiler/compile-deal.ts` | `dealtwin_compile_runs` | `tests/dealtwin/compiler/judge-scenario.test.ts`: feasible/infeasible/cash-floor/first-date/worst-point tests | Initial shortfall Rp3m on 2026-09-22; 25% deposit gives Rp5m minimum |
| DT-018 | 20 | Stress scenarios are explicit and replayable | `lib/dealtwin/stress/stress-transform.ts` | `dealtwin_compile_runs` | `tests/dealtwin/stress/stress-lab.test.ts`: +3/+7/+14 days, +500 bps, specified delay/obligation tests | selected stress cards name parameters and outcomes only |
| DT-019 | 10, 22 | Proof contains reproducible structured evidence | `lib/dealtwin/proof/build-proof.ts` | snapshot, compile run, proof | `tests/dealtwin/proof/build-proof.test.ts`: completeness and canonical hash tests | Deal Proof exposes inputs, dependencies, assumptions, approvals |
| DT-020 | 11 | Replay genuinely recomputes | `lib/dealtwin/proof/replay-proof.ts` | proof canonical payload and replay metadata | `tests/dealtwin/proof/replay-proof.test.ts`: spy/fixture proves compiler invocation; mismatch/version tests | Replay action reports recomputed hash and result |
| DT-021 | 14, 16, 19 | Material ERP changes automatically stale proofs | `lib/server/postgres/proof-invalidation.ts` | `dealtwin_proofs`; existing audit | `tests/dealtwin/postgres/proof-invalidation-primitive.test.ts`: exact self tuple remains current; other affected proofs and new obligation query dependencies stale | changing seeded AP makes the relevant proof STALE |
| DT-022 | 6, 14, 19 | Irrelevant changes do not stale unrelated proofs | `lib/dealtwin/erp/dependency-manifest.ts` | snapshot/proof dependency keys | `tests/dealtwin/postgres/proof-invalidation.test.ts`: non-intersecting dependency test | unrelated master edit leaves proof valid after revalidation |
| DT-023 | 21 | Recompiler finds the deterministic smallest allowed amendment | `lib/dealtwin/recompiler/recompile-deal.ts` | recompile run | `tests/dealtwin/recompiler/recompiler.test.ts`: exhaustive bounded search and lexicographic tie-break tests | Exact winner 2,500 bps; after AP Rp19m propose 2,700 bps while retaining the committed order/capacity; no AI ranking |
| DT-024 | 21 | Recompiler can report no solution | `lib/dealtwin/recompiler/recompile-deal.ts` | recompile run reason code | `tests/dealtwin/recompiler/recompiler.test.ts`: empty feasible set test | Judge UI shows `NO_FEASIBLE_AMENDMENT` without invented advice |
| DT-025 | 16, 17 | Commitment reserves future liquidity, not bank cash | `lib/dealtwin/application/commitment-service.ts` | `dealtwin_liquidity_commitments` | `tests/dealtwin/postgres/commitment-transaction.test.ts`: self reserve/commit counted once; no bank movement on reservation | timeline labels reservation as planning capacity |
| DT-026 | 16, 18 | Same future cash cannot be promised twice | `lib/server/postgres/postgres-commitment-service.ts` | commitment table plus workspace revision | `tests/dealtwin/postgres/commitment-race.test.ts`: two independent-client race test proves one success/one collision | second Judge deal returns `LIQUIDITY_COLLISION`; core innovation |
| DT-027 | 14, 17, 18 | Commitment operations are idempotent | `lib/server/postgres/idempotency-audit-store.ts` | `erp_audit_events` immutable operation receipts; eight DealTwin tables unchanged | `tests/dealtwin/postgres/idempotency-audit-store.test.ts`: identical original response after COMMIT/RELEASE; changed request hash rejected | repeating an action creates no duplicate reservation/order/audit |
| DT-028 | 12, 16, 18 | Failures leave no partial commitment or ERP write-back | `lib/server/postgres/transaction.ts` | all server tables | `tests/dealtwin/postgres/commitment-failure-injection.test.ts`: forced-error rollback tests at reservation, Sales Order, revision, audit steps | failed commit leaves timeline and ERP Sandbox unchanged |
| DT-029 | 2, 16 | Commit writes an ERP Sales Order explicitly | `lib/dealtwin/erp/legacy-sales-order-bridge.ts` | deal Sales Order FK plus ERP order tables | `tests/dealtwin/postgres/commitment-transaction.test.ts`: safe-integer bridge; one Sales Order, one operational audit, exactly one revision increment; full rollback | committed deal links to one operational Sales Order |
| DT-030 | 2, 16 | Deal remains distinct from Sales Order | `lib/dealtwin/domain/deal-terms.ts` | separate deal row and nullable committed order FK | `tests/dealtwin/domain/deal-terms.test.ts`: Deal exists with no order before commit; immutable version history | lifecycle evidence shows creation point of Sales Order |
| DT-031 | 11, 16, 22, 24 | Approvals remain visible and idempotent | `lib/dealtwin/application/approval-service.ts` | `dealtwin_approvals` | `tests/dealtwin/api/approval-decision.test.ts`: pending/approve/reject/retry tests; live approval gate without changing historical proof | Conditional RESERVE; blocked COMMIT; approve; successful COMMIT; identical retry (Task 24 E2E) |
| DT-032 | 14, 16 | Namespaced audit reuses ERP audit | `lib/dealtwin/application/audit-events.ts` | `erp_audit_events` | `tests/dealtwin/postgres/idempotency-audit-store.test.ts`: payload schema and event-order tests | audit view shows compile/proof/stale/reserve/release/conflict/recompile |
| DT-033 | 12, 14, 15 | PostgreSQL is the single Judge source of truth | `lib/server/postgres/postgres-erp-repository.ts` | ERP + DealTwin + cash tables | `tests/dealtwin/postgres/repositories.test.ts`: route restart/durability and no-browser-storage tests | refresh/new session shows durable authoritative state |
| DT-034 | 14, 16, 22 | Expected revision prevents lost updates | `lib/server/postgres/postgres-erp-repository.ts` | `erp_workspaces.revision` | `tests/dealtwin/postgres/commitment-transaction.test.ts`: stale expected revision returns conflict and preserves rows | concurrent Judge mutations never overwrite each other |
| DT-035 | 12, 14, 18 | Tenant lock serializes liquidity decisions | `lib/server/postgres/transaction.ts` | locked `erp_workspaces` row | `tests/dealtwin/postgres/commitment-race.test.ts`: lock-order and two-client serialization integration tests | collision evidence is database-backed, not a UI lock |
| DT-036 | 9, 13, 15 | Judge seed/reset is canonical and isolated | `lib/dealtwin/application/judge-seed-service.ts` | allowlisted Judge tenant rows | `tests/dealtwin/postgres/judge-reset.test.ts`: same business seed hash, monotone revision, retained idempotency receipts, reset-role tenant denial | one-click Load/Reset returns exact Rp30m/Rp18m/Rp5m scenario |
| DT-037 | 4, 15, 24 | Existing ProcureBridge browser demo is preserved | `lib/demo/persistence.ts` | existing local state untouched | `tests/erp-persistence.test.ts`: deterministic v10-to-v11 payload/envelope migration and retained legacy records | existing routes remain functional; no scope regression |
| DT-038 | 22, 23, 24 | Primary surfaces are workflow-first | `components/dealtwin/judge-guide.tsx` | reads server entities | `tests/dealtwin/e2e/judge-mode.spec.ts`: route/component state tests and accessibility assertions | judge completes full path without ERP setup; UX criterion |
| DT-039 | 26 | MCP exposes services, not SQL | `lib/dealtwin/mcp/tool-handlers.ts`, `tool-schemas.ts`, `conversation-state.ts`; signed-session MCP route/private grant | durable IDs only; stale/unknown-owner refresh; no client financial authority | three MCP suites: real app-role service/receipt/reset, strict schemas/identity/confirmation/origin, multi-turn reload and reviewer RED→GREEN; see `TASK26-VERIFICATION.md` for final gate | private local MCP HTTP carries real Deal/Proof state; public Alexa/OAuth/live-provider evidence NOT RUN |
| DT-040 | 13, 15, 22, 28 | No production or real data dependency | `lib/server/auth/judge-session.ts` | synthetic tenant only | `tests/dealtwin/api/judge-obligation.test.ts` and `tests/dealtwin/postgres/judge-reset.test.ts`: deny foreign tenant/reset and non-allowlisted obligation mutation | public demo labels all data simulated |
| DT-041 | 27 | Benchmark publishes only measured results | `evaluation/dealtwin/run-benchmark.ts`, `service-evidence.ts`, `report.ts` | strict synthetic fixtures and ignored measured report/replay artifacts; disposable service observations only | evaluation/CLI/actual-role PostgreSQL/fingerprint tests; final serial118files1147/1147PASS0skip on2da5f5a; global and five DealTwin coverage thresholds PASS | preserved113cases, compiler0/68+0/45 errors, rule35/68+22/45;57/57 mismatch replay; offline contracts4/4, LLM-only NOT_MEASURED; local Task27 gate closed2026-10-15 (TASK27-VERIFICATION.md), no release claim |
| DT-042 | 13, 28, 29 | Public deployment passes security gate | `evaluation/dealtwin/release-gate.ts`, `scripts/dealtwin/check-client-artifacts.mjs` | forced RLS/privileges;14base gates plus trusted42-ID aggregation, not artifact authentication | Task28 historical gate retained; Task29 aggregation RED50→GREEN97, full120files1247/1247PASS0skip onddf0992, focused81+23PASS/type/lint on940edbf; see `VERIFICATION.md` for exact source scopes and pending final coverage/build/browser/restore/audit/packet | PUBLIC BLOCKED: latest measured Task28 audit22aggregates2critical14high6moderate, no waiver; no freshTask29 audit or completed packet; prior terminator concern NOTREPRODUCED unchanged, new positive-many-to-many unit Minor deferred |

## Audit event contract

The authoritative event names are:

- `dealtwin.deal.compiled`
- `dealtwin.proof.generated`
- `dealtwin.proof.stale`
- `dealtwin.commitment.reserved`
- `dealtwin.commitment.committed`
- `dealtwin.commitment.released`
- `dealtwin.commitment.expired`
- `dealtwin.commitment.cancelled`
- `dealtwin.commitment.conflict`
- `dealtwin.deal.recompiled`

Every successful mutation stores `operationSucceeded: true`, a canonical `responseJson` string, `responseHash`, `requestHash`, and operation key in an immutable existing ERP audit event. Only reserve, commit, and release also retain dedicated keys on the commitment row; expire and cancel use their audit-receipt keys without adding columns or aliasing the release key. The unique partial success index is `(tenant_id, action, detail->>'idempotencyKey')` where `action LIKE 'dealtwin.%' AND detail->>'operationSucceeded' = 'true'`; successful rows require non-null receipt fields. Retry checks this evidence before expected revision and never reconstructs the original response from current lifecycle state.

Each payload includes `schemaVersion`, `tenantId`, aggregate IDs, actor, operation idempotency key where applicable, prior/current ERP revision, and content hashes. Monetary values are canonical decimal strings.

## Evidence policy

Linked-cloud2026-10-18: [continuation evidence](CLOUD-CONTINUATION-20261018.md)
adds11actual pure-core smoke checks on656018f with0fail/0skip. This is bounded
supplemental evidence, not closure of any PostgreSQL/browser/provider or
full-regression gate. Missing npm cache/PostgreSQL leave runtime not ready and
Task29PARTIAL. All existing42requirement mappings and historical evidence below
retain their original scope.

Task29's partial-checkpoint literal42-ID/check mapping and candidate verification
protocol are recorded in `VERIFICATION.md`. Task29 is NOT complete; pending checks are not PASS;
external live/provider/account/public readiness remains explicitly unproven.
The prior Task28 deferred metadata-terminator claim did not reproduce against
actual Node24/Zod: the new characterization cases pass without changing those
validators. This corrects the current disposition, not historical run evidence.

- Unit tests prove pure arithmetic, ordering, normalization, state machines, canonicalization, stress, and search.
- Disposable PostgreSQL tests prove schema, transactions, revision checks, RLS, reset isolation, and races.
- Route tests prove authentication, validation, stable status/reason codes, and no client-owned tenant identity.
- Browser tests prove the visible Judge lifecycle uses server responses and survives refresh.
- Provider contract tests prove malformed AI output fails closed and cannot bypass deterministic services.
- Release evidence records exact commands, versions, counts, skips, environment, migration state, and tested commit SHA.

## Planning correction review (2026-09-12)

| Review blocker | Closure and behavioral owner |
|---|---|
| 1. Self-reservation | Tasks 6/14/16: exact proof/version/event-hash identity; one event set on COMMIT; scoped owner exemption only. |
| 2. Task dependency | Task 14 ships transaction-local invalidation; Task 16 consumes it; Task 19 expands all ERP entrypoints. |
| 3. Cash cancellation | Tasks 4/13: immutable opposite reversal, original FK/uniqueness and opening-date anchor tests. |
| 4. DealTermsV1 | Task 2: full terms/roles/date/quantity/money DTO; safe bridge failure and conservation tests. |
| 5. Canonical Judge | Tasks 9/20/21: fixed dates, initial Rp3m shortfall, exact 25% winner, +3-day stress and B collision. |
| 6. Missing routes | Task 22: constraint confirmation, approval decision and allowlisted AP mutation, each with its own route test. |
| 7. Approval gating | Tasks 11/16/22/24: fixed non-arithmetic conditional reservation, blocked commit, approval and idempotent success. |
| 8. Tenant/RLS | Tasks 12/13/14/15: one-client local context, predicates, forced policies, distinct app/reset credentials; Task 28 adversarial regression. |
| 9. Single revision | Tasks 14/16/18: adopt proposed revision, one operational audit, one Sales Order and rollback tests. |
| 10. Original replay | Tasks 14/17: immutable existing audit receipt survives lifecycle transitions/reset. |
| 11. Browser v11 | Task 4 lists validator, seed, provider/coordinator, storage key and deterministic migration tests. |
| 12. Judge guide | Task 24 implements the specification's 12-step guide. |
| 13. Dependencies | Task 12 adds pg/types only, Task 15 first Zod boundary, Task 24 Playwright. |
| 14. Traceability | All 42 rows name full module/test paths declared in the 29-task plan. |

Spec coverage: sections 1–4 map to Tasks 2/6/14/22–26; section 5 to Tasks 1–3/7; section 6 to Tasks 2–3/5–11/14/16–22/25; section 7 to Tasks 4/5/13; sections 8–9 to Tasks 12–18; section 10 to Tasks 9/15/20–24; section 11 to Tasks 22–24; section 12 to Tasks 25–26; section 13 to Task 27; sections 14–16 to Tasks 13/15/18/24/28–29. Every task has a behavioral RED/GREEN gate, files, consumed/produced contracts and commit boundary.
