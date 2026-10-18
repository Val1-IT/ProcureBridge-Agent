# Current DealTwin demo checklist and outstanding evidence

Source review baseline: `3e74db3c781688e638b19bab9a066fd1c05a80a3`.
Its product code is unchanged from `99ef77b45700d7e96686273972ab2b088c20e363`.
This document is preparation, not a completed demo or release approval.

Verification update: [17b5c75 results](LOCAL-VALIDATION-17B5C75-20261018.md)
establish full tests/coverage, runtime checks, typecheck/lint and both builds/client
scans. After the owner closed Chrome, [the browser and benchmark review](BROWSER-BENCHMARK-REVIEW-20261018.md)
records 11/11 browser/HTTP checks and a measured 113-case synthetic benchmark
with independent replay. The 4096 MiB guard remains unchanged. Physical restore,
dependency disposition, exact-candidate release aggregation and external evidence
remain outstanding; the historical blocked checkpoints retain their own scope.

## UI review

No concrete defect found in the minimal failure display during source review:

- Date values remain the server's calendar-date strings, with no timezone
  conversion or inferred timestamp. Null dates say **Not reported**.
- `shortfallRupiah` uses the existing bigint whole-IDR formatter, including
  values beyond safe JavaScript integers. Zero is displayed as zero; null is
  **Not reported**, not an invented zero or inventory-unit shortage.
- Each row uses its own evaluation fields. Only `status === 'fail'` enters the
  failure list; pending/unresolved rows retain their separate meaning.
- A visible h3, list items and dt/dd labels convey the content without relying
  on warning color. Existing CSS wraps long IDs and uses flexible fact groups.
  No new focus control or keyboard interaction is introduced. This is source
  inspection, not a screen-reader, contrast, responsive-layout or browser audit.

Existing evidence remains **14/14 focused tests and changed-file lint PASS on
99ef77b**, as recorded in [UI verification](UI-CONSTRAINT-FAILURES-20261018.md).
No tests were rerun for this review and no product changes were necessary.

At **15:24:25 UTC**, the single resource refresh measured **4162 MiB available**,
only **66 MiB above the 4096 MiB guard**, committed memory **23.38/36.71 GiB**,
and **17.64 GiB free disk**. The threshold was numerically met, but headroom was
too small for a sustained full run given the earlier worker footprint and
repeated mid-run drops. Full validation was held; no test/DB/browser process
was started. Receipt: `output/ui-review-3e74db3/resources.json`.

## Demonstration sequence — pending fresh candidate execution

Use only the disposable synthetic Judge tenant, a fresh exact-SHA Node build
and separate signed admin/approver sessions once resource conditions permit.
These items are a checklist, not newly observed results:

- [ ] Prepare B's original proof **before** A occupies liquidity, preserving
  the evidence needed to demonstrate a genuine competing-capacity collision.
- [ ] Compile A's locked initial terms. Show `DOES_NOT_COMPILE`, September22,
  Rp3m shortfall, Rp5m floor and the visible failed constraint's own evidence.
- [ ] Find the smallest permitted amendment: **25% deposit**, unchanged 14-day
  customer balance / 6-day direct cost, Rp5m minimum, including required +3-day
  receipt stress. Explain the bounded payment-term search and show its result.
- [ ] Inspect the proof/version, dependency manifest and hashes. Replay the
  stored inputs and compare recomputed and stored result hashes.
- [ ] RESERVE planning liquidity; show COMMIT denied for pending approval.
  Approve those fixed proof/version terms in the separate approver session,
  then COMMIT exactly one ERP Sales Order. Retry the original request and
  show unchanged order count, revision and bank cash.
- [ ] Attempt B: show the Rp5m shortfall on September23, conflicting commitment
  identity and denied allocation, with no second reservation or Sales Order.
