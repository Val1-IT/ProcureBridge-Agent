# Dependency triage — package inventory

Input:22 package aggregates,32 distinct advisory URLs. Package severity is inherited through dependency edges; it is not a count of unique exploits. All22 original inputs are preserved in triage-result.json.

| Package | Direct? | Installed before → after | Actual exposure / remaining condition |
|---|---|---|---|
| `@cloudflare/vite-plugin` | yes | 1.37.1 → 1.37.1 | Cloudflare tooling HTTP/WebSocket client; still in npm audit |
| `@esbuild-kit/core-utils` | transitive | 3.3.2 → 3.3.2 | Build/test transformation, migration CLI; still in npm audit |
| `@esbuild-kit/esm-loader` | transitive | 2.6.5 → 2.6.5 | Build/test transformation, migration CLI; still in npm audit |
| `@next/eslint-plugin-next` | transitive | 15.5.28 → 15.5.28 | Lint/build pattern processing; still in npm audit |
| `@vitest/coverage-v8` | yes | 3.2.7 → 3.2.7 | Test runner/optional mock WebSocket API; still in npm audit |
| `@vitest/mocker` | transitive | 3.2.7 → 3.2.7 | Test runner/optional mock WebSocket API; still in npm audit |
| `braces` | transitive | 3.0.3 → 3.0.3 | Lint/build pattern processing; still in npm audit |
| `drizzle-kit` | yes | 0.31.10 → 0.31.10 | Build/test transformation, migration CLI; still in npm audit |
| `esbuild` | transitive | 0.18.20, 0.25.12, 0.27.3, 0.28.0 → 0.18.20, 0.25.12, 0.27.3, 0.28.1 | Build/test transformation, migration CLI; still in npm audit |
| `eslint-config-next` | yes | 15.5.28 → 15.5.28 | Lint/build pattern processing; still in npm audit |
| `fast-glob` | transitive | 3.3.1, 3.3.3 → 3.3.1, 3.3.3 | Lint/build pattern processing; still in npm audit |
| `micromatch` | transitive | 4.0.8 → 4.0.8 | Lint/build pattern processing; still in npm audit |
| `miniflare` | transitive | 4.20260515.0 → 4.20260515.0 | Cloudflare tooling HTTP/WebSocket client; still in npm audit |
| `sharp` | transitive | 0.34.5 → 0.34.5, 0.35.5 | Node production-installed optional dependency and Cloudflare image tooling; still in npm audit |
| `tinypool` | transitive | 1.1.1 → 1.1.1 | Test runner/optional mock WebSocket API; still in npm audit |
| `undici` | transitive | 7.24.8 → 7.29.1 | Cloudflare tooling HTTP/WebSocket client; external installed package no longer reported; bundled copies assessed separately |
| `vinext` | yes | 0.0.50 → 0.0.50 | Lint/build pattern processing; still in npm audit |
| `vite-plugin-commonjs` | transitive | 0.10.4 → 0.10.4 | Lint/build pattern processing; still in npm audit |
| `vite-plugin-dynamic-import` | transitive | 1.6.0 → 1.6.0 | Lint/build pattern processing; still in npm audit |
| `vitest` | yes | 3.2.7 → 3.2.7 | Test runner/optional mock WebSocket API; still in npm audit |
| `wrangler` | yes | 4.92.0 → 4.92.0 | Cloudflare tooling HTTP/WebSocket client; still in npm audit |
| `ws` | transitive | 8.18.0 → 8.21.0 | Cloudflare development HMR/worker WebSockets; external installed package no longer reported; bundled copies assessed separately |

## Advisory-specific evidence

The npm registry report supplies identifiers, titles, severity, affected ranges and upstream URLs. Preconditions below combine that synopsis with installed-source inspection; they are not full upstream advisory quotations or end-to-end exploit validation. External GitHub pages were not fetched under the registry-only network constraint. Fixed-version entries are the first version outside the recorded affected range; only selected fix candidates were separately verified in registry metadata.

