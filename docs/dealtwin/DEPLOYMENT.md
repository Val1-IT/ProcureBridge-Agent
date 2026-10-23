# DealTwin deployment boundary — Task28

Status: local security-gate implementation only. NO deployment is authorized.
Task29 release packet, authenticated production-equivalent browser evidence,
backup/restore rehearsal and operator security approval remain separate gates.
Passing unit tests or this checklist alone never makes an environment ready.

## Supported target and trust boundary

The existing private Judge target is Node with PostgreSQL, built by
`npm run judge:build` using vite.dealtwin.config.ts. The native loopback wrapper
is scripts/dealtwin/node-server.mjs; it binds127.0.0.1:4177 and enforces Host.
It is NOT a public listener, session issuer or production process configuration.
Generic `npm run build` preserves the separate Cloudflare/Sites target; it does
not prove Node/PostgreSQL deployment or authorize Cloudflare login/deploy.

Current Judge composition intentionally accepts only the disposable local
dealtwin_test allowlist and synthetic tenant dealtwin-judge-v1. Do not remove
those guards to ship a public demo. A separately approved public composition
needs actual identity-to-tenant binding, reset authorization, verified TLS,
abuse/rate controls and the evidence below. No public dev server, tunnel,
Vitest UI, model-controlled tenant/role or browser-storage authority is allowed.

## Secrets, TLS and connection budget

Server-only environment: DATABASE_URL (application login), DATABASE_SSL_MODE,
DEALTWIN_JUDGE_RESET_DATABASE_URL (distinct reset login), and
DEALTWIN_JUDGE_SESSION_SIGNING_KEY (at least32bytes). NEBIUS_API_KEY is optional
and must not activate live calls without separate authorization. Live Nemotron
needs all of NEBIUS_API_KEY, NEBIUS_MODEL (a Nemotron model id) and
DEALTWIN_NEBIUS_LIVE_ENABLED=true; the intent router additionally needs
DEALTWIN_NEBIUS_ROUTER_ENABLED=true (optional NEBIUS_ROUTER_MODEL). Never prefix
credentials with NEXT_PUBLIC_, put them in client HTML or log connection URLs.
Keep actual values in operator-controlled secret storage, not committed files.

Use verified TLS for every non-loopback PostgreSQL connection: verify-full
sets rejectUnauthorized=true, and SSL URL query overrides are rejected. Local
disable is permitted only on exact loopback hosts for the disposable fixture.
The generic parser's TLS support does not expand the private Judge allowlist.
For a future authorized HTTPS endpoint, terminate TLS at a trusted reverse proxy,
keep the Node port private, preserve the verified original origin/Host and use
Secure/HttpOnly/SameSite=Strict signed cookies. Do not weaken origin checks or
trust arbitrary forwarded headers to accommodate a proxy.

One process-level app pool and a separate reset pool: max10 connections per
pool/process, idle timeout30s, connection/query/statement timeout5s. Budget
all processes × both pools plus migration/monitoring reserve against the DB
limit; do not multiply workers without reviewing that bound. Application and
reset logins are NOSUPERUSER/NOBYPASSRLS, not table owners and cannot inherit
each other's role. Forced RLS, transaction-local tenant setting and explicit
tenant predicates remain required. No provider/network calls while locks held.

## Migration, rollback and restore procedure (not executed by this document)

1. Rehearse only on a fresh disposable database with the exact candidate SHA,
   PostgreSQL version and immutable migration-file digests recorded.
2. A dedicated bootstrap/migration owner applies versioned SQL transactionally;
   application/reset credentials cannot run schema changes or grant escalation.
3. Capture a backup before upgrade with pg_dump and verify it with pg_restore
   into another fresh disposable database. Store encrypted backups off the
   public/client artifact path with reviewed retention and access controls.
4. Compare restored schema/migration inventory, canonical Judge business seed
   hash, monotone revision, original/reversal cash rows, immutable receipts and
   Sales Order links. Run RLS/cross-tenant, replay, payment/reset and race cases.
5. On failure, stop promotion and preserve evidence. Prefer a reviewed forward
   repair; destructive down-migrations or dropping live tables are forbidden.
   Restoring a pre-upgrade snapshot is acceptable only after rehearsing it and
   obtaining authorization for the exact environment/data-loss window.

This task does not claim a successful backup/restore drill or activate any
production migration. The missing migration_restore and backup_restore release
checks must stay blocked until real candidate-bound artifacts exist.

## Process, readiness and safe logs

A future VPS supervisor must start the immutable built Node artifact as an
unprivileged account, limit restart rate/resources, provide a private writable
runtime directory, and stop accepting traffic before draining requests and
closing both pools on shutdown. The current loopback demo wrapper is not that
production supervisor; multi-instance/session-key rotation needs separate proof.

Check process liveness separately from readiness. A401 from the state route
proves neither DB connectivity nor authenticated readiness. Readiness needs a
valid server-issued synthetic session and successful authoritative state read,
with fail-closed unavailable responses. DB probes use least-privilege access,
not bootstrap credentials. Verify restart/refresh and proxy behavior before
promotion; never expose dumps, health internals or financial snapshots publicly.

Log operation IDs, stable reason codes and safe revision metadata only. Redact
cookies, Authorization headers, session grants/signing keys, provider keys, URLs
with credentials, raw request bodies and provider/SQL exception messages. Client
error responses must remain sanitized. Do not use production data as fixtures.

## Exact-SHA evidence and CI

evaluateReleaseGate is a pure structural validator, NOT an artifact signer or
deployment command. Its required checks are dependency_audit, migration_restore,
rls, cross_tenant_api, secret_scan, typecheck, lint, tests, coverage, build,
authenticated_judge_smoke, tls, least_privilege and backup_restore. Each needs
status=pass, the exact candidate SHA and a portable artifacts/ reference. Missing,
failed, skipped, duplicate or mismatched evidence blocks. A trusted consumer
must also inspect artifact contents, provenance and current risk decisions;
fabricating matching JSON fields is not independent release evidence.

Capture current npm audit JSON including direct/transitive and runtime/tooling
scope. Any unresolved high/critical finding blocks public deployment unless a
separate current owner-approved, time-bounded non-reachability decision exists.
The expired2026-08-24 demo waiver does not apply and is not renewed here.
Compatible pinned upgrades are tested in bounded groups; never audit fix --force,
blind downgrade, force peer resolution, or assume devDependencies are harmless.

CI runs serial coverage (which includes the whole suite), both local build
targets, emitted-client secret/local-path scan and the high/critical audit gate.
Retain candidate SHA, exact command/environment versions, audit, coverage and
build evidence locally. No automatic artifact upload/publication or deploy job
is added; external evidence transfer requires separate destination approval.
Actual hosted CI/PG16 and public/browser/provider execution are unverified here.
The emitted scanner is deliberately bounded, not exhaustive encoded-secret,
runtime penetration or whole-repository confidentiality certification.

Task29 owns the42-requirement evidence aggregation; it is not implemented in
Task28. Stop for human review after the Task28 checkpoint.