- [ ] Change the allowlisted AP18m->19m. Show current proof STALE and the exact
  changed dependency. Recompile to proposed 27% / Rp5.2m minimum. Committed A
  remains REMEDIATION_PENDING with original Sales Order and capacity; old-proof
  replay reproduces history without granting current allocation authority.

This demonstrates exact failure, repair, authorization and evidence-backed
commitment. It does **not** demonstrate supplier production capacity, supplier
switching, split-order allocation or a negotiation engine. Legacy ProcureBridge
quote ranking and expiry rejection are separate from the DealTwin proof flow.
Do not present them as an integrated cheapest-supplier decision. Reservations
are planning capacity; ERP COMMIT is not a real or sponsor-integrated payment.

## Remaining sponsor and validation requirements

| Requirement | Exact outstanding decision or acceptance evidence |
|---|---|
| Stable local validation resources | Sufficient sustained headroom above the 4096 MiB guard; run stages serially with the pinned local Node 24.22.0, preserving all interrupted evidence. No process kills or settings changes to obtain it. |
| Current-candidate engineering packet | Completed: 1328 tests/coverage and source/build checks on 17b5c75; 11 browser/HTTP checks on 5376bf0 with unrelated untracked draft and hash-equivalent application/build; focused 32 tests for the benchmark CLI correction. Preserve these actual source scopes. The mixed-source packet is not a final single-candidate release pass; consolidate after remaining changes/gates settle. |
| Database/benchmark acceptance | Real PostgreSQL RLS/race/idempotency/rollback/replay evidence remains in the 17b5c75 suite. Clean d9ae617 passed a standalone 113-case benchmark, three actual service/race iterations and 57/57 baseline replays. Physical migration/backup-restore still needs a distinct authorized disposable target and Windows-adapted harness. Preserve 14 gates/42 mappings. Local PostgreSQL 15 is not CI PostgreSQL 16 evidence. |
| Dependency release gate | Latest completed audit on 17b5c75 reports 8 high package entries from the published braces advisory despite checked local mitigation. All 10 braces file hashes and five embedded bundle hashes were reverified during source review. Cloudflare/Wrangler bundled Undici and older Next Edge disposition remain open. Need supported remediation or a separately explicit policy-compliant disposition; no waiver exists. |
| Nebius/Nemotron live evidence | Owner-authorized account/secret injection, currently available exact Nemotron model, confirmed pricing and explicit spending/request budget, and approved endpoint access. Existing client permits only `https://api.studio.nebius.com/v1/chat/completions`, 2048 output tokens, 5s timeout, 64 KiB response, no automatic retry. The older at-most-3-request proposal is **not authorization**. Record actual model, bounded input/prompt/schema hashes, response validity, latency and usage where returned; prove output stays pending and cannot approve/reserve/commit. No live call has been made here. |
| Alexa | The locked Alexa+ requirement remains. Real evidence needs authorized account access, actual transport/profile compatibility, identity/account binding and consent handling. Scripted MCP calls prove local services only; label them simulated. Organizer acceptance of simulation needs a separate confirmed decision and cannot silently change the locked product requirement. |
| Public identity and hosting | Authorized public identity-to-tenant/session design, HTTPS/TLS, consent and deployment/security evidence. Local Sites metadata and build capability do not establish public ownership or a deployed integration. Existing private session issuer must not become public. No publishing authorization exists. |
| Competition/submission specifics | Obtain the official rubric/track, required sponsor evidence, submission deadline/timezone and access/deliverable rules from the owner/organizer. These have not been verified by this source review; no eligibility, sponsor-payment or submission-readiness claim is made. Final video remains deferred until project readiness and owner authorization. |

Historical cloud-only/download blockers in older reports retain their original
scope. Local continuation is now authorized, Chromium and local Sites metadata
are present, and the isolated runtime is installed. Completed local evidence and
remaining exact-candidate/restore/external gaps are distinguished above. No production data, paid API, credential
change, push, deployment or final video is part of this checklist.
