# Visible constraint failure evidence

Code candidate: `99ef77b45700d7e96686273972ab2b088c20e363`.
The documentation commit containing this report is separate from that tested
code commit. This is a focused UI improvement, not completion of Task 29.

`DealCompiler` now displays a visible **Failed constraints** list before the
collapsed complete evidence table. Each failed evaluation retains its own
server-provided constraint ID, kind, reason, violation date and cash shortfall.
Missing dates or shortfalls read **Not reported**; no amount is inferred from
the primary failure or an inventory constraint. Exact whole-rupiah formatting
reuses the existing bigint display helper. Passing, pending and unresolved
evaluations remain in the complete evidence table and are not mislabeled as
failures. Compiler decisions, contracts, approvals and financial arithmetic are
unchanged.

## Focused verification

The initial resource check measured 4053 MiB available, below the 4096 MiB test
guard. Only source editing proceeded at that point. A fresh immediate pre-test
check measured **4368 MiB**, permitting one worker with a **512 MiB Node heap**.
The isolated verified runtime was Node **24.22.0**, and installed Vitest was
**4.1.11**. No PostgreSQL or browser service was started.

```text
scripts/dealtwin/run-local-node.ps1 node_modules/vitest/vitest.mjs run tests/dealtwin/ui/constraint-failures.test.ts tests/dealtwin/ui/dealtwin-surfaces.test.ts --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --reporter=default --reporter=json --outputFile=output/ui-constraint-failures-99ef77b/tests.json
```

Result on clean `99ef77b`: **2 files, 14 tests passed, zero failed/skipped**, total
duration **1.69 seconds**. Three new cases verify distinct per-constraint dates
and amounts (including an amount beyond JavaScript safe-integer range), absent
non-cash fields, and no failure labeling for pass/pending/unresolved rows. The
existing 11 surface cases remain passing; the changed server-value fixture now
updates its per-row values consistently with its primary failure.

Changed-file ESLint started after a 4256 MiB preflight and **passed, exit 0**,
with an empty log. Available RAM fell to **3384 MiB at 15:21:16 UTC**; a stop
request was sent, but the process had already finished. Its saved exit record
at 15:21:44 UTC and the completed tool result confirm success, correcting the
initial incomplete-status assumption. No owned Node process remained, and no
further checks were started. No unrelated process was terminated.

Logs, JSON and resource receipts are retained separately in ignored
`output/ui-constraint-failures-99ef77b/`. Full suite/coverage, build, typecheck
and browser checks were not rerun for this candidate. Static rendering tests
do not establish browser layout or hydration evidence.

## Demo scope and preserved blockers

The source mapping at `output/final-df83051/demo-mapping.md` remains bound to its
inspection baseline. This change implements only its smallest presentation
recommendation. Legacy ProcureBridge quote ranking/expiry checks remain
separate from DealTwin proof authority. No supplier integration, supplier
production-capacity constraint, split-order optimizer or negotiation engine was
added. The locked Alexa requirement remains intact. Reservations and ERP Sales
Orders are not real or sponsor-integrated payments.

The prior `df83051` full coverage attempt genuinely started, then was stopped
when available RAM fell to **2856 MiB at 15:13:39 UTC**. Its 93 intermediate
coverage files at that sample are incomplete evidence, not passing test counts.
All interrupted artifacts remain under `output/final-df83051/`; no historical
run is relabeled as proof of this change. Public release remains blocked by
the incomplete full validation and previously recorded dependency, provider,
identity/TLS and Alexa-account evidence gaps. No push, deployment or video.
