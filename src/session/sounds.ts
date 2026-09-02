import type { Signal } from '../types'

/**
 * The only audio in the app, and it exists for one reason: with the eyes shut
 * there is no way to read the screen. Opening them to see a nudge would itself
 * count as a drift, so each cue has to be legible as sound alone.
 *
 * Tones are synthesised rather than loaded, which keeps the app free of audio
 * assets, and they are deliberately quiet and slow to decay — a meditation
 * timer that startles you has failed at its job.
 */

export type Cue = 'start' | 'end' | Exclude<Signal, 'settled'>

type Tone = {
  freq: number
  /** Seconds after the cue begins. */
  at: number
  /** Seconds until the tone has fully decayed. */
  dur: number
  /** Relative to the cue's own level. */
  gain?: number
}

/**
 * Each disturbance gets its own shape so it can be told apart without looking:
 * rising for a spine to lengthen, falling for a body that has wandered off,
 * and a single note for eyes that have opened.
 */
const CUES: Record<Cue, Tone[]> = {
  // A warm open fifth. The sit has begun.
  start: [
    { freq: 294, at: 0, dur: 2.6 },
    { freq: 441, at: 0.04, dur: 2.4, gain: 0.45 },
  ],
  // The same interval settling downwards. The sit is over.
  end: [
    { freq: 441, at: 0, dur: 2.4 },
    { freq: 294, at: 0.45, dur: 2.8, gain: 0.8 },
  ],
  eyes: [{ freq: 648, at: 0, dur: 1.3 }],
  slouch: [
    { freq: 441, at: 0, dur: 0.9 },
    { freq: 588, at: 0.16, dur: 1.2 },
  ],
  away: [
    { freq: 588, at: 0, dur: 0.9 },
    { freq: 392, at: 0.16, dur: 1.3 },
  ],
}

/** Kept low on purpose: a cue should sit under the room, not over it. */
const MASTER_GAIN = 0.16
const NUDGE_GAIN = 0.7

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export class Chimes {
  private context: AudioContext | null = null
  private enabled = true

  /**
   * Must be called from a real user gesture — browsers refuse to start audio
   * otherwise, and the first cue would be silently swallowed.
   */
  unlock(): void {
    const Ctor = audioContextCtor()
    if (!Ctor) return
    this.context ??= new Ctor()
    if (this.context.state === 'suspended') void this.context.resume()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  play(cue: Cue): void {
    if (!this.enabled) return
    const context = this.context
    if (!context || context.state === 'closed') return
    if (context.state === 'suspended') void context.resume()

    const now = context.currentTime
    const level = cue === 'start' || cue === 'end' ? MASTER_GAIN : MASTER_GAIN * NUDGE_GAIN

    for (const tone of CUES[cue]) {
      const osc = context.createOscillator()
      const gain = context.createGain()
      osc.type = 'sine'
      osc.frequency.value = tone.freq

      // An exponential ramp cannot touch zero, so the envelope runs between
      // near-silence and the peak, giving a soft attack and a long tail.
      const start = now + tone.at
      const peak = level * (tone.gain ?? 1)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur)

      osc.connect(gain).connect(context.destination)
      osc.start(start)
      osc.stop(start + tone.dur + 0.05)
    }
  }

  close(): void {
    void this.context?.close()
    this.context = null
  }
}
