# Security and guardrail notes

## Current posture

This is a Demo Data prototype, not a production-approved ERP. State is browser-local, roles are selectable Demo Mode roles rather than authenticated identities, Supplier Agent telephony is simulated, and the optional Supabase schema is inactive. Do not load customer data, production credentials, or regulated records.

## Domain authorization and atomicity

Consequential mutations enter through a closed named-intent executor. The caller cannot supply a command callback or actor role: actor, role, status, source evidence, links, quantities, dates, balances, and invariants are rechecked from authoritative state. Success requires a deeply valid v10 result, a nonnegative safe-integer revision advancing exactly once, and one authoritative audit event. Invalid, forbidden, stale, duplicate, or unsafe-revision operations return the original state without revision/audit side effects.

The UI cannot dispatch arbitrary ERP snapshots: `useErpCommands()` has no public `run(callback)` and the public demo-store dispatcher has no `HYDRATE`/whole-state replacement. Validated persistence hydration, judge restore, and revision-checked commit remain private store capabilities. Demo role switching demonstrates policy behavior but is not authentication; a production adapter must derive actor/tenant from verified server identity.

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

Saving approval registers its exact scope with the same-process server runtime and returns a cryptographically unguessable capability bound to demo session, call, supplier, PO, products, boundaries, and approval timestamp. The create-call API accepts exact keys only, rejects client entity snapshots, requires that capability in `x-supplier-call-approval`, reloads context from the server-owned repository, evaluates guardrails, and atomically consumes the capability with idempotency plus supplier/PO/local-date claim before provider execution. Demo reset invalidates outstanding capabilities for the retired session.
Guide begin/restart/exit is a separate replay operation: it sends a strict `{demoSessionId}` `PUT` to the demo-only session route, clears that active session's process-local call state/capabilities/claims, and requires `204` before any browser guide transition. Busy or retired sessions return `409`; any reset error is surfaced as a persistence conflict and the browser transition fails closed.

Stable responses include `400 INVALID_REQUEST`, `409 SERVER_APPROVAL_REQUIRED`, `409 SUPPLIER_CALL_INELIGIBLE`, `409 SUPPLIER_CALL_ALREADY_CLAIMED`, `409 LIVE_PROVIDER_NOT_AUTHORIZED`, `409 SUPPLIER_CALL_RESET_BUSY`, `409 SUPPLIER_CALL_SESSION_RETIRED`, `503 APPROVAL_CAPABILITY_UNAVAILABLE`, and safe `502` authorization/provider failures. Repository/provider messages, snapshots, capabilities, and credentials are not reflected.

## Provider isolation

The ERP route uses one process-local `DemoSupplierCallAuthorizationRepository` runtime and defaults to mock. It requires no external service, but its approval/call records are not durable, distributed, authenticated-user authorization. The guide calls `forceMock=1`. `MockSupplierCallProvider` stores state/scenario in memory and reads local deterministic scripts; it contains no HTTP, socket, fetch, or SDK call.

The historical Task 14 pre-final-fix shell smoke returned `201` with provider `mock`; it predates the server-bound capability requirement and is not evidence for the current authorization contract. Current focused tests require prior exact-scope server registration, reject a direct POST, consume a capability once under concurrency, and invalidate it on reset. Fresh final-fix counts belong in the final-fix report. Mock-provider tests prove the implemented mock contract has no provider network operation; they are not a general network sandbox or penetration test.

Credentials alone cannot activate live ERP calls. Future live selection needs explicit server composition, verified identity/tenant approval, durable multi-instance capability/claim storage, and both `authorizationMode === "production"` and `repositoryCapability === "production"`. Current composition has neither a production repository nor live supplier provider.

## During-call and result controls

- AI disclosure and approved PO/product scope enter provider input.
- Mock transcripts mask formatted sensitive sequences while retaining operational quantities/dates.
- An early-ended call produces Human Review, not an accepted commitment.
- Results retain matching call/provider/scenario provenance and remain pending.
- Approve, Edit, Reject, and Human Review are permission-gated/audited.
- Approval may change PO commitment fields or create follow-up/dispute only; never stock, receipts, invoices, payments, order quantity, or approved price.
- Replayed/already-reviewed results fail closed.

## Persistence and optional database

