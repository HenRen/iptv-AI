# HENREN IPTV

A bring-your-own-playlist IPTV web application. Connect an Xtream Codes
account, an M3U URL or an uploaded playlist file, and get Live TV, a real
programme guide, movies and series in a dark, remote-friendly television
interface.

This is a **player**. It carries no content of its own and performs no DRM
circumvention or access-control bypass — it plays streams the user's own
provider has authorized.

---

## Quick start

```bash
npm install
cp .env.example .env.local          # then set HENREN_SECRET
npm run dev                         # http://localhost:3000
```

On first launch you get the connection screen. To look around without a
provider, choose **“Explore with sample data instead”** — the mock provider
gives you 30 channels, 48 hours of guide data, 20 movies and 10 series, all
of it running through the same normalization pipeline as real data.

```bash
npm run typecheck   # tsc --noEmit
npm test            # 168 unit tests
npm run build       # production build
npm run test:e2e    # 36 Playwright journeys against the mock provider
npm run test:all    # all of the above, in order
```

`HENREN_SECRET` encrypts stored provider credentials at rest. It is required
in production; a fixed development key is used when it is unset.

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

Everything goes through `StorageAdapter`. v1 ships `FileStorageAdapter`
(atomic JSON writes under `.data/`). Moving to PostgreSQL means implementing
that interface once — no call sites change.

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

```
src/
  app/
    (app)/            shell + screens (home, live, guide, movies, series, …)
    api/              catalog, epg, search, play, stream, image, diagnostics
    welcome/          first-launch connection flow
  components/
    common/           Focusable, Artwork, Rail, skeletons
    live/ guide/ player/ vod/ navigation/ onboarding/
  lib/
    iptv/             adapters, normalization, catalog, IPTVService
      xtream/ m3u/ xmltv/ mock/
    ai/               AIProvider interface, rules + OpenAI providers
    player/           engine selection
    security/         crypto, SSRF guard, rate limiting
    storage/          StorageAdapter + file implementation
  stores/             zustand: playlist, player, user
  hooks/              spatial nav, virtual list, debounce
tests/                parsers, normalization, matching, search, security
```

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
- `npm test` covers the parsers, normalizer, EPG matcher, search index,
  crypto, SSRF guard, manifest rewriting and every AI service.
  `npm run test:e2e` drives the §35 journeys in a real browser, including
  the AI layer's grounding guarantees and the security boundaries.
