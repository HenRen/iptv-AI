# StreamWise

**Your TV. Your content. Smarter.**

A bring-your-own-playlist IPTV web application. Connect an Xtream Codes
account, an M3U URL or an uploaded playlist file, and get Live TV, a real
programme guide, movies, series and a sports hub in a television-first
interface built to the StreamWise design system.

This is a **player**. It carries no content of its own and performs no DRM
circumvention or access-control bypass — it plays streams the user's own
provider has authorized.

---

## Quick start

```bash
npm install                         # npm workspaces; installs all three packages
cp apps/web/.env.example \
   apps/web/.env.local              # then set HENREN_SECRET
npm run dev                         # http://localhost:3000
```

On first launch you get the connection screen. To look around without a
provider, choose **“Explore with sample data instead”** — the mock provider
gives you 30 channels, 48 hours of guide data, 20 movies and 10 series, all
of it running through the same normalization pipeline as real data.

```bash
npm run typecheck   # all three packages
npm test            # 252 unit tests (166 in core, 86 in server)
npm run build       # standalone API bundle, then the Next.js production build
npm run test:e2e    # 38 Playwright journeys against the mock provider
npm run test:all    # all of the above, in order

npm run serve:api   # the API on its own, without Next.js — what a TV app talks to
```

`HENREN_SECRET` encrypts stored provider credentials at rest. It is required
in production; a fixed development key is used when it is unset. Next.js
reads `.env.local` from the app directory, so it belongs in `apps/web/` —
the standalone API server takes the same variables from its process
environment instead.

---

## What is built

| Phase | Area | State |
|---|---|---|
| 1 | Architecture + design system | done |
| 2 | Connection manager (Xtream / M3U URL / file upload) | done |
| 3 | Xtream Codes integration | done |
| 4 | M3U parser | done |
| 5 | Normalized data layer + adapters | done |
| 6 | Live TV | done |
| 7 | Video player | done |
| 8 | EPG / TV Guide | done |
| 9–10 | Movies and Series | browse, detail, playback, resume |
| 11 | Search, favorites, history, continue watching | done |
| 12 | Remote / keyboard navigation | done |
| 13 | Performance (virtualization, indexed search) | done |
| 14 | Security hardening | done |
| 15 | Testing + diagnostics | done |
| 16 | AI layer | all 12 features, on a rules provider; no model wired |

**Phase 16 detail** — every item is implemented and tested:

| | Feature | Where |
|---|---|---|
| AI 1 | Ask TV assistant | `components/ai/AskTV.tsx`, `lib/ai/assistant/IntentService.ts` |
| AI 2 | Smart playlist organizer | `lib/ai/classification/ClassificationService.ts` |
| AI 3 | Smart groups | `lib/ai/recommendations/RecommendationService.ts` |
| AI 4 | Personalized home | `components/ai/SmartRails.tsx` |
| AI 5 | Sports intelligence | `lib/ai/epg/SportsIntelligence.ts`, `components/ai/SportsTonight.tsx` |
| AI 6 | Smart EPG matching | `lib/ai/epg/EPGMatchingService.ts` |
| AI 7 | Programme explanations | `components/ai/WhyWatch.tsx` |
| AI 8 | Voice remote | `lib/ai/voice/useVoiceInput.ts` |
| AI 9 | Semantic search | `lib/ai/search/SemanticSearchService.ts` |
| AI 10 | Smart watchlist | `lib/ai/assistant/WatchlistService.ts` |
| AI 11 | AI diagnostics | `lib/ai/diagnostics/PlaylistHealthService.ts` |
| AI 12 | Playlist clean view | `PlaylistHealthService.cleanView()` |

Also complete: parental control (PIN, adult filter, hidden categories),
audio/subtitle/quality track selection, and the AI & Privacy settings screen.

Not built: catch-up/archive playback and multi-user accounts.

---

## The design system

Implemented from `IPTV AI Prototype.dc.html`, `IPTV Icon System.dc.html`,
`PROTOTYPE.md` and `INTEGRATION.md`.

### The icon language is generated, not drawn

`packages/core/src/design/icons.ts` ports the icon system's three primitives
and builds all 69 icons from them. It lives in core rather than in the web
app because the paths it emits are plain strings: `react-native-svg` renders
them verbatim and Lightning rasterises them to textures, so the icon family
ports to a TV build essentially for free.

| | Primitive | Role |
|---|---|---|
| 01 | **Broadcast Frame** | 16:9 rounded geometry — the shared DNA. Never a literal TV outline. |
| 02 | **The Signal Cut** | one diagonal interruption in every frame — the fingerprint for signal. |
| 03 | **Intelligence Node** | a four-point constellation shared by the whole AI sub-family. Never a sparkle. |

Because the paths are *generated* rather than hand-drawn, changing the frame
radius once changes every icon built on it. Stroke stays 1.6 at every size
(1.8 on focus) — a family whose stroke thickens with size stops reading as one
family. There is no second icon library in the codebase; the utility glyphs
the app needed beyond the original sheet (close, check, chevrons) are
constructed from the same rules.

