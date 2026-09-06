# Still

A meditation timer that uses the camera to notice when your attention drifts.
When it wanders the body tends to show it — eyes opening, shoulders folding
forward, a body leaving the frame — and the app answers with a soft tone and a
quiet spoken line that bring you back. No score, no judgement.

Frames are read and discarded in the tab. Nothing is uploaded, nothing is
recorded, and there is no account.

## Running it without installing anything

Pushing to `main` builds and publishes the app to GitHub
Pages via `.github/workflows/deploy.yml`, at
<https://bobby-sills.github.io/sit-still/>. That URL is HTTPS, which the
camera requires, so it also works on a phone.

This needs Pages switched on once, by hand: **Settings → Pages → Build and
deployment → Source: GitHub Actions**. A workflow cannot enable Pages for its
own repository, so the first run fails until that is set.

## Running it locally

```sh
npm install   # also fetches the two on-device vision models into public/
npm run dev
```

`npm run build` produces a static site in `dist/`; anything that serves files
will host it. The camera needs a secure context, so deploy over HTTPS
(`localhost` is already treated as secure) — a LAN IP such as
`http://192.168.1.5:5173` is not secure and the camera will not start there.

To serve from a subpath, set `BASE_PATH` at build time
(`BASE_PATH=/sit-still/ npm run build`); asset URLs are derived from it.

## How it works

The app is a four-state machine — `home → calibrate → session → complete → home`
— and every state change is a cross-fade.

**Framing** (`src/vision/useCalibration.ts`) walks two checks, each driven by
real detection rather than a timer: a face holding still in frame, and both
shoulders read to fix the posture baseline. Both are things you can watch happen
with your eyes open.

**The starting line** (`src/vision/useEyesClosedGate.ts`) holds the clock until
the eyes are actually shut for a stretch, and uses that same moment to record
what shut looks like for this person in this light — so closing your eyes and
calibrating them are one act rather than two. If detection never resolves — bad
light, glasses, a face the model cannot see — the sit starts anyway after 45
seconds, on a baseline that simply never fires.

**Detection** (`src/vision/detector.ts`) runs two MediaPipe models fully
on-device: Face Landmarker for eye aperture (from the blink blendshapes, with an
eye-aspect-ratio fallback) and Pose Landmarker for the shoulder line. Faces are
read at roughly 8fps; the pose model runs at half that, since a shoulder line
moves slowly. Each frame is reduced to three numbers and the frame itself is
never copied, drawn, or kept.

**Verdicts** (`src/vision/verdict.ts`) compare those numbers against the
calibrated baselines, then pass through a rolling window — a signal must hold 8
of the last 12 frames to stick, so a blink or a shift in the seat never surfaces.

**The sit** (`src/session/useSessionEngine.ts`) is driven by `performance.now()`
deltas rather than tick counts, so a backgrounded tab does not stall the clock.
A problem must persist for `PATIENCE_SECONDS` (1.3s) before anything appears on
screen, and each episode nudges at most once; if the same problem returns later
it counts as a new episode. This patience is the most important number in the
app — an instant nudge feels punitive and breaks the sit it exists to protect.

**Sound** (`src/session/sounds.ts`) exists because the screen is unreadable to
someone sitting with their eyes shut, and opening them to read a nudge would
itself count as a drift. Each cue is a synthesised tone shaped to be told apart
without looking — rising for a spine to lengthen, falling for a body that has
wandered off, one note for eyes that have opened — with an open fifth to open
and close the sit.

**The voice** (`src/session/voice.ts`) says what the chime cannot. A tone tells
you *that* something drifted; with the eyes shut only words tell you *which*,
and a slouch is impossible to feel from the inside. Each drift has several
recorded lines drawn from a shuffle bag, so a long sit never hears the same
sentence twice running, and the line on screen is always the line being spoken.
The chime rings first and the words follow it. Sound and voice are separate
switches on the home screen; either can be turned off for a shared room.

**The summary** aggregates as it goes. Rather than keeping a sample per tick, the
session attributes each 100ms of elapsed time to one of 56 time-positioned
buckets. Time the app could not watch — a backgrounded tab — lands in no bucket
at all and draws as an empty bar, instead of being quietly reported as calm.

## When the camera is unavailable

Permission denied, no camera, or a model that will not load: the timer still
runs. The session simply records no verdicts, and
the summary shows the sit itself without statistics it did not earn.

## What is stored

`localStorage` only, via `src/storage/local.ts`: per-session totals (minutes,
counts, bucket fractions), whether sound and voice are on, and an in-progress
sit so a reload can pick it back up. A sit resumed after a reload reacquires the
camera before continuing; if it cannot, the rest of the sit runs unwatched
rather than reporting a watch that never happened.

## Layouts

The mobile and desktop designs are structurally different — the desktop layout is
not the mobile one stretched — so `src/ui/useIsDesktop.ts` picks the arrangement
at 960px and the screens share their presentational pieces across both.

## Assets

No icons and no images; every visual is CSS and every tone is synthesised.
There are two exceptions. `public/voice/` holds 22 spoken lines, about 1.5MB,
committed to the repo and levelled to a common loudness so no cue lands louder
than another. And the type is Inter, loaded from Google Fonts in `index.html`:
the design runs on weights 100–300, which most systems have no font for at all —
Helvetica Neue is an Apple font, and everywhere else the old stack quietly fell
back to Arial or worse. The stack behind it is unchanged, so the app still reads
correctly before the font arrives or if it never does. That stylesheet is the
only request the page makes to anyone but its own origin, and it carries nothing
but the ask for a typeface — which is why the home screen says *nothing about
you* leaves the browser rather than making a claim about traffic in general. The two `.task` models (~9MB) and the MediaPipe WASM
runtime are fetched into `public/` by `scripts/fetch-models.mjs` and kept out of
git. If that fetch fails, the app falls back to the CDN at runtime, and to an
unwatched timer if that fails too.

## Development notes

- `?spm=<seconds>` scales the session clock so a 20 minute sit can be exercised
  in under a minute. Development builds only — it is compiled out of production.
- The type scale, weights and colour ramp live as tokens at the top of
  `src/styles.css`. Weights 100–300 only; opacity does the rest.
