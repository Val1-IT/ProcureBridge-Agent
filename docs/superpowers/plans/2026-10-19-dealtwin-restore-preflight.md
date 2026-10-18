# Windows restore preflight implementation plan

**Goal:** Prepare a reviewable Windows disposable-restore plan without starting services or modifying databases.
**Architecture:** A dependency-free read-only module validates the existing source fixture and derives a new target/evidence location. It returns structured command arrays and explicit unverified prerequisites. It has no subprocess, network, deletion or restore execution capability.
**Spec:** `docs/dealtwin/LOCKED_PRODUCT_SPEC.md` sections 14–16; Task 29 of the approved implementation plan; owner's explicit authorization to prepare Windows-compatible harness changes, while withholding destructive or new-fixture execution.
**Execution:** Continue natively in this existing task under that preparation authorization; no subagents or new service execution.

## Constraints and review focus

- Keep existing guard: source `dealtwin_test` on loopback 55632; proposed new target on 55432. Never broaden application URL guards.
- Target and evidence directories must be absent, contained in this workspace, and reached through non-symlink directory ancestors. Source must be the existing `.cache/pg-browser-20261018`, major 15.
- Test existing targets, traversal/invalid IDs, redirected parents, missing source and wrong database major. Preserve every existing file.
- Ownership is proposed until a later authorized runner atomically creates and records it. The plan does not establish listener availability, authentication or restore success.
- Do not execute the historical Linux schema-drop phase. No automatic cleanup/delete commands; preserve failed fixtures for review.

## Task: read-only restore planner and native unit tests

- [x] Add `tests/dealtwin/runtime/restore-plan.node.mjs`, with real small filesystem fixtures, to prove absent-target planning and fail-closed rejection without invoking PostgreSQL.
- [x] Add minimal export scaffolding in `scripts/dealtwin/restore-plan.mjs`; run bounded native tests and capture behavioral RED (12 assertion failures; earlier spawn error separate).
- [x] Implement `planWindowsRestore(workspace, runId, binaryDirectory)` and a dry-only CLI `--run-id <id>`. Return paths, proposed owner marker, source/target identities, argument arrays and explicit pending execution prerequisites.
- [x] Verify GREEN (12/12), changed-file lint, source hygiene and absence of target/evidence mutations. No full application suite is warranted for a non-imported preparation helper.
- [x] Generate the exact current proposed plan. Record current registry/source disposition with it, then return the authorization boundary without executing it.
