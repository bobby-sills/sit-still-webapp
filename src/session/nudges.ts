import type { NudgeVoice, Signal } from '../types'

type Disturbance = Exclude<Signal, 'settled'>

const VOICES: Record<NudgeVoice, Record<Disturbance, string>> = {
  minimal: {
    eyes: 'eyes closed',
    slouch: 'lengthen your spine',
    away: 'come back',
  },
  poetic: {
    eyes: 'let the light go',
    slouch: 'let the spine grow tall',
    away: 'the seat is still here',
  },
}

export function nudgeFor(voice: NudgeVoice, signal: Disturbance): string {
  return VOICES[voice][signal]
}

const SIGNAL_LABELS: Record<Signal, string> = {
  settled: 'settled',
  eyes: 'eyes open',
  slouch: 'posture drift',
  away: 'out of frame',
}

export function signalLabel(signal: Signal): string {
  return SIGNAL_LABELS[signal]
}

export function closingLine(nudges: number, settledFraction: number): string {
  if (nudges === 0) return 'Nothing needed saying. The camera stayed quiet the whole way through.'
  if (settledFraction > 0.9) return 'A few small drifts, caught early. Mostly you were here.'
  return 'The mind wandered more than usual, and the body with it. Tomorrow, begin again.'
}