Browser persistence is v10. Hydration validates shapes, cross-links, statuses, source evidence, movement chronology, non-negative stock, reservation coverage, invoice/payment consistency, Supplier Agent provenance, and nonnegative safe revisions. Master scalar validation also requires positive purchase/sale prices, nonnegative reorder points and customer credit limits, and nonnegative safe-integer supplier payment-term days. Stored state uses a lineage envelope. Mutations acquire the storage-key Web Lock and perform a reread/compare/write; unavailable/failed locking or a conflicting lineage fails closed and is surfaced. Stale storage events are ignored, same-lineage forks surface conflicts, and a newer reset applies as remote reset. The versioned judge envelope deeply validates an exact v10 snapshot and binds it to demo session/reset generation; a remote reset invalidates it and restore remains private. Reset creates a new session/generation, clears all prior Demo Data and audit history, and does not retain its own audit row so deterministic seed remains clean. localStorage still provides no server identity, tenant isolation, central retention, or durable transaction log.

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

The ignored artifact `.superpowers/sdd/2026-08-09-balanced-distributor-mini-erp/npm-audit.json` records the fresh 11 August 2026 `npm.cmd audit --json` result (exit 1):

| Severity | Count |
| --- | ---: |
| Moderate | 4 |
| High | 16 |
| Critical | 2 |
| **Total** | **22** |

Reported families included `brace-expansion`, `esbuild`, `fast-uri`, `image-size`, `js-yaml`, `nanoid`, `postcss`, `react-server-dom-webpack`, `sharp`, `undici`, `vite`, `vitest`, and `ws`. npm offered ordinary and forced fixes; forced suggestions included breaking/out-of-range changes. No fix or major upgrade was applied.
Direct non-major candidates reported by npm include `@cloudflare/vite-plugin@1.51.2`, `vite@8.2.1`, `react-server-dom-webpack@19.2.8`, and the coordinated Vitest pair at `3.2.7`. Suggestions for `next@16.3.0`, `vinext@0.0.45`, and `drizzle-kit@0.18.1` are major, out-of-range, or downgrade paths and require compatibility planning rather than an automatic fix.

### Exact critical advisory triage

- `vitest@3.2.4` is a direct development dependency affected by [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp), "When Vitest UI server is listening, arbitrary file can be read and executed" (`<3.2.6`, CVSS 9.8, CWE-862). Coordinated upgrade to `vitest@3.2.7` is available without a semver-major change.
- `@vitest/coverage-v8@3.2.4` is a direct development dependency that inherits the critical advisory through Vitest (`<=3.2.5`). Coordinated upgrade to `@vitest/coverage-v8@3.2.7` is available without a semver-major change.

These findings remain open release risk. Passing build/tests do not waive them, and the moderate/high findings remain unresolved alongside the critical pair.

### Time-bounded local-demo waiver

A narrow waiver covers only this repository's mock-only Demo Data workflow on local loopback through **2026-08-24**. Remediation owner: **Repository maintainer**. It is not a production waiver, does not cover customer/production data, and does not make the application production-ready.

The waiver is valid only while all of these conditions hold:

- Vitest runs in non-UI, one-shot mode; the Vitest UI server is not started.
- Development/test servers bind to loopback only and are not exposed to a LAN, tunnel, preview host, shared runner, or public network.
- The repository, test files, configuration, and machine users are trusted; no production/customer data or credentials are present.

The waiver expires automatically after **2026-08-24** and is immediately void if any condition above is broken. There is explicitly no production waiver.

Before expiry, the Repository maintainer must upgrade both direct development dependencies to `3.2.7` together, evaluate the other direct non-major remediations, review the lockfile, and rerun typecheck, lint, full tests, configured-scope coverage, build, browser/security regression, and a fresh JSON audit. Remaining moderate/high findings require remediation or a new explicit dated risk decision. Any extension requires a new dated review of the advisory and exposure; it must never silently roll over.

## Required production work

Before customer-data/production use: add enterprise identity and server tenant authorization; consent/calling/retention governance; official provider API/webhook signing with durable idempotency, queues, retries, dead letters, monitoring, and incident response; activate/test a tenant-safe repository; add rate/origin/abuse controls; connect ledger/tax/reconciliation; remediate audit findings; and run authorized security, migration, load, recovery, accessibility, and browser end-to-end tests.
