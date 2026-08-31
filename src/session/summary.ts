import type { SessionTotals } from '../types'

/** The disturbance timeline is drawn as this many bars, whatever the length. */
export const BUCKET_COUNT = 56

export function emptyBuckets(): Array<number | null> {
  return Array.from({ length: BUCKET_COUNT }, () => null)
}

export type Percentages = {
  settled: number
  eyesClosed: number
  postureHeld: number
}

/**
 * Time out of frame counts against the eye figure as well: with no face there is
 * no evidence the eyes stayed closed, and claiming otherwise would flatter the sit.
 */
export function percentages(totals: SessionTotals): Percentages {
  const { ticks, eyesTicks, slouchTicks, awayTicks } = totals
  if (ticks === 0) return { settled: 1, eyesClosed: 1, postureHeld: 1 }
  const offTicks = eyesTicks + awayTicks
  return {
    settled: 1 - (offTicks + slouchTicks) / ticks,
    eyesClosed: 1 - offTicks / ticks,
    postureHeld: 1 - slouchTicks / ticks,
  }
}

/** Minutes sat, rounded, never shown as zero after a sit of any length. */
export function minutesSat(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}

export function disturbanceLabel(nudges: number): string {
  if (nudges === 0) return 'undisturbed'
  return `${nudges} reminder${nudges === 1 ? '' : 's'}`
}
