# DealTwin local browser verification — 2026-10-18

**PASS: ten browser cases plus one HTTP control. Task29 remains PARTIAL.**

## Source and provenance

Imported base: `06f7505e0ad6d3aa45091ad9f70cd815a46f9a34`; tree
`bfd928582efab073f7e193a3edc6db258c5a2826`.
The 5,817,095-byte user-downloaded standalone bundle passed its SHA256 check
(`f276252ad32574c156897ffae0866220135f841943e95a7e687e2cc18e7003a0`),
Git bundle verification and fsck. The original checkout remains clean at
`e69b60caa8d4aa108cebc199b4ce49a42f64b3b7`.

The successful browser run used that base plus the test correction in
`tests/dealtwin/e2e/judge-mode.spec.ts`, then uncommitted, with SHA256
`1a2d368857ac97d32c7846d17df387a3156af4d54cda86365f029eca2ffc97aa`.
This is exact working-tree evidence, not a claimed clean-HEAD run.
No application, financial, migration, dependency or sandbox code changed.

## Two reproduced test defects

- The focus test selected labelled sections as well as scrollable tables.
  It now checks every table wrapper's region role, accessible label, tab index
  and actual focus, and requires the ERP table to exist.
- An immediate URL assertion raced client navigation. Exact-destination URL
  assertions now wait before checking readiness, including browser Back.
  No sleep, timeout increase or financial assertion change was introduced.

Initial failure: 1 pass, 1 fail, 9 not run. The first focused rerun exposed the
navigation race. After both corrections, navigation passed 2/2, then the complete
file passed 11/11. Failure screenshots/traces remain in their original local
output directories; subsequent runs used separate directories.

## Measured results

| Check | Result |
|---|---|
| Dependency-free core smoke at clean base HEAD | 11/11 pass, 2.009s |
| Chromium 1248 launch | PASS, sandbox enabled; no `--no-sandbox` |
| Exact dependency install | PASS, 546 packages, lifecycle scripts disabled |
| Node Judge build | PASS |
| Client artifact scan | PASS, 63 files, zero issues |
| Focused navigation | 2/2 pass, 7.9s |
| Complete browser file | **11/11 pass, 47.915s; zero failures/skips/flaky/global errors** |
| Project typecheck / changed-test ESLint | PASS / PASS |

The browser file covers outage recovery, navigation at 390/1440px, signed
sessions, hydration/assets, declined reset, durable Judge journeys at
1440/820/1024px, injected-identity denial and lost-response idempotency.
Journeys reload before lifecycle commands and verify the Rp3m failure, 25%
amendment, stress/proof, approval gate, one Sales Order commit, retry, B's Rp5m
collision, staleness, 27% remediation and historical proof replay.

[Manifest](../../output/playwright/local-20261018/verification.json) ·
[Results](../../output/playwright/local-20261018/browser-complete-results.json) ·
[Log](../../output/playwright/local-20261018/browser-complete.log) ·
[Screenshots: 1440](../../output/playwright/task24/evidence/judge-1440.png),
[1024](../../output/playwright/task24/evidence/judge-1024.png),
[820](../../output/playwright/task24/evidence/judge-820.png).
Raw logs, screenshots, dependencies and test credentials remain local and ignored.

## Runtime and boundaries

Windows; Node24.19.0; npm11.17.0; Playwright1.64.0; Chromium156.0.8078.4;
PostgreSQL15.4. Installed PG18 lacked `share/postgres.bki`; PG15 was reused
without repairing installations or changing services. A new loopback-only
SCRAM-authenticated fixture applied all three migrations into 45 tables, with
separate non-superuser/non-RLS-bypass app/reset logins. This does not claim the
cloud PostgreSQL suites were rerun locally.

Install used the exact lockfile and official npm registry, with scripts/audit/
funding disabled. Lockfile SHA256 remained
`c209190ba6b2d4ea5c6c7cf3749e7318d5c2ad94223b0b46201fee01f335986c`.
Work ran sequentially; lowest observed available RAM was about3.1GiB. Browser
and app exited; the task-owned database received smart shutdown. Ports4177 and
55632 and its PID file were absent afterward. Database/evidence files remain.
Existing vinext chunk/color warnings and a future-pg9 query-concurrency
deprecation warning were recorded; no current test failed because of them.

## Remaining gates

No full Vitest/coverage, fresh audit, restore drill or concurrency suite was
repeated. Cloud1289/1289 remains cloud evidence. Five documented npm advisories
plus embedded Undici, authorized live Nebius/Nemotron access/budget, real public
identity/TLS/Alexa integration, and the final14-gate/42-requirement packet remain
open. No release waiver, production access, push, deployment or video occurred.

Follow-up: matching existing `.openai/hosting.json` files were found in both
older local DealTwin checkouts. The exact file was reused locally; its SHA256 is
`2ec610496f6c1ef295ce519a8b6477c148618d00e288d98bb9dc3ce1cbdd18ef`.
It contains a project identifier and null optional D1/R2 fields, no credentials.
The separate Sites build still needs validation; metadata was not invented and
no site/resource was created. Sites is optional for the private Node Judge,
while the repository's current CI still requires its preserved build target.
