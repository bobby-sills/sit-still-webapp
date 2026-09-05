import type { Baseline, Minutes, SessionRecord, SessionTotals } from '../types'

/**
 * Everything here stays on the device. Only aggregate numbers about a sit are
 * written — never a frame, never a landmark stream.
 */

const HISTORY_KEY = 'still.history.v1'
const PROGRESS_KEY = 'still.progress.v1'
const SOUND_KEY = 'still.sound.v1'
// v2: v1 held the old nudge-wording setting, which was a string, not a flag.
const VOICE_KEY = 'still.voice.v2'
const HISTORY_LIMIT = 200

/** An interrupted sit older than this is not worth resuming into. */
const PROGRESS_STALE_MS = 10 * 60 * 1000

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing or a full quota. Persistence is a convenience, not a
    // requirement — the sit itself must not fail because of it.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* see write() */
  }
}

export function loadHistory(): SessionRecord[] {
  return read<SessionRecord[]>(HISTORY_KEY) ?? []
}

export function saveSession(record: SessionRecord): void {
  write(HISTORY_KEY, [record, ...loadHistory()].slice(0, HISTORY_LIMIT))
}

export type Progress = {
  startedAt: number
  minutes: Minutes
  /** Seconds already sat when the page went away. */
  elapsed: number
  totals: SessionTotals
  /** Kept so a resumed sit can keep watching without recalibrating. */
  baseline: Baseline | null
  savedAt: number
}

export function saveProgress(progress: Omit<Progress, 'savedAt'>): void {
  write(PROGRESS_KEY, { ...progress, savedAt: Date.now() })
}

export function clearProgress(): void {
  remove(PROGRESS_KEY)
}

/** Returns a sit interrupted by a reload, if it is recent enough to resume. */
export function loadProgress(): Progress | null {
  const progress = read<Progress>(PROGRESS_KEY)
  if (!progress) return null
  const expired = Date.now() - progress.savedAt > PROGRESS_STALE_MS
  const finished = progress.elapsed >= progress.minutes * 60
  const unusable = !Number.isFinite(progress.minutes) || progress.minutes <= 0
  if (expired || finished || unusable) {
    clearProgress()
    return null
  }
  return progress
}

/** Sound is on by default: without it a sit with the eyes shut gives no cues. */
export function loadSound(): boolean {
  return read<boolean>(SOUND_KEY) !== false
}

export function saveSound(enabled: boolean): void {
  write(SOUND_KEY, enabled)
}

/** The spoken lines, on by default for the same reason the chimes are. */
export function loadVoice(): boolean {
  return read<boolean>(VOICE_KEY) !== false
}

export function saveVoice(enabled: boolean): void {
  write(VOICE_KEY, enabled)
}
