# Task23 — server-backed workflow surfaces

Resumed existing WIP from 517c90766c5533b7dafcd396c45bd447e4539af3, not the old original checkout or completed Task17. Worktree: C:/Users/Valen/.codex/worktrees/dealtwin-judge-state/DealTwin (managed detached). Original remains clean at e69b60c. No synchronized sources/locked product/traceability changes.

## Delivered

Deal Inbox, compiler, immutable Proof/history, Commitment Ledger and ERP Sandbox consume signed-session server APIs. Exact decimal-string money is formatted with bigint only for presentation; no UI feasibility compiler, role-grant control, local financial reducer or financial browser storage. Mutations submit persisted IDs/hash tuples and revision; every response, including historical retries, is followed by a fresh authoritative state read. Legacy shell bypass applies only to the DealTwin namespace.

Deal selection persists via URL for Ledger/ERP and refresh. Unknown Deal/Proof fails closed, never falls back to another aggregate. Historical Proof actions use its explicit persisted identity, not an implicitly selected newest proof. Lifecycle cleanup derives exact active owner tuple; committed links remain protected by server/command contracts.

## Actual evidence

Existing WIP RED/GREEN is retained in the plan ledger: renderer11 behavioral failures then11PASS; transport/shell/profile5 failures then5PASS; command7 failures thenGREEN. This continuation did not manufacture or rerun old RED.

2026-10-13 new RED: selection5FAIL2PASS7 (wrong fallback/URI handling); explicit historical command2FAIL8PASS10. GREEN: UI plus legacy ERP navigation6files37testsPASS2.24s. Typecheck incremental=false and lint zero warnings PASS after latest changes. Config guard RED1FAIL6PASS7; guard plus signed profile2files8testsPASS5.86s using actual PostgreSQL app login.

Windows now reserves old55432 in55424–55523. Its startup failed socket Permission denied, not an application test failure. Existing disposable cluster reused on verified empty55632; normal recovery completed after pg_ctl's initial30s startup wait. Verified exact dealtwin_test/data directory, fsync and synchronous_commit ON, separate app/reset non-superuser/non-bypass roles, zero other DB sessions. Shared guard admits only existing55432 and fallback55632 with exact loopback/test database; unrelated5432/55633, production database and remote host still denied. API fixtures derive their URLs from the verified harness connection rather than hard-coding an unusable port. No Windows network/privilege settings changed.

Frozen-source completion gate at ab92ccd: npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot --reporter=json --outputFile=.cache/task23-final-20261013.json PASS,106files1050tests,zero failures/skips,260.24s. Actual PostgreSQL tests176 (152 in postgres suites plus24 real route/harness cases);874nonPG includes18fake-client cases. Legacy configured coverage97.78statements/lines,85.64branches,99.21functions PASS, not full DealTwin coverage. Completion script recorded this one full run; no redundant repeat. Default npm.cmd run build PASS after full run, all five vinext stages; existing static route-classification notice remains. Source unchanged during full run/build. Metadata closure only afterward.

Task23 complete locally. Prior October7 browser smoke is historical only, not fresh Task24 evidence. Browser journey/three clean runs, provider/MCP/live integrations, hosted CI, release and deployment remain separate gates. Existing ERP mapper item/source reduction limitation remains unchanged.
