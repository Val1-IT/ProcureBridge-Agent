# Security and guardrail notes

## Current posture

This is a Demo Data prototype, not a production-approved ERP. State is browser-local, roles are selectable Demo Mode roles rather than authenticated identities, Supplier Agent telephony is simulated, and the optional Supabase schema is inactive. Do not load customer data, production credentials, or regulated records.

## Domain authorization and atomicity

Consequential mutations enter pure commands. Role, status, source evidence, links, quantities, dates, balances, and invariants are rechecked. Invalid, forbidden, stale, or duplicate operations return the original state without revision/audit side effects.

The UI cannot dispatch arbitrary ERP snapshots. The current-state commit capability is private and accepts only the next exact revision produced through the command provider. Demo role switching demonstrates policy behavior but is not authentication; a production adapter must derive actor/tenant from verified server identity.

## Supplier Agent controls

A call remains locked unless matching human approval and all eight decisions pass:

1. approval matches the exact supplier, PO, and products;
2. supplier phone is valid;
3. supplier is not Do Not Contact;
4. Jakarta local time is allowed;
5. the same supplier/PO has not been claimed that local day;
6. the PO lifecycle is eligible;
7. order lines have exact positive quantities/prices;
8. no unresolved PO dispute requires review.

The API accepts exact keys only, rejects client entity snapshots, reloads context from a server-owned repository, evaluates guardrails, and atomically reserves idempotency plus supplier/PO/local-date before provider execution.

Stable responses include `400 INVALID_REQUEST`, `409 SUPPLIER_CALL_INELIGIBLE`, `409 SUPPLIER_CALL_ALREADY_CLAIMED`, `409 LIVE_PROVIDER_NOT_AUTHORIZED`, and safe `502` authorization/provider failures. Repository/provider messages, snapshots, and credentials are not reflected.

## Provider isolation

The ERP route uses `DemoSupplierCallAuthorizationRepository` and defaults to mock. The guide calls `forceMock=1`. `MockSupplierCallProvider` stores state/scenario in memory and reads local deterministic scripts; it contains no HTTP, socket, fetch, or SDK call.

Task 14 production smoke returned `201` with provider `mock`; a deterministic after-hours request returned `409` and `OUTSIDE_CALLING_HOURS`. The 405-test suite covers provider/API/claim concurrency, guardrails, fail-closed live authorization, and provider mismatch. This proves the implemented mock contract has no provider network operation; it is not a general network sandbox or penetration test.

Credentials alone cannot activate live ERP calls. Future live selection needs explicit server composition and both `authorizationMode === "production"` and `repositoryCapability === "production"`. Current composition has neither a production repository nor live supplier provider.

## During-call and result controls

- AI disclosure and approved PO/product scope enter provider input.
- Mock transcripts mask formatted sensitive sequences while retaining operational quantities/dates.
- An early-ended call produces Human Review, not an accepted commitment.
- Results retain matching call/provider/scenario provenance and remain pending.
- Approve, Edit, Reject, and Human Review are permission-gated/audited.
- Approval may change PO commitment fields or create follow-up/dispute only; never stock, receipts, invoices, payments, order quantity, or approved price.
- Replayed/already-reviewed results fail closed.

## Persistence and optional database

Browser persistence is v10. Hydration validates shapes, cross-links, statuses, source evidence, movement chronology, non-negative stock, reservation coverage, invoice/payment consistency, and Supplier Agent provenance. Unsupported/invalid state becomes deterministic Demo Data with a recovery notice. localStorage still provides no server identity, tenant isolation, central retention, or durable transaction log.

The optional SQL enables RLS, revokes ERP table access from `anon` and `authenticated`, grants intended service-role access, and makes stock movement/audit evidence append-only for service role. Static tests validate declarations, but no migration or live RLS test ran in an authorized project and no adapter exists.

Activation requires server-only secrets, identity-to-tenant mapping, atomic expected-revision transactions, migration rehearsal, RLS/cross-tenant tests, Data API review, backup/restore, and operations. Never expose `SUPABASE_SERVICE_ROLE_KEY` or prefix it with `NEXT_PUBLIC_`.

## Secrets and data hygiene

- Mock demo requires no `.env` or secret.
- `NEXT_PUBLIC_` values are public and must not contain credentials.
- `CALLE_API_KEY`, `CALLE_WEBHOOK_SECRET`, and future service-role keys are server-only.
- Preserved legacy CALL-E code is separate from ERP Supplier Agent authorization.
- Sample contacts use `.demo` domains; do not commit env files, keys, tokens, dumps, or customer exports.

Task 14 tracked-file scans found no hard-coded local path or credential after excluding the implementation plan's literal hygiene command. The raw scan also matched only the worktree `.git` pointer and that literal example. Non-demo emails were package-lock metadata (`@xata.io` and the glob deprecation contact), not customer records.

## Dependency audit snapshot

On 10 August 2026, `npm.cmd audit` exited 1:

| Severity | Count |
| --- | ---: |
| Moderate | 4 |
| High | 16 |
| Critical | 2 |
| **Total** | **22** |

Reported families included `brace-expansion`, `esbuild`, `fast-uri`, `image-size`, `js-yaml`, `nanoid`, `postcss`, `react-server-dom-webpack`, `sharp`, `undici`, `vite`, `vitest`, and `ws`. npm offered ordinary and forced fixes; forced suggestions included breaking/out-of-range changes. No fix or major upgrade was applied.

These findings remain open release risk. Remediation requires reviewed compatible upgrades, lockfile review, full automated/browser/security regression, and fresh audit. Passing build/tests do not waive them.

## Required production work

Before customer-data/production use: add enterprise identity and server tenant authorization; consent/calling/retention governance; official provider API/webhook signing with durable idempotency, queues, retries, dead letters, monitoring, and incident response; activate/test a tenant-safe repository; add rate/origin/abuse controls; connect ledger/tax/reconciliation; remediate audit findings; and run authorized security, migration, load, recovery, accessibility, and browser end-to-end tests.
