# Minimum runtime unblock diagnosis — 2026-10-18

Continued in the same workspace/container and branch. Starting HEAD:
`c2db5dcd0b64f04d89f86f381a77b8a9dd770e21`. No new environment, container,
credential, database, browser process, download, package installation or network
policy change was made. Public documentation/metadata was researched through
the web tool; no installation artifact was transferred into the executor.

## PostgreSQL

A bounded read-only inventory found no postgres/initdb/pg_ctl/psql/pg_dump/
pg_restore under /opt, /usr/local, /usr/lib, /usr/bin, /bin, the designated
workspace transfer directories, or the repository. System searches were bounded
to depth5; this is not a claim about inaccessible/private filesystem locations.
The local Docker socket returned an empty image inventory. No container was
inspected, created or modified. Apt archive/list directories contain no usable
package cache. No privilege escalation or alternate endpoint was attempted.

The repository's CI uses PostgreSQL16. The official index currently lists
**16.15**: `postgresql-16.15.tar.bz2` is **25,181,309 bytes (24.01 MiB)** and
its SHA256 companion is91bytes. Both links use **ftp.postgresql.org**.
The gzip alternative is33,138,496bytes; it is unnecessary if bzip2 is used.
These are actual published sizes, not an estimated container/image size.
[Official release index](https://www.postgresql.org/ftp/source/v16.15/),
[exact-byte directory](https://ftp.postgresql.org/pub/source/v16.15/).

The installed toolchain has GCC14.2.0, GNU Make4.4.1, tar/bzip2, zlib1.3.1
development headers and OpenSSL3.5.7 development headers. ICU and Readline
development headers are missing; Flex/Bison are absent. PostgreSQL's release
tarball does not require Flex/Bison unless generated parser inputs are changed.
[Official prerequisites](https://www.postgresql.org/docs/16/install-requirements.html).

A proposed workspace-only build can use an explicit prefix such as
`/workspace/dealtwin-runtime/postgresql-16.15`, `--without-icu`,
`--without-readline`, and `--with-openssl`, keeping zlib for compressed
dump/restore. ICU collation and interactive psql editing would be absent; no
ICU-specific dependency was found in the current migrations/tests. This is a
bounded test runtime proposal, not binary equivalence with the CI image or a
verified successful configure/build. It requires no system install or sudo.
Build/install disk consumption is unmeasured. If configure reveals another
dependency, stop and report instead of adding sources automatically.
[Prefix and feature options](https://www.postgresql.org/docs/16/install-make.html).

Minimum acquisition alternatives, neither executed:

- Preserve the current network policy: an operator supplies the official source
  tarball and checksum through the existing authorized Library materialization
  route. Validate the returned host before transfer; a different host still
  requires confirmation. Permission to build/install under the workspace remains
  necessary under the current instruction prohibiting installation.
- Direct acquisition: authorize HTTPS for **ftp.postgresql.org only**, solely
  the confirmed16.15 archive and SHA256 companion, plus workspace build/install.
  No Debian, GitHub, Docker registry, wildcard CDN or general internet access is
  justified by this source-build path. A redirect to an unapproved host must stop.

Running the actual tests additionally needs permission for one new disposable
loopback-only cluster/database `dealtwin_test` on55432 or55632 and the existing
harness's synthetic bootstrap/app/reset login roles. Browser testing also needs
ephemeral signed Judge sessions. These are local test credentials, not external
accounts, but the current no-credential instruction still prohibits their creation.
Do not replace them with production/private database credentials or weaken RLS.

## Browser: platform prerequisite versus project configuration

The installed system sandbox helper remains nobody:nogroup, mode4755. Its
previous sandbox-preserving launch aborted at the helper ownership check.
This is an execution-image/ownership-mapping prerequisite, independent of the
DealTwin page. The deeper platform cause and any subsequent namespace/seccomp
failure are not established. Repairing ownership alone is not claimed sufficient.
[Chromium sandbox documentation](https://chromium.googlesource.com/chromium/src/%2B/e93cf0b8/docs/linux_suid_sandbox_development.md).

The locked Playwright1.64.0 expects Chromium156.0.8078.4, revision1248; its
documented executable path is absent. System Chromium154 is a different build.
No browser/computer/Node-REPL runner tool is callable in this session. Installed
runtime documentation describes a supported `cua` browser API, but documentation
and package presence do not create tool availability. Private profiles/configuration
were not inspected, and no ad hoc CDP connection or runtime entrypoint was invoked.

The installed package names `cdn.playwright.dev` as the Chromium-for-Testing
download entry host. The final redirect hosts and byte size have **not** been
resolved from authoritative metadata, so no complete browser-download allowlist
or size is asserted. Generic package mirror names are not permission requests.
Do not guess CDN hosts or run the installer to discover a denial.

Minimum platform action: expose a supported sandboxed browser API that can reach
the authorized loopback app, or provision a Playwright-compatible browser runtime
with working sandbox support in this same environment. No replacement task or
container is requested. The platform owner must handle image/namespace/ownership
constraints; this agent must not change setuid ownership/mode, kernel/seccomp
settings, or disable sandboxing. A browser download alone is not a demonstrated fix.
A manual supported-browser inspection also does not automatically execute the
existing Playwright regression suite.

A separate project configuration defect was found: Playwright defaults
`chromiumSandbox` tofalse and its installed code adds the disabling flag unless
explicitly true. Checkpoint **7287630627c32f37f67ca8914e40ac28473c28ea** now
requires `launchOptions: { chromiumSandbox: true }`. It preserves the fail-closed
runtime boundary and makes no OS/browser launch or platform security change.
One configuration-contract regression failed before the edit and passed after;
focused ESLint and typecheck also pass. The test parses TypeScript without
executing the config's session-key generation/bootstrap. No green product suite
was repeated. [Playwright's documented default](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox).

## Remaining test inventory

- **25 PostgreSQL-dependent Vitest files** remain unrun:13 postgres,8 API,
  3 MCP and1 benchmark integration. Exact paths remain in the prior
  [selection manifest](evidence/cloud-recovered-20261018/test-selection-final.json).
- **1 Playwright suite file,11 expanded cases** remains unrun:10 use a browser;
  1 is HTTP-request-only. All are gated by the suite's real database/bootstrap.
  The cases include390/1440 navigation and1440/820/1024 durable journeys.
  Counts came from AST inspection, not `playwright --list`, because loading the
  config would create an ephemeral signing key.
- The earlier97-file/1,037-test pass retains its original source scope. This
  checkpoint adds only the one focused configuration test; it does not claim a
  new full1,038-test run or any browser/transaction pass.

## Sites target and deliverable

`docs/dealtwin/DEPLOYMENT.md` explicitly identifies Node/PostgreSQL Judge as the
supported private target. `npm run judge:build` does not need hosting metadata.
The preserved Cloudflare/Sites target is a separate optional runtime for that
local Judge deliverable, and `.openai/hosting.json` is needed only when configuring
that target. No metadata needs to be invented to continue Judge validation.

However, current CI and Task29 still require both builds. The missing Sites
configuration therefore remains an unclosed repository release gate; this
diagnosis does not waive it. No supplied hackathon rule requires Sites specifically,
and no external submission/hosted-URL requirement was verified. Do not infer
competition readiness or deployment authorization from the Node build.

Evidence: [runtime-options-20261018](evidence/runtime-options-20261018).
All runtime-enabling actions are **pending, not denied**, with no uncertain
mutation result and no automatic approval rejection. No push, merge, deploy,
production access or final video was performed. Task29 remains PARTIAL.
