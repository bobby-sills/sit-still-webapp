# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Still** — a camera-assisted meditation timer. React 19 + TypeScript + Vite, no
backend, no tests, no linter. Two MediaPipe models run on-device; frames are read
from a `<video>` element and discarded in place. Nothing is uploaded and only
aggregate numbers reach `localStorage`.

`README.md` documents the product behaviour and the reasoning behind the tuning
constants — read it before changing thresholds, patience, or the summary.

## Commands

```sh
npm install          # postinstall fetches the two .task models + wasm into public/
npm run dev          # vite dev server on localhost (a secure context; a LAN IP is not)
npm run typecheck    # tsc -b --force — the only check in the repo
npm run build        # tsc -b && vite build → dist/
BASE_PATH=/sit-still/ npm run build   # build for a subpath
```

There is no test suite and no lint config (the `eslint-disable` comments in
`useVision.ts` / `useSessionEngine.ts` are vestigial but describe real intent —
leave them). `npm run typecheck` is what "does it pass" means here, and
`tsconfig.app.json` is strict: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUnusedLocals`.

Verifying behaviour means running the app in a browser and using the camera —
append `?spm=<seconds>` in dev to scale the session clock (`spm=2` makes a 10
minute sit last 20s). It is compiled out of production builds.

Push to `main` deploys to GitHub Pages
(`.github/workflows/deploy.yml`); that HTTPS URL is the way to exercise the
camera on a phone.

## Architecture

`App.tsx` is the whole state machine: `home → calibrate → session → complete`,
one `screen` string plus the handful of flags the screens read. Screens under
`src/screens/` are presentational; they own no session or camera state.

Three long-lived pieces hang off `App`:

- **`useVision`** (`src/vision/useVision.ts`) owns the camera stream and the
  rAF detection loop for the life of the app, so moving from calibration into a
  sit never re-prompts for permission. It exposes readings as **refs, not
  state** — `observationRef`, `signalRef`, `baselineRef`, `postureRef` — because
  detection runs at ~8fps and re-rendering React at that rate would be absurd.
  Anything that needs a value in render polls it on an interval (see
  `useObservation` in `App.tsx`, 500ms).
- **`useSessionEngine`** (`src/session/useSessionEngine.ts`) runs the clock in
  its own rAF loop off `performance.now()` deltas. It is set up **once**, when
  `active` flips true; later props are read through a `latest` ref rather than
  restarting the sit. Changing that effect's dependency array will restart sits
  mid-flight.
- **`Chimes`** (`src/session/sounds.ts`) — WebAudio tones synthesised on the
  fly, no assets. Must be `unlock()`ed inside a real user gesture or the first
  cue is swallowed; `App` does this in `beginCalibration` / `beginSession`.
- **`Voice`** (`src/session/voice.ts`) — the recorded lines in `public/voice/`,
  decoded to `AudioBuffer`s on the same unlock (a nudge must speak instantly,
  not start a download) and played through a fixed gain. Unlocking happens at
  `beginCalibration`, so framing buys the time for a ~1.5MB preload. A line that
  fails to load is simply not spoken and its text still shows.

### The vision pipeline

```
<video> → Detector.detect()   → Observation (3 numbers + face box)
        → rawVerdict()        → per-frame Signal, vs. the Baseline
        → SignalSmoother      → the Signal the session acts on (8 of last 12)
        → useSessionEngine    → patience → nudge (text + chime) + buckets
```

- `detector.ts` tries local models GPU → local CPU → CDN GPU → CDN CPU. Pose
  runs at half the face rate. MediaPipe requires strictly increasing timestamps
  in VIDEO mode — that is what `lastTimestamp` guards.
- `verdict.ts` holds the thresholds and the smoothing window. Tolerances are
  deliberately loose: a false nudge costs more than a missed one.
- **Baseline capture is split.** `useCalibration` fixes posture only (face held
  still, then shoulder/head medians). The **eye** half is captured by
  `useEyesClosedGate` at the moment the sit starts — the sit waits at its
  starting line until the eyes are actually shut, and that same act sets the
  baseline. `App` calls the gate a "starting line"; do not move eye calibration
  back into `useCalibration`.

### Degradation is a feature, not an edge case

Every camera path has a working fallback and the timer never depends on it:
permission denied, no camera, models that will not load, or a resumed sit that
cannot reacquire the stream all end with `monitored = false` — the sit runs, the
`WATCHING` indicator is absent, and the summary reports no statistics it did not
earn. Preserve this when touching `useVision` or the resume path in `App`.

### Aggregation, not sampling

`SessionTotals` (`src/types.ts`) is counts only — nothing that could
reconstruct a sit frame by frame. Time is attributed to 56 time-positioned
buckets as it elapses (`summary.ts`). A backgrounded tab is capped at
`MAX_CATCHUP_STEPS`, so unwatched time lands in **no** bucket and draws empty
rather than being reported as calm. `null` in `buckets` means "not observed" and
must stay distinguishable from `0`.

### Storage

`src/storage/local.ts` is the only place that touches `localStorage`, and every
access is wrapped — private browsing or a full quota must never fail a sit.
Keys are versioned (`still.history.v1` etc.); bump the suffix on a shape change.
In-progress sits are saved every 2s and resumed on reload if under 10 minutes old.
`Minutes` is a plain `number` rather than a union, because the home screen takes
a typed length alongside its presets — so a length read back from storage is
range-checked before it is trusted.

## Conventions

- **Layouts**: mobile and desktop are structurally different designs, not one
  stretched. `useIsDesktop` picks at 960px and screens take a `desktop` prop;
  they share presentational pieces from `src/components/`.
- **Style**: all visuals are CSS — no icons or images. Tokens (colour ramp, type
  scale) live at the top of `src/styles.css`; pure black and white with opacity
  doing the work, font weights 100–300 only. **11px is the floor for type** —
  the small labels are uppercase and widely tracked, which below that is
  unreadable on a phone. Those thin weights are why the type
  is Inter (Google Fonts, `index.html`) rather than a system stack — most
  platforms ship nothing usable below 400.
- **Comments** explain *why* a number or a shape was chosen, in prose, often
  with the product consequence attached. Match that register; do not add
  restating comments.
- Copy is lowercase and unpunctuated ("close your eyes to begin"). Nudge text
  lives in `src/session/nudges.ts` as `{ text, file }` pairs — the manifest for
  both the screen and `public/voice/`, so the two can never say different
  things. Lines are drawn from a per-drift shuffle bag rather than at random, so
  nothing repeats back to back. **Adding or rewording a line means recording the
  matching file**; `…/scratchpad/check-voice.py` transcribes `public/voice/`
  with whisper.cpp and diffs it against this manifest.
