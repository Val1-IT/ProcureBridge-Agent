# Task 25 — non-authoritative commercial extraction

Local checkpoint, 2026-10-13, LENOVO-VT. Baseline c92afb7; code
`61a24302cadf5c0a4aaaca9b412528da4657c51f`. Original checkout and unrelated
Arvanta/PO infrastructure are protected. No inference, publishing or deployment.

## Implemented boundary

Strict versioned candidate/missing-information schema, exact quoted source,
canonical money and integer rates, prior-policy conflict detection. The model
cannot supply authority, role, balance, outcome, confirmation, SQL or tools.
The service preflights receipt/version/revision in a short transaction, returns
the client before provider I/O, then reacquires the workspace lock and checks
receipt/revision/current version before writing. A concurrent ordinary command
causes REVISION_CONFLICT; it cannot be overwritten by delayed extraction.

Immutable new versions preserve prior confirmed constraints. Candidates remain
ai_extracted/pending_confirmation. Explicit human confirmation creates another
version with user_confirmed provenance; the old AI version remains unchanged.
Provenance text is persisted through a nullable bounded source_text column.
Legacy NULL source, proof bytes, tables, grants and reset boundaries are retained.
Inventory references are checked against current tenant ERP data inside the
write transaction. Provider metadata/prompt/schema/input hash live in the
existing immutable operation receipt, not a new AI-authority table.

The native fetch client permits only the fixed HTTPS Nebius chat endpoint,
Nemotron-configured models, JSON response mode, 2048 output tokens, a maximum
five-second timeout and 64KiB response. Explicit live enablement is mandatory;
having a key is insufficient. No automatic retries or raw provider errors.
Runtime construction/reset/compiler never requires a provider key or call.

## Actual focused evidence

- Parser/client scaffold: 18 behavioral failures, then 18/18 PASS (745ms).
  Initial test syntax error was fixed and is NOT behavioral RED evidence.
- Route/service: proven terms DTO/domain mismatch fixed by existing decoder.
  Extraction then persisted but reload failed (503), proving missing source
  mapping; nullable migration + mapper fixed reload. Confirmation then returned
  422, proving provenance transition bug; human-confirmation mapping fixed it
  without allowing the model to self-confirm.
- Invented inventory reference: HTTP200 instead of422 (behavioral RED), fixed
  with current-ERP reference validation. Two nonexistent table fixtures were
  corrected to actual erp_audit_events; setup errors are NOT behavioral evidence.
- Final focused command: `npm.cmd test -- tests/dealtwin/api/constraint-route.test.ts tests/dealtwin/ai/constraint-extractor.test.ts --testTimeout=60000 --hookTimeout=60000 --reporter=dot`:
  **27/27 PASS**, 2 files, zero skips, 13.73s (9 real PostgreSQL app-role cases,
  18 controlled-provider/parser/client cases; no live inference).
- Real rollback injections reach exact errors at version, candidate constraint
  and immutable audit/receipt writes. Whole evidence/pointer remains unchanged.
- Source save/reload, pending UNRESOLVED, explicit confirmation, actual 20%-term
  DOES_NOT_COMPILE, original response after reset, payload-key mismatch,
  missing/malformed/contradictory output, no provider under workspace lock,
  concurrent revision conflict, role/body/size/target denial are tested.
- Typecheck `--incremental false`, lint `--max-warnings 0`, diff check: PASS.
- Staged bounded secret/artifact pattern scan: 13 files, zero findings. This is
  not exhaustive security certification. Private auth/cache artifacts excluded.

Frozen code61a2430 whole completion gate: **110 files / 1082 tests PASS**, zero
skips,277.85s; configured legacy coverage97.78% statements/lines,85.64% branches,
99.21% functions (not full DealTwin coverage). This retains finance/payment/reset,
commit/lifecycle/race and new extraction tests. Native Node build passed all five
stages. Source was unchanged during that full gate.

Browser prerequisite failure after the full suite: schema existed but no Judge
workspace remained, so preserving launcher correctly refused startup. This
startup failure is NOT a browser scenario pass. New focused actual-app-role
bootstrap test proved explicit empty-fixture reset RED, then **1/1 PASS**,4.55s.
`judge:test` now explicitly prepares only the synthetic fixture BEFORE its
preserving webServer; global setup mints auth without another reset. No migration
or schema drop occurs in prep. Normal demo startup still refuses an absent
workspace and preserves live synthetic state. Browser **7/7 PASS**, zero skips,
32.5s, including THREE independent journeys1440/820/1024px. Final typecheck
incremental=false/lint zero-warnings/diff check PASS after this fixture-only fix.
Whole1082 gate belongs to61a2430; the subsequent bootstrap change has focused
real-PG and browser evidence, not a falsely attributed duplicate full-suite run.

## Rulings and unverified boundaries

- Duplicate restatement of a confirmed policy is rejected conservatively, not
  silently overwritten. Cost: redundant commercial text needs clarification.
- Existing domain validation remains the confirmation authority. Cost: old AI
  version retains pending status; its human-confirmed successor is distinct.
- Official CLI2.120.0 generated the local migration; it was populated through
  apply_patch. Native PostgreSQL15.4 disposable harness is used because there
  is no linked Supabase project/Docker runtime. Supabase advisors/db-pull and
  hosted PostgreSQL16 are NOT RUN. No remote migration or privilege change.
- Actual immutable receipt and audit are one erp_audit_events row, not invented
  separate tables. Cost: failure at this final write tests both together.
- [Official Nebius API](https://api.studio.nebius.com/docs) supports JSON object
  response mode; adapter uses strict local validation rather than an unsupported
  provider JSON-schema promise.
- Live provider smoke is **NOT RUN**. Credentials/budget authorization was
  requested separately; no reply or paid action assumed. Offline Task26 can
  continue. Amazon/public transport/provider/release evidence is not claimed.
- Existing ERP item-pruning mapper limit, pg8.23 concurrent-query deprecation
  warning and legacy-only coverage scope remain explicit, not refactored here.

Next: Task26 allowlisted MCP tools
and durable-ID conversation; do not restart completed Tasks1–24.