### Two decisions carry the identity

- **One accent.** Cobalt `#5B8CFF` is used for interaction *and* for AI.
  There is no separate "AI colour" and no gradient — intelligence is signalled
  by the Intelligence Node in the icon, not by hue.
- **Focus is a white ring, not a coloured one.** At three metres a white ring
  plus a small scale reads instantly where a tinted glow does not. Every
  focusable goes through one primitive so the treatment cannot drift.

Palette: ground `#0A0F1E` / `#070B16`, surfaces `#0D1424` / `#111A31`, live
`#FF6B5E`, success `#4FD197`, text `#E8ECF6` → `#8A94AC` → `#69748E`.
Type: Space Grotesk. Motion: sidebar 200ms, focus 140ms, overlays 220ms, zap
overlay 3s auto-dismiss.

### Remote control

| Input | Action |
|---|---|
| Arrows | Spatial focus navigation |
| OK (tap) | Select |
| **OK (hold ≥600ms)** | Quick Actions for the focused channel or programme |
| Back / Escape | error → quick action → fullscreen → last channel → history → home |
| R / G / Y / B | Colour keys, remappable in Settings › Remote & Controls |
| CH± / Page± | Zap |

The colour-key legend in the top bar is the on-screen map of the remote's four
buttons and reflects the user's own mapping. Long-press is handled once in the
shell; a screen only declares *what* the target is with `data-qa-*`
attributes.

---

## Architecture

### Nothing in the UI knows what a provider is

Provider payloads enter through an adapter and leave as the entities in
`src/types/index.ts`. No component imports an Xtream response shape.

```
Xtream player_api ─┐
M3U / M3U8        ─┼─► adapter ─► normalized model ─► IPTVService ─► /api ─► UI
XMLTV             ─┘
```

`IPTVService` is the only thing route handlers call. Adding a provider means
writing an adapter and a branch there.

### The browser never talks to your provider

This is the central design decision, and it solves four problems at once:

| Problem | Why the proxy fixes it |
|---|---|
| Xtream puts your username and password **in the stream URL path** | The browser is handed `/api/stream?t=<signed token>`; the real URL is built server-side at request time |
| Providers are usually plain HTTP; a deployed app is HTTPS | Mixed content never arises — the page only ever calls its own origin |
| Providers rarely send CORS headers | Same-origin requests only |
| Provider artwork is slow, broken or HTTP | Proxied, size-capped, type-checked, with a designed fallback |

The proxy is **not** an open proxy:

- targets come from an HMAC-signed, expiring token this server minted — a
  caller cannot supply an arbitrary URL;
- the resolved host must belong to the referenced playlist;
- DNS is re-resolved per request and private/loopback/metadata ranges are
  refused, so a provider hostname cannot be repointed at `169.254.169.254`;
- requests are rate-limited per client.

HLS manifests are rewritten on the way through, so segment and key URIs also
route back through the proxy rather than leaking the provider URL.

### Credentials

- Stored encrypted at rest (AES-256-GCM) under `.data/secrets/`, separate
  from the public playlist record.
- Decrypted only inside a server route that is about to call the provider.
- Never serialized into any client response — `DiagnosticsReport` has no
  field for them.
- Every error passes through `redact()` before it reaches a client.
- The AI layer has `assertNoSecrets()` as a last line of defence.

### Playback

Browsers natively play very little of what IPTV providers serve:

| Container | Engine |
|---|---|
| HLS | native on Safari/tvOS, otherwise `hls.js` |
| MPEG-TS (Xtream live default) | `mpegts.js` — transmuxes to fMP4 in a worker |
| MP4 | native |
| MKV | native where the browser allows it, otherwise reported honestly |

Live streams keep a second candidate in reserve: HLS is tried first and falls
back to the `.ts` variant automatically, because providers routinely serve one
and 404 the other.

One `<video>` element lives in the app shell and is never unmounted. That is
what lets a channel keep playing while you browse the guide, and what makes
zapping feel instant.

### Performance at 50,000 entries

- The full catalogue stays on the server. The client asks for a category, a
  page, or a search result and receives a few hundred rows.
- Channel lists and the guide grid are both virtualized.
- Search uses a prebuilt inverted prefix index — a keystroke is a map lookup
  and a small intersection, not a scan. (Benchmarked in the test suite at
  50,000 items.)
- EPG is fetched only for rows currently on screen, batched per window.
- Catalogue and guide snapshots are cached to disk and memoized in-process.

### Persistence

Everything goes through `StoragePort`. The server ships `FileStorageAdapter`
(atomic JSON writes under `.data/`); a TV build binds MMKV or AsyncStorage.
Moving to PostgreSQL means implementing that interface once — no call sites
change, in any of the apps.

### The AI layer

The governing rule, enforced structurally rather than by prompt:

> AI decides **what the user may want**.
> The IPTV engine decides **what actually exists**.
> The player decides **what can actually play**.

- Actions come from a fixed allowlist (`INTENT_ACTIONS`); anything else is
  dropped, not sanitized.