### GHSA-82fw-gwwq-j7x9 — vitest

[Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) — moderate; affected `>=2.1.0 <4.1.11`.
Condition: Client can reach a configured Vitest mock-interceptor WebSocket, register a redirect URL, then request its module; redirect handler reads the resolved path without equivalent filesystem containment.
First fixed/candidate: **4.1.11**.

### GHSA-vfj7-8cjw-p6xm — braces

[braces vulnerable to stack-exhaustion denial of service through deeply nested patterns](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) — high; affected `<=3.0.3`.
Condition: Attacker controls a deeply nested brace/glob pattern passed to braces; recursive parsing/compilation can exhaust the call stack.
First fixed/candidate: **No published fixed braces version; registry latest3.0.3 is affected**.

### GHSA-67mh-4wv8-2f99 — esbuild

[esbuild enables any website to send any requests to the development server and read the response](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — moderate; affected `<=0.24.2`.
Condition: esbuild serve API must be active; a user visits an attacker website which reads local development-server responses through permissive CORS.
First fixed/candidate: **0.25.0**.

### GHSA-g7r4-m6w7-qqqr — esbuild

[esbuild allows arbitrary file read when running the development server on Windows](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) — low; affected `>=0.27.3 <0.28.1`.
Condition: esbuild development server on Windows must serve attacker-selected filesystem requests; Windows path handling is the claimed boundary.
First fixed/candidate: **0.28.1**.

### GHSA-f88m-g3jw-g9cj — sharp

[sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) — high; affected `<0.35.0`.
Condition: Untrusted image bytes reach affected bundled libvips loaders; four underlying CVEs are named in this single advisory record. Exact format-specific prerequisites need upstream detail.
First fixed/candidate: **0.35.0**.

### GHSA-rgj7-g3m4-5g8c — sharp

[sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) — high; affected `<0.35.4`.
Condition: Untrusted HEIF/AVIF media reaches vulnerable libheif decoding in the selected native sharp/libvips build; registry record references two upstream advisories.
First fixed/candidate: **0.35.4**.

### GHSA-wq5f-xc86-pv6w — sharp

[sharp : Vulnerability in librsvg dependency CVE-2026-96889](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) — high; affected `<0.35.5`.
Condition: Untrusted SVG reaches the affected librsvg native decoder, with a use-after-free condition; exact malformed input is not provided in registry synopsis.
First fixed/candidate: **0.35.5**.

### GHSA-5gmw-xhrv-c9v3 — tinypool

[Tinypool: Prototype Pollution gadget in worker options leads to Remote Code Execution](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) — critical; affected `<=2.1.0`.
Condition: A prior prototype-pollution primitive controls inherited worker options in the same process before Tinypool spawns a worker; worker execution then consumes them.
First fixed/candidate: **2.1.1**.

### GHSA-85c8-ppgw-ccpr — tinypool

[Tinypool: Prototype Pollution Gadget to RCE in run() options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) — critical; affected `<2.1.2`.
Condition: A prior prototype-pollution primitive controls inherited run() options such as filename/name/runtime; affected Tinypool destructures these options.
First fixed/candidate: **2.1.2**.

### GHSA-vmh5-mc38-953g — undici

[undici vulnerable to TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent](https://github.com/advisories/GHSA-vmh5-mc38-953g) — high; affected `>=7.23.0 <7.28.0`.
Condition: SOCKS5 ProxyAgent is configured with custom requestTls options; forwarding drops options needed for intended certificate validation.
First fixed/candidate: **7.28.0**.

### GHSA-p88m-4jfj-68fv — undici

[undici vulnerable to HTTP header injection via Set-Cookie percent-decoding](https://github.com/advisories/GHSA-p88m-4jfj-68fv) — moderate; affected `>=7.0.0 <7.28.0`.
Condition: Attacker-controlled Set-Cookie data is parsed with percent decoding and then propagated as HTTP header/cookie data.
First fixed/candidate: **7.28.0**.

### GHSA-vxpw-j846-p89q — undici

[undici WebSocket client vulnerable to denial of service via fragment count bypass](https://github.com/advisories/GHSA-vxpw-j846-p89q) — high; affected `>=7.0.0 <7.28.0`.
Condition: An untrusted WebSocket peer sends fragmented messages that bypass the client fragment-count resource limit.
First fixed/candidate: **7.28.0**.

### GHSA-hm92-r4w5-c3mj — undici

[undici vulnerable to cross-origin request routing via SOCKS5 proxy pool reuse](https://github.com/advisories/GHSA-hm92-r4w5-c3mj) — high; affected `>=7.23.0 <7.28.0`.
Condition: Multiple target origins share a SOCKS5 proxy pool; attacker-influenced routing interacts with pool reuse.
First fixed/candidate: **7.28.0**.

### GHSA-g8m3-5g58-fq7m — undici

[undici vulnerable to Set-Cookie SameSite attribute downgrade via permissive substring matching](https://github.com/advisories/GHSA-g8m3-5g58-fq7m) — low; affected `>=7.0.0 <7.28.0`.
Condition: An untrusted Set-Cookie SameSite attribute containing, rather than equalling, a valid token reaches cookie parsing.
First fixed/candidate: **7.28.0**.

### GHSA-pr7r-676h-xcf6 — undici

[undici vulnerable to cross-user information disclosure via shared cache whitespace bypass](https://github.com/advisories/GHSA-pr7r-676h-xcf6) — moderate; affected `>=7.0.0 <7.28.0`.
Condition: A shared HTTP cache interceptor receives attacker-controlled Cache-Control whitespace that bypasses private-response handling.
First fixed/candidate: **7.28.0**.

### GHSA-8xcm-r25x-g524 — undici

[undici vulnerable to downstream response desynchronization via retry interceptor](https://github.com/advisories/GHSA-8xcm-r25x-g524) — moderate; affected `>=7.0.0 <7.29.0`.
Condition: A retry interceptor forwards responses across a downstream HTTP boundary; attacker-influenced response framing causes desynchronization.
First fixed/candidate: **7.29.0**.

### GHSA-4cwx-7wf7-3272 — undici

[undici vulnerable to cross-user information disclosure and parse-time crash via degenerate private cache directives](https://github.com/advisories/GHSA-4cwx-7wf7-3272) — high; affected `>=7.0.0 <7.29.0`.
Condition: Shared cache processing receives degenerate private directives, producing disclosure or a parse-time failure.
First fixed/candidate: **7.29.0**.

### GHSA-m8rv-5g2x-5cg5 — undici

[undici vulnerable to CRLF Injection via blob-like body 'type' property](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) — moderate; affected `>=7.0.0 <7.29.0`.
Condition: An attacker influences a blob-like body type property containing CR/LF and it is serialized as a request Content-Type.
First fixed/candidate: **7.29.0**.

### GHSA-jr45-8vmc-qm54 — undici

[undici vulnerable to cross-user information disclosure via whitespace around equals in Cache-Control directives](https://github.com/advisories/GHSA-jr45-8vmc-qm54) — moderate; affected `>=7.0.0 <7.29.0`.
Condition: Shared cache parses attacker-controlled whitespace around Cache-Control equals signs inconsistently.
First fixed/candidate: **7.29.0**.

### GHSA-v3r7-h72x-cjcm — undici

[undici vulnerable to cookie attribute injection via unsanitized domain and unparsed setCookie fields](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) — moderate; affected `>=7.0.0 <7.29.0`.
Condition: Attacker influences domain/unparsed cookie fields that setCookie serializes into response attributes.
First fixed/candidate: **7.29.0**.

### GHSA-35p6-xmwp-9g52 — undici

[undici vulnerable to HTTP response queue poisoning via keep-alive socket reuse](https://github.com/advisories/GHSA-35p6-xmwp-9g52) — low; affected `>=7.0.0 <7.28.0`.
Condition: Attacker-controlled timing/framing intersects keep-alive socket reuse and response queue assignment.
First fixed/candidate: **7.28.0**.

### GHSA-pmjh-fq2x-6v4x — undici

[undici vulnerable to Denial of Service via orphaned RetryHandler response body](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) — moderate; affected `>=7.11.0 <7.29.1`.
Condition: A retry handler leaves an attacker-controlled response body orphaned, retaining resources across retries.
First fixed/candidate: **7.29.1**.

### GHSA-r53p-7pc4-xj5r — undici

[undici vulnerable to downstream response splitting via retry interceptor](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) — low; affected `>=7.0.0 <7.29.1`.
Condition: Retry interceptor response forwarding mishandles framing across a downstream HTTP boundary.
First fixed/candidate: **7.29.1**.

### GHSA-rfgv-xxqx-mfg5 — undici

[undici vulnerable to Denial of Service via unrequested WebSocket subprotocol](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) — high; affected `>=7.0.0 <7.29.1`.
Condition: A WebSocket server replies with an unrequested subprotocol; the client error path can terminate the process.
First fixed/candidate: **7.29.1**.

### GHSA-3xpg-4rpp-hhhm — undici

[undici vulnerable to Denial of Service via unbounded decompression of compressed responses](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) — moderate; affected `>=7.15.0 <7.29.1`.
Condition: HTTP response decompression processes an untrusted compressed response without a sufficient expanded-size bound.
First fixed/candidate: **7.29.1**.

### GHSA-2jfj-6hjv-fm6j — undici

[undici vulnerable to cross-user cookie disclosure via Set-Cookie caching in shared caches](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) — moderate; affected `>=7.0.0 <7.29.1`.
Condition: A shared cache stores/replays Set-Cookie responses across users.
First fixed/candidate: **7.29.1**.

### GHSA-2gqq-gqf2-x968 — undici

[undici vulnerable to response truncation via oversized chunked responses in the dump interceptor](https://github.com/advisories/GHSA-2gqq-gqf2-x968) — low; affected `>=7.1.0 <7.29.1`.
Condition: Dump interceptor receives an oversized chunked response; failure/truncation handling crosses the response boundary.
First fixed/candidate: **7.29.1**.

### GHSA-w293-vg96-wgc3 — undici

[undici vulnerable to TLS certificate validation bypass via dropped connect options in BalancedPool](https://github.com/advisories/GHSA-w293-vg96-wgc3) — high; affected `>=7.24.1 <7.29.1`.
Condition: BalancedPool is configured with custom TLS connect options; dropping options changes intended certificate validation.
First fixed/candidate: **7.29.1**.

### GHSA-8436-99hf-9mmv — undici

[undici vulnerable to caching and replay of unsafe HTTP method responses](https://github.com/advisories/GHSA-8436-99hf-9mmv) — low; affected `>=7.0.0 <7.29.1`.
Condition: Shared cache caches/replays unsafe HTTP method responses under attacker-influenced traffic.
First fixed/candidate: **7.29.1**.

### GHSA-rx4f-c7p8-82vq — undici

[undici vulnerable to Denial of Service via WebSocketStream unclean close](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) — moderate; affected `>=7.0.0 <7.29.1`.
Condition: An untrusted WebSocketStream peer closes uncleanly and triggers a process-level error path.
First fixed/candidate: **7.29.1**.

### GHSA-58qx-3vcg-4xpx — ws

[ws: Uninitialized memory disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) — moderate; affected `>=8.0.0 <8.20.1`.
Condition: A privileged/in-process caller supplies unsafely sized or mutable send buffers, exposing uninitialized memory to a WebSocket peer; exact API constraints need full upstream advisory.
First fixed/candidate: **8.20.1**.

### GHSA-96hv-2xvq-fx4p — ws

[ws: Memory exhaustion DoS from tiny fragments and data chunks](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) — high; affected `>=8.0.0 <8.21.0`.
Condition: An untrusted WebSocket peer sends many tiny fragments/chunks below byte-oriented limits; object/buffer overhead exhausts memory.
First fixed/candidate: **8.21.0**.
