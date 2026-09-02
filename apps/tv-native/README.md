# @streamwise/tv-native

StreamWise for `react-native-tvos`. Targets Android TV, Fire TV, Vega OS and
Apple TV.

```bash
npm run typecheck -w @streamwise/tv-native
npm test -w @streamwise/tv-native        # 58 tests
```

## What is here

The parts of N1–N3 that can be finished and verified without a device.

| | |
| --- | --- |
| `src/platform/storage.ts` | `StoragePort` over an AsyncStorage/MMKV-shaped store — one adapter covers both, so which a build uses is a one-line decision. Blobs base64'd; no `Buffer` in Hermes. |
| `src/theme.ts` | N2. Colours pass through verbatim (React Native parses hex and `rgba()`); dimensions lose their units; tracking stays a function because RN's `letterSpacing` is absolute. |
| `src/icons.ts` | N3. `react-native-svg` renders core's path strings unchanged, so the family ports without a single asset. |
| `tests/` | Core's storage conformance cases, run twice, plus drift tests against `@streamwise/core`. |

Nothing here edits `packages/core`. Core changes land on main and are pulled —
`configureCoreClient` was added there for this branch rather than worked
around here.

Two things worth calling out, because both are places the obvious code is
wrong:

**The storage suite runs twice**, with and without `multiRemove`. It is
optional on the interface and `delete()` takes a different path for each; a
fixture that only had one would leave the fallback — the branch nobody
exercises by hand — untested.

**The icon stroke is divided by the viewBox scale.** The master grid is 24
units, so rendering at 96 multiplies everything by 4, including the stroke.
Passing `icon.stroke` straight through is the natural mistake and it is why
the 24px sidebar and the 96px reference screen would stop looking like one
family. A test pins the *rendered* width at 1.6 across sizes; it fails if the
compensation is removed.

## What is deliberately not here

No `react-native-tvos` dependency and no native project yet. Both need a
toolchain that can build them, and a native scaffold nobody can compile is a
lockfile entry rather than progress.

`hls.js` and `mpegts.js` are not being ported at all: ExoPlayer and AVPlayer
decode HLS and MPEG-TS natively through `react-native-video` v6. Likewise
`useSpatialNavigation` — this branch uses `TVFocusGuideView`,
`hasTVPreferredFocus` and the focus props on Touchables.

## What needs hardware, and which hardware

**N9, the Vega sub-track, splits cleanly** — which is the useful thing to
know before booking device time:

- The **module-resolver half needs no hardware at all.** Amazon's resolver
  swaps `@amazon-devices` imports for the standard ones at build time, so
  shared code stays clean. That is a build-configuration problem and can be
  spiked on any machine. What it does need is **SDK access**, which has been
  gated behind Amazon's developer programme — that is a credential lead time,
  not a hardware one, and worth starting early for exactly that reason.
- The **input and playback half needs a Vega-based Fire TV Stick.** Each
  platform emits different key events, so the focus logic is shared and the
  input layer forks; and `react-native-video` on Vega has to be confirmed on
  the device rather than in a simulator.

The rest of the branch:

- **Android TV** — the emulator is genuinely good, and N1–N8 can be developed
  against it. One physical device for confirmation, over adb on the LAN.
- **Fire TV (Fire OS)** — a Fire TV Stick. Note this is a *second* Amazon
  target, not the same one as Vega: Fire TV is mid-migration, so shipping
  "Fire TV" may mean shipping both an APK and a Vega build for a while.
  Decide whether legacy Fire OS is in v1 before N9 starts.
- **Apple TV** — a hard toolchain floor, and the plan's own gate: macOS,
  Xcode, and a paid Apple Developer account. Confirm all three exist before
  N1. If they do not, drop tvOS from v1 and the branch still covers three
  platforms.

## Acceptance (Prompt 3)

1. Runs on an Android TV emulator and at least one physical device.
2. Live playback works, including a channel zap under 2 seconds.
3. Every control reachable by remote; focus visible at 3 metres.
4. Builds for Android TV and Fire TV; Vega build produced or its blocker documented.
5. tvOS build produced, or explicitly descoped with the reason recorded.
6. No import from `packages/core` has been modified on this branch.

Of these, 6 holds today and is enforced by the branch containing no changes
under `packages/`. The rest need the hardware above.
