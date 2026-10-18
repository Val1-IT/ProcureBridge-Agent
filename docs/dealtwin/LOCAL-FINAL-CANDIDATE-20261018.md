# Local final candidate checkpoint - 2026-10-18

Status: **PARTIAL, PUBLIC RELEASE BLOCKED.** Code candidate
`d286f8f9196dda072ef71a3191fece5aaac0cf80` was clean for the checks below.
This document's follow-up commit records evidence; it is not a newly tested
code candidate. Task 29 and DT-042 remain incomplete.

## Runtime and completed candidate checks

The isolated official Windows x64 Node **24.22.0** runtime includes Undici
**7.29.1** and npm **11.19.1**. The original global Node 24.19.0 installation
remains unchanged. Setup, exact official archive checksum, executable hash,
bounded negative controls and rollback are documented in
[LOCAL-NODE-RUNTIME-20261018.md](LOCAL-NODE-RUNTIME-20261018.md).

| Check on d286f8f | Observed result |
|---|---|
| Native runtime regression/compatibility tests | 4/4 PASS, zero failed/skipped, 415.69 ms |
| Exact installed braces backport check | PASS, one copy, zero changed files |
| TypeScript `tsc --noEmit` | PASS, exit 0 |
| Full source ESLint with dist/.next excluded | PASS, exit 0 |
| Installed graph and five embedded bundle hashes | Recorded; hashes match the previously reviewed bundled sources |
| Disposable PostgreSQL identity | PostgreSQL 15.4, loopback port 55632, `dealtwin_test`, expected fixture directory |
| App/reset login role identity | Both non-superuser and non-bypassRLS; this is not the full privilege/RLS suite |
| Fresh official-registry npm audit | FAIL, exit 1: 8 high package entries, zero critical/moderate/low |

All Node tool entry points above used `scripts/dealtwin/run-local-node.ps1`,
which verifies the pinned executable before execution. Runtime tests exercise
the actual global WebSocket implementation for the two previously missing
Undici fixes and ordinary fetch/stream/WebSocket behavior. No paid provider
request was made.

The lock SHA256 remains
`57ff2662a534dad8d712bb35271bbb9d20d0141f51c195211185bcf084a68228`.
The runtime executable SHA256 is
`ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c`.

## Resource blocker and checks not run

The serial pass began with **4833 MiB free RAM**, above the documented 4096 MiB
start guard. After typecheck/lint and the lightweight database identity check,
the immediate pre-coverage measurement was **3036 MiB**. The guard exited 2
**before invoking Vitest**. Subsequent measurements were 3447 and 3754 MiB.
The Node heap cap was 1536 MiB for source checks and 256 MiB for small probes.
Available C: storage was about 18.6 GiB.

Consequently **full tests/coverage, new Sites and Node builds, client scans,
browser journey, fresh migration/backup-restore and benchmark evidence are
NOT RUN on this candidate**. Existing historical results retain their original
SHA and cannot substitute. No suite was repeatedly retried. No browser security
setting was relaxed and no final video was made.

Only the existing disposable PostgreSQL fixture was started. Its identity and
least-privilege role flags were read; no browser reset or migration was run in
this attempt. It was gracefully stopped and `pg_ctl status` confirmed no server
running. Local PostgreSQL 15 evidence is not CI PostgreSQL 16 evidence.

Neither new build command ran. The prior server artifact still hashes to
`ea7ad6c10b91e388c5a1d89f29e1d781595ea0ea799148bbef27d0a9f99783ae`;
local Sites metadata still hashes to
`2ec610496f6c1ef295ce519a8b6477c148618d00e288d98bb9dc3ce1cbdd18ef`.
No old output was moved, overwritten or deleted by this pass. A prepared ignored
build helper preserves prior artifacts when the pass can resume.

## Evidence and release disposition

The ignored local directory `output/final-d286f8f/` retains runtime TAP,
patch/typecheck/lint logs, initial/resource preflights, installed graph and bundle
hashes, PostgreSQL identity/stop logs, fresh audit JSON and a hashed evidence
index in `verification-packet.json`. That incomplete human-review packet lists
all **14 base gates and 42 trusted requirement mappings**. It explicitly returns
`ready: false`; it does not claim a successful pure release-gate evaluation or
completed functional requirements.

The eight audit entries are braces plus its affected dependency ancestors,
all stemming from **GHSA-vfj7-8cjw-p6xm**. The exact local braces mitigation
passes its installation check, but published-version audit status is not waived.
Cloudflare/Wrangler bundled Undici 7.28.0 and older Next Edge compiled sources
remain installed; their private Node-demo applicability review remains bounded,
not a public-release waiver. The isolated runtime fixes the two demonstrated
Node built-in defects; it does not rewrite those unrelated bundles.

Other open gates: complete same-candidate verification; Nebius model/access/
budget approval and live-provider evidence; public identity, TLS and Alexa
account evidence. Local Sites metadata is available but does not establish
public ownership or deployment. No deployment, push or merge was performed.

Resume the [serial verification plan](FINAL-SERIAL-VERIFICATION-20261018.md)
when the RAM guard is met. Bind results to the actual code/tree and isolated
runtime, preserve this interrupted attempt, and use a new report directory if
re-running any completed check. Any code correction requires a new candidate.
