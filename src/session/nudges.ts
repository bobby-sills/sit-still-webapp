import type { Signal } from '../types'

type Disturbance = Exclude<Signal, 'settled'>

/**
 * What the app says for a drift: the words on screen and the words spoken are
 * the same words, so a line and its recording can never fall out of step.
 *
 * There are several per drift because a nudge fires once per episode and a long
 * sit has several. The same sentence four times stops being a cue and starts
 * being a nag.
 */
export type NudgeLine = { text: string; file: string }

const LINES: Record<Disturbance, NudgeLine[]> = {
  eyes: [
    { text: 'let the eyes close', file: 'eyes-01' },
    { text: 'let the eyes close again', file: 'eyes-02' },
    { text: 'rest the eyes again', file: 'eyes-03' },
    { text: 'let your eyes fall closed', file: 'eyes-04' },
    { text: 'let the light go', file: 'eyes-05' },
    { text: 'close them again, gently', file: 'eyes-06' },
    { text: 'let the gaze drop', file: 'eyes-07' },
    { text: 'eyes closed', file: 'eyes-08' },
  ],
  slouch: [
    { text: 'lengthen your spine', file: 'slouch-01' },
    { text: 'let the spine lengthen', file: 'slouch-02' },
    { text: 'lift gently through the spine', file: 'slouch-03' },
    { text: 'let the crown of your head lift', file: 'slouch-04' },
    { text: 'grow tall through the back', file: 'slouch-05' },
    { text: 'sit tall again', file: 'slouch-06' },
    { text: 'soften the shoulders, and lift', file: 'slouch-07' },
    { text: 'a little taller', file: 'slouch-08' },
    { text: 'let the spine grow tall', file: 'slouch-09' },
  ],
  away: [
    { text: 'come back to the frame', file: 'away-01' },
    { text: 'settle back into the seat', file: 'away-02' },
    { text: 'come back, gently', file: 'away-03' },
  ],
}

/** Spoken as the sit waits at its starting line, and again once it is over. */
export const BEGIN_FILE = 'begin'
export const END_FILE = 'end'

/** Everything under public/voice, for the preload. */
export const VOICE_FILES: string[] = [
  BEGIN_FILE,
  END_FILE,
  ...Object.values(LINES).flatMap((lines) => lines.map((line) => line.file)),
]

/**
 * A shuffle bag per drift: every line is used once before any of them repeats,
 * and a fresh bag never opens with the line the last one closed on. Pure chance
 * would happily say the same thing twice in a row, which is the one thing the
 * variants exist to prevent.
 */
const bags = new Map<Disturbance, NudgeLine[]>()
const spokenLast = new Map<Disturbance, NudgeLine>()

export function nudgeFor(signal: Disturbance): NudgeLine {
  const pool = LINES[signal]
  let bag = bags.get(signal) ?? []

  if (bag.length === 0) {
    bag = shuffle(pool)
    // pop() draws from the end, so that is the one to protect from a repeat.
    const previous = spokenLast.get(signal)
    if (previous && bag.length > 1 && bag[bag.length - 1] === previous) {
      const swap = bag[0] as NudgeLine
      bag[0] = previous
      bag[bag.length - 1] = swap
    }
  }

  const line = (bag.pop() ?? pool[0]) as NudgeLine
  bags.set(signal, bag)
  spokenLast.set(signal, line)
  return line
}

function shuffle(lines: NudgeLine[]): NudgeLine[] {
  const out = [...lines]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const held = out[i] as NudgeLine
    out[i] = out[j] as NudgeLine
    out[j] = held
  }
  return out
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
