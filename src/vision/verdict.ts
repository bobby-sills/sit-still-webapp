import type { Baseline, Observation, Signal } from '../types'

/**
 * How far a measurement must move from its calibrated baseline before it counts
 * as a disturbance. Deliberately loose: a false nudge costs far more than a
 * missed one, because it breaks the sit the app exists to protect.
 */
const EYE_OPEN_MARGIN = 0.18
/** Normalised frame heights. The shoulder line drops as the spine folds. */
const SHOULDER_DROP_TOLERANCE = 0.045
const HEAD_DROP_TOLERANCE = 0.055

/** Rolling-window debounce: a verdict must hold for most of the window to stick. */
export const WINDOW_SIZE = 12
export const WINDOW_MAJORITY = 8

/** The verdict for a single frame, before debouncing. */
export function rawVerdict(obs: Observation, baseline: Baseline): Signal {
  // A frame with no face tells us nothing about eyes or spine, so it outranks both.
  if (!obs.faceFound) return 'away'
  if (obs.eyeAperture !== null && obs.eyeAperture > baseline.eyeAperture + EYE_OPEN_MARGIN) {
    return 'eyes'
  }
  const shoulderDropped =
    obs.shoulderY !== null && obs.shoulderY > baseline.shoulderY + SHOULDER_DROP_TOLERANCE
  const headDropped = obs.headY !== null && obs.headY > baseline.headY + HEAD_DROP_TOLERANCE
  if (shoulderDropped || headDropped) return 'slouch'
  return 'settled'
}

/**
 * Smooths per-frame verdicts into the signal the session acts on. A candidate
 * replaces the current signal only once it holds a majority of the window, so a
 * blink or a shift in the seat never surfaces.
 */
export class SignalSmoother {
  private window: Signal[] = []
  private current: Signal = 'settled'

  push(raw: Signal): Signal {
    this.window.push(raw)
    if (this.window.length > WINDOW_SIZE) this.window.shift()

    const counts = new Map<Signal, number>()
    for (const s of this.window) counts.set(s, (counts.get(s) ?? 0) + 1)

    for (const [signal, count] of counts) {
      if (count >= WINDOW_MAJORITY) {
        this.current = signal
        break
      }
    }
    return this.current
  }

  get signal(): Signal {
    return this.current
  }

  reset(): void {
    this.window = []
    this.current = 'settled'
  }
}

/** Median is used for baselines so one bad frame cannot skew the whole sit. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number)
}
