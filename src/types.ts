export type Screen = 'home' | 'calibrate' | 'session' | 'complete'

/** The verdict for a single moment of the sit. */
export type Signal = 'settled' | 'eyes' | 'slouch' | 'away'

export type NudgeVoice = 'minimal' | 'poetic'

export type Minutes = 5 | 10 | 20

/** Captured during calibration; every session verdict is relative to these. */
export type Baseline = {
  /** Eye aperture with the eyes closed. Openness is judged as a rise above this. */
  eyeAperture: number
  /** Normalised y of the shoulder line. Larger means lower in the frame. */
  shoulderY: number
  /** Normalised y of the head. Catches a spine collapsing without the shoulders moving. */
  headY: number
}

/** Normalised face extents, used to place the framing oval over the live feed. */
export type FaceBox = { cx: number; cy: number; w: number; h: number }

/** What one processed frame told us. Frames themselves are never kept. */
export type Observation = {
  faceFound: boolean
  /** 0 (shut) to 1 (wide), or null when no face was found. */
  eyeAperture: number | null
  shoulderY: number | null
  headY: number | null
  faceBox: FaceBox | null
}

/**
 * What a sit leaves behind: counts, not moments. Samples are aggregated as they
 * are taken, so nothing that could reconstruct the sit frame by frame is stored.
 */
export type SessionTotals = {
  minutes: Minutes
  /** Seconds actually sat, which is short of minutes*60 when ended early. */
  seconds: number
  monitored: boolean
  nudges: number
  ticks: number
  /** Ticks spent with the eyes open. */
  eyesTicks: number
  slouchTicks: number
  /** Ticks spent out of frame. */
  awayTicks: number
  /**
   * Fraction of each timeline bucket that was not settled, positioned by when it
   * happened. A bucket is null when nothing was sampled in it — a backgrounded
   * tab, or a sit that ended before reaching it.
   */
  buckets: Array<number | null>
}

export type SessionRecord = SessionTotals & { startedAt: number }
