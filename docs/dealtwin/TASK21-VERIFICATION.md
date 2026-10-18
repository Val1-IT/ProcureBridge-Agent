# Task21 — deterministic amendments and atomic reservation replacement

Local only, LENOVO-VT, 2026-10-07 (Asia/Yerevan). Baseline `62b27b9f98a82264785b7de834a04264b4f57920`; existing worktree and WIP retained. Code commit `240cbed2bb372e306a2339190b595fe933770fef`. Final frozen-source full verification PASS:95 files/987 tests, zero skips,295.54s. Completion script on the committed source PASS37/37,55.80s; Task21 complete. No release readiness is implied.

## Implemented boundary

- Pure finite enumeration in 100bps deposit and one-day timing steps, actual compiler/base plus policy-required stress for eligibility, locked lexicographic score and canonical-term-hash final tie-break. No AI ranking or financial floating-point arithmetic.
- Exact canonical Judge winner:25% deposit,14-day balance,6-day direct cost, minimumRp5m. Independent2457-point oracle. After genuine AP18m→19m source-chain mutation:27%, minimumRp5.2m;26% failsRp400k. Valid2050bps starting deposit steps to2550bps/Rp5.3m under a4000bps cap,2340 points, no off-grid endpoint.
- `replaceReservation` uses the existing one-client/workspace-lock PostgreSQL port. Immutable receipt is read before revision/row/current-proof checks; successful reserve and replacement keys share the RESERVE namespace but have different payload hashes. Old and new tuples are both hashed. Retry survives release and Judge reset; changed payload is rejected.
- Old self must be the single active owner on the same Deal, still reserved, with exact stored tuple/hash/events AND genuinely replayed immutable historical proof. STALE old proof is acceptable for replacement cleanup, never as new allocation authority. New proof/version must be current, newer, same Deal, fixed terms, current dependency hashes and live approval coverage. Candidate events are compiled once against all other occupied capacity.
- The old reserved row is conditionally cancelled and a new row inserted within the same transaction. Historical proof/event/hash columns are never overwritten; no release gap, ERP/cash write, new Sales Order, release-key reuse or lifecycle-schema extension. One macro-operation receipt/audit and one revision. Existing conditional-update row-count checks remain mandatory.
- Current-state required stress comes from server composition, specifically the locked Judge+3-day scenario. Matching named evidence must be replayable. Optional failing stress does not become an implicit eligibility requirement.
- Already committed Deal recompile is a read-only remediation projection. The exact old owner is excluded only in the projection; its occupied ledger row and single Sales Order remain unchanged. Replacement and second COMMIT are denied. Durable new proposal/version/proof persistence belongs to Task22.

## Actual TDD evidence

- Original solver behavioral RED7failed/17passed (24 tests), followed by solver8/8GREEN; latest expanded solver9/9PASS6.19s.
- Six replacement/projection behavioral RED failures reached501 after actual app-role PostgreSQL setup: success/retry and four injected failure points plus committed projection. Initial combinedGREEN30/30PASS187.84s.
- Historical-owner binding fixture initially hit an existing immutable-event guard; that setup error is NOT counted as behavioral RED. Revised fixture uses actual repository insertion/conditional lifecycle without disabling guards. Genuine RED showed an internally consistent but wrong proof hash being accepted; minimal historical-proof binding fixed it.
- Missing required stress was accepted and optional failing stress rejected (two genuine RED failures6.66s); explicit server-policy requirement fixed both. Additional focused4/4PASS10.07s.
- Expanded combined36/36PASS149.93s includes tenant/role/revision rejection, retry after release/reset, newly stale ERP dependency, immutable history, exact one revision/audit, and rollback after retirement/insert/revision/receipt or zero-row retirement.
- Fractional-percent policy grid had genuine RED1failure1.58s. Minimal fix floors the candidate count and permits the last step below the cap; all solver9casesPASS. The intermediate full run had986PASS/1FAIL370.77s on that same case because the process had loaded pre-fix code; no other failure is omitted. Final frozen-source full run PASS95/95 files,987/987 tests, zero skips,295.54s:152 real PostgreSQL and835 non-PostgreSQL cases (including18 client-fake cases).
- Final legacy coverage PASS:statements/lines97.78%,branches85.64%,functions99.21%. This configured include list does not measure all DealTwin code. Full regression includes compiler/proof/stress, lifecycle/races, finance/sales and payment/reset. Evidence files `.cache/task21-final-full.json`, `.cache/task21-final-focused.json`, `.cache/task21-additional-green.json` are local ignored artifacts, not CI claims.
- Latest typecheck, lint (zero warnings), and five-stage local build all PASS after the correction. No deployment follows the build.

## Rulings and retained limits

1. Replacement uses the RESERVE receipt namespace and the new row's reserve key, with operation/old/new tuple payload binding. This retains one immutable macro audit and prevents cross-payload key reuse. Cost if wrong: clients must recognize the replacement payload in that namespace.
2. Committed recompile preview is read-only; Task22 owns durable proposal persistence. Cost if wrong: preview alone is not a refresh-persistent proposal.
3. Supplier timing proposals add fixed-term non-arithmetic authorization and never grant it. Existing legacy multiple-code allocation remains fail-closed until explicit richer binding in Task22. Cost if wrong: those proposals cannot reserve through the old single-code mapping yet.
4. Judge PostgreSQL composition injects required+3-day policy; proof diagnostics cannot define requirements. Cost if wrong: future policy changes need explicit versioned server configuration, not browser authority.

Existing ERP document-item/source-array reduction mapper limitation is retained, not silently fixed or weakened. No migration, grants, production data, external cleanup, push, merge, deployment, real money or cloud execution. Native PostgreSQL15 evidence is not hosted CI/PostgreSQL16 evidence. Live workflow/UI and three clean Judge browser E2Es remain Task22-24. Final whole-branch independent review remains at the locked roadmap's final gate, not a new per-task review loop.

Follow-up: Task22 code `857ef26` resolves new producer multi-requirement binding explicitly via optional hashed/replayed requirementCode and immutable snapshot kind/code matching. Historical ambiguous kind-only multiple-code records still fail closed. This does not retroactively change the Task21 evidence or its recorded ruling.
