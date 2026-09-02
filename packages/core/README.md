# @streamwise/core

Everything the StreamWise apps share: IPTV adapters, normalization, the
catalogue and search index, EPG matching, the twelve AI services, the domain
types, the design tokens and the icon generator.

No DOM. No platform APIs. No Node built-ins. `tsconfig.json` compiles this
package with `"lib": ["ES2022"]` and `"types": []`, so `document`, `window`,
`process`, `Buffer` and `fs` are not merely discouraged here — they do not
exist, and using one is a compile error.

```bash
npm run typecheck -w @streamwise/core   # src under ES2022-only, then tests
npm test -w @streamwise/core            # 166 unit tests, conformance included
```

## Ports

Everything the platform has to provide arrives through one call, at process
start, and nothing in core reaches around it:

```ts
import { configureCore } from '@streamwise/core';

configureCore({ storage, crypto, http, urlGuard /*, secureStore, config */ });
```

There is no default implementation for any of them, on purpose: a missing
binding fails loudly at the first call rather than silently persisting to
nowhere.

| Port | What it is for | Web / server implementation |
| --- | --- | --- |
| `StoragePort` | JSON documents (playlists, settings, favourites) and blobs (catalogue and EPG snapshots). `Uint8Array`, not `Buffer`. | `FileStorageAdapter` — atomic JSON and blob files under `.data/`. `@streamwise/server/storage/file` |
| `CryptoPort` | `seal`/`open` for the credential envelope, `signToken`/`verifyToken` for proxy URLs, `randomId`. Synchronous. | `nodeCryptoPort` — AES-256-GCM and HMAC-SHA256 over `node:crypto`, keyed by `HENREN_SECRET`. `@streamwise/server/security/nodeCrypto` |
| `HttpPort` | Outbound provider requests, with a hard timeout that actually aborts the socket. | `nodeHttpPort` — global `fetch` plus an `AbortController`. `@streamwise/server/http` |
| `UrlGuardPort` | Clearing a URL before the proxy fetches it: scheme allowlist, host allowlist, DNS re-resolution, private-range rejection. | `nodeUrlGuardPort` — wraps `assertSafeUrl`. `@streamwise/server/security/urlGuard` |
| `SecureStorePort` | Provider credentials at rest. Optional: defaults to a sealed envelope in `StoragePort` via `CryptoPort`. | `sealedSecureStore(storage, crypto)`, the default. On a TV: Keychain (tvOS) or EncryptedSharedPreferences (Android TV). |
| `CoreConfig` | Not a port — the small amount of configuration core reads: `openAiApiKey`, `openAiModel`, `userAgent`. | Read from the environment in `@streamwise/server/runtime`. |

`packages/server/src/runtime.ts` is the only place the web and standalone
builds bind these; a TV app writes its own equivalent and everything above
the line is unchanged.

### Proving an implementation

`@streamwise/core/testing` ships the port contracts as runnable cases, so a
new platform binding does not have to be taken on trust:

```ts
import { storagePortCases, cryptoPortCases } from '@streamwise/core/testing';

for (const c of storagePortCases) {
  it(c.name, () => c.run(() => new MmkvStorageAdapter(freshNamespace())));
}
```

They assert the things an interface cannot: that `delete` on a missing key
does not throw, that a blob round-trips bytes no string can carry, that
`seal` is randomised so two playlists with the same password are not
identical at rest, that `verifyToken` returns null for garbage instead of
raising into a route, and that `timeoutMs` actually aborts. Assertions are
hand-rolled — no Vitest, no Jest, no `node:assert` — so the cases run under
whatever a TV build already uses.

`packages/server` runs all four suites against the Node adapters, and
`packages/core` runs the storage and secure-store suites against its
in-memory doubles. The doubles deliberately do **not** run the crypto suite:
`fakeCrypto` is deterministic and unauthenticated, and it should fail those
cases.

### What a TV app has to supply

`StoragePort` (MMKV, AsyncStorage or the platform store), `CryptoPort` and a
`HttpPort` — the last is about forty lines, and
`@streamwise/server/http.ts` is the reference. It should install
`passthroughUrlGuard`: a TV client talks to `@streamwise/server` over HTTP
and proxies nothing itself, so there is no SSRF surface to guard and
pretending otherwise would be theatre.

## Talking to the server

`ApiClient` is the client half, and the only network surface a TV app has.
It is built on `HttpPort`, so it runs wherever core runs, and it takes its
port by argument rather than from `configureCore` — which is what lets a
client and a server share one process:

```ts
import { ApiClient } from '@streamwise/core';

const client = new ApiClient({ http, baseUrl: 'http://tv-backend.lan:3211' });
await client.connectMock();
const page = await client.channels({ limit: 50 });
const source = await client.play('live', page.items[0].id);
player.load(client.resolve(source.url));   // a signed, expiring proxy path
```

`packages/server/tests/reference-client.test.ts` drives the whole journey
this way against the standalone `node:http` API — no React, no Next.js, no
browser. It is the check that the extraction actually produced something a
TV app can consume.

## The host contract

`src/host.d.ts` declares the handful of WHATWG globals core assumes: `URL`,
`URLSearchParams`, `TextEncoder`, `TextDecoder`. Nothing else is in scope.
`fetch`, `Response`, `AbortController` and `setTimeout` are deliberately
absent — outbound HTTP goes through `HttpPort`, so core cannot reach the
network behind the platform's back. Adding to that file is a real decision
about what a TV platform must provide, so keep it short.

## Design

`src/design/tokens.ts` is the source of truth for colour, spacing, radius,
type scale and motion. Tailwind consumes it in `apps/web`; a Lightning theme
and a React Native `StyleSheet` will consume the same numbers, which is what
stops the three apps drifting apart.

`src/design/icons.ts` generates all 69 icons from three primitives — the
broadcast frame, the signal cut and the intelligence node — as SVG path
strings. Those strings are platform-neutral: `react-native-svg` renders them
verbatim and Lightning rasterises them to textures. The stroke is 1.6 at
every size (1.8 on focus) and must not scale with the icon.
