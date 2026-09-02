# @streamwise/tv-lightning

StreamWise for Lightning 3 / Blits. Targets Tizen, webOS, VIDAA, Titan and
the Fire TV browser — five platforms, one codebase, no DOM.

```bash
npm run typecheck -w @streamwise/tv-lightning
npm test -w @streamwise/tv-lightning        # 57 tests
```

## What is here

The parts of L1–L3 that can be finished and verified without a television.

| | |
| --- | --- |
| `src/platform/storage.ts` | `StoragePort` over `localStorage`, which is all any of these runtimes offers. Blobs are base64'd because the store holds strings; `list()` is derived because a key-value store has no directories. |
| `src/platform/http.ts` | `HttpPort` over the runtime's `fetch`, with a timeout that aborts. Every dependency is injected, so the logic is testable off-device. |
| `src/theme.ts` | L2. Core's tokens in the units Lightning wants: `0xAARRGGBB` integers, numbers rather than `'18px'`, and the focus ring rebuilt from its parts. |
| `tests/` | Core's port conformance cases run against both bindings, plus drift tests that fail if the theme stops matching `@streamwise/core`. |

Nothing here edits `packages/core`. Per the plan, core changes land on main
and are pulled — `configureCoreClient` was added there for this branch rather
than worked around here.

## What is deliberately not here

No `@lightningjs/blits` dependency yet, and no scene graph. Adding a
framework whose output cannot be looked at buys an install and a lockfile
entry, not progress. The scaffold lands with L1, on a machine that can run
the emulators.

`hls.js` and `mpegts.js` will not be ported at all: Tizen AVPlay and the
webOS media pipeline decode HLS and MPEG-TS natively, and the transmux stack
exists only because browsers cannot. Likewise `useSpatialNavigation` —
Lightning has its own focus tree.

## What needs hardware, and which hardware

**L7, the video plane, is the item to spike first, and it cannot be spiked
here.**

Video is not in the scene graph. It is a native plane *behind* the WebGL
canvas, shown through a transparent hole punched in it, and the compositing
is done by the platform rather than by Lightning. That makes it the one part
of the port whose behaviour is decided entirely by the vendor's silicon.

The emulators are necessary but **not sufficient**, and this is the trap: an
emulator composites in software, so hole-punching appears to work there and
then z-orders differently, tears, or shows through the wrong rectangle on a
real set. A green emulator run is not evidence.

What the spike needs:

- **A real Samsung set**, ideally mid-range and ~2019 — the plan's
  performance target, and the generation with the least headroom. Developer
  mode on, paired over the LAN from Tizen Studio's Device Manager, plus a
  Samsung developer certificate to sign the `.wgt`.
- **A real LG set**, same vintage, with the Developer Mode app installed and
  `ares-cli` for packaging and installing the `.ipk`. LG's developer sessions
  expire and need re-arming, which is worth knowing before a long session.
- **A host machine** — Linux or macOS — with hardware virtualisation
  available, for the Tizen (QEMU-based) and webOS (VirtualBox-based)
  emulators. Useful for layout and input work; not evidence for L7.
- VIDAA and Titan have their own developer programmes and are the hardest to
  obtain. They are the least urgent: both are web runtimes, so they inherit
  most of the Tizen/webOS work.

Everything else on the branch — L2 through L6, L8, L9 — can be developed
against the emulators and only needs a set for confirmation. L7 and L11 need
one from the start.

## Acceptance (Prompt 2)

1. Runs on the Tizen and webOS emulators, and on at least one physical set.
2. Live playback works, including a channel zap under 2 seconds.
3. The guide scrolls both axes without dropping below 30fps on target hardware.
4. Every control reachable by remote; focus visible at 3 metres.
5. Packaged as `.wgt` (Tizen) and `.ipk` (webOS).
6. No import from `packages/core` has been modified on this branch.

Of these, 6 holds today and is enforced by the branch containing no changes
under `packages/`. The rest need the hardware above.