- A model may not return a playable id. Ids it echoes are honoured only if
  the caller already supplied them as candidates.
- Rankings may reorder candidates, never add to them.
- Titles, times and fixtures from a model are discarded — the guide is the
  only source of programme data.
- With no provider configured you get `MockAIProvider`, which is not a stub:
  playlist normalization, genre classification, EPG matching and command
  parsing are deterministic rules that work identically with or without a
  model.

---

## Remote control

Arrow keys use **geometric** spatial navigation — the nearest focusable in
the pressed direction, weighted for alignment — rather than DOM order, which
is wrong the moment a layout has a sidebar beside a grid.

| Key | Action |
|---|---|
| Arrows | Move focus |
| Enter | Activate |
| Escape / Backspace / Back | Leave fullscreen, then last channel on Live TV, then history |
| Page Up / Down, Channel Up / Down | Zap |
| Space / Play-Pause | Play / pause |

Hover moves focus too, so mouse and remote never disagree about where “here”
is.

---

## Project layout

A monorepo, so that a Lightning app and a React Native TV app can be added
later without either of them forking the business logic. Nothing about the
web app changed in behaviour when it was split out; what changed is that
6,100 lines of it are now platform-free.

```
packages/
  core/               @streamwise/core — no DOM, no platform APIs, no Node
    src/
      ports/          StoragePort, CryptoPort, HttpPort, UrlGuardPort,
                      SecureStorePort + configureCore()
      iptv/           adapters, normalization, catalog, IPTVService
        xtream/ m3u/ xmltv/ mock/
      ai/             AIProvider interface, rules + OpenAI providers
      design/         tokens (colour, spacing, motion) + the icon generator
      client/         ApiClient — the only network surface a TV app has
      testing/        the port contracts, as cases any platform can run
      types/ utils/
      host.d.ts       the WHATWG globals core assumes, and nothing more
    tests/            parsers, normalization, matching, search, AI, conformance
    README.md         every port and its web implementation

  server/             @streamwise/server — the API, deployable on its own
    src/
      routes/         catalog, epg, search, play, stream, image, diagnostics…
      security/       node crypto, SSRF guard, rate limiting
      storage/        FileStorageAdapter
      runtime.ts      the one place core is bound to Node
      standalone.ts   the same handlers over node:http, for TV clients
    tests/            the real cipher, the real HMAC, the private-range table,
                      port conformance, and a reference client end to end

apps/
  web/                @streamwise/web — the Next.js application
    src/
      app/
        (app)/        shell + screens (home, live, guide, movies, series, …)
        api/          thin bindings onto @streamwise/server/routes/*
        welcome/      first-launch connection flow
      components/     common, live, guide, player, vod, navigation, icons
      stores/         zustand: playlist, player, user
      hooks/          spatial nav, virtual list, debounce
      lib/            api client, player engine selection, cn, voice input
    e2e/              §35 Playwright journeys
```

### Why the split

The same catalogue, EPG and AI code has to run in a Next.js route, a
standalone Node server, a WebGL scene graph and a React Native TV app. It can
only do that if it never mentions `fs`, `crypto`, `fetch`, `document` or
`process` — so it does not. Everything the platform provides arrives through
a port, installed once at start-up; see `packages/core/README.md` for the
table.

The SSRF guard and the rate limiter deliberately did **not** move into core.
They protect a proxy, and a proxy is a server.

An interface alone does not make two implementations agree, so the port
contracts ship as runnable cases in `@streamwise/core/testing`. The Node
adapters pass all four suites; a Lightning or React Native binding runs the
same cases against MMKV, Keychain or its own fetch and finds out where it
differs before the screens are built.
`packages/server/tests/reference-client.test.ts` closes the loop: it drives
the standalone API through core's `ApiClient` with no React, no Next.js and
no browser anywhere in the process.

---

## Notes for the next session

- **Real-provider verification is still outstanding.** Everything here was
  verified end-to-end against the mock provider and an uploaded M3U; the
  build environment cannot reach an external IPTV host. Connect your real
  provider through the UI and check: authentication, channel counts, logos,
  live playback, movie playback, series episode lists, EPG coverage.
- Six bugs found and fixed during verification, each with a regression test:
  a missing query parameter defaulted to `limit: 0` (silently making search
  return nothing); quality variants sharing a `tvg-id` produced two
  interleaved mock schedules; `ContentGenre` had `entertainment` and
  `international` values no rule could ever produce, so mainstream channels
  fell to `other` and emptied the Home genre rails; sports detection missed
  bare fixture titles like "Ajax - PSV" and spelled-out "Formula One"; the
  catalog and EPG rate limits were too tight for the guide's per-scroll
  fetching; and Back on Live TV with no previous channel navigated out of the
  application entirely.
- The redesign kept every service call: this was a UI layer swap onto the
  existing, tested backend, not a rewrite.
- `npm test` covers the parsers, normalizer, EPG matcher, search index,
  crypto, SSRF guard, manifest rewriting and every AI service.
  `npm run test:e2e` drives the §35 journeys in a real browser, including
  the AI layer's grounding guarantees and the security boundaries.
