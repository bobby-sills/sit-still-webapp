import { useCallback, useEffect, useRef, useState } from 'react'
import type { Baseline, Minutes, NudgeVoice, SessionTotals, Signal } from '../types'
import { nudgeFor } from './nudges'
import { BUCKET_COUNT, emptyBuckets } from './summary'
import { clearProgress, saveProgress, type Progress } from '../storage/local'

/** One sample every 100ms, positioned in the sit by when it was taken. */
const SAMPLE_SECONDS = 0.1
/**
 * The most catch-up sampling one frame will do. Anything longer is a
 * backgrounded tab: the clock still credits that time, but no verdict is
 * invented for it, and those buckets stay empty on the timeline.
 */
const MAX_CATCHUP_STEPS = 20

/** How long a nudge stays on screen before fading out. */
const NUDGE_VISIBLE_MS = 3400
const PROGRESS_SAVE_MS = 2000

export type SessionDisplay = {
  remaining: string
  nudgeText: string
  nudgeVisible: boolean
  signal: Signal
}

export type SessionEngineOptions = {
  active: boolean
  minutes: Minutes
  voice: NudgeVoice
  monitored: boolean
  /**
   * How long a problem must persist before it is worth saying anything. The
   * single most important number in the app: an instant nudge feels punitive
   * and breaks the sit it is meant to protect.
   */
  patienceSeconds: number
  /** Dev-only clock scaling; 60 in production. */
  secondsPerMinute: number
  signalRef: React.RefObject<Signal>
  baselineRef: React.RefObject<Baseline | null>
  /** A sit interrupted by a reload, picked up where it left off. */
  resume: Progress | null
  onComplete: (totals: SessionTotals, startedAt: number) => void
}

type Episode = {
  kind: Exclude<Signal, 'settled'>
  /** Real-time mark when this run of the problem began. */
  startedAt: number
  nudged: boolean
}

export function useSessionEngine(options: SessionEngineOptions): {
  display: SessionDisplay
  end: () => void
} {
  const {
    active,
    minutes,
    voice,
    monitored,
    patienceSeconds,
    secondsPerMinute,
    signalRef,
    baselineRef,
    resume,
    onComplete,
  } = options

  const total = minutes * secondsPerMinute
  const [display, setDisplay] = useState<SessionDisplay>(() => ({
    remaining: formatRemaining(total, secondsPerMinute),
    nudgeText: '',
    nudgeVisible: false,
    signal: 'settled',
  }))

  const elapsedRef = useRef(0)
  const sampledToRef = useRef(0)
  const totalsRef = useRef<SessionTotals | null>(null)
  const startedAtRef = useRef(0)
  const episodeRef = useRef<Episode | null>(null)
  const nudgeRef = useRef({ text: '', shownAt: -Infinity })
  const lastFrameRef = useRef(0)
  const lastSaveRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const finishedRef = useRef(false)

  // Read through refs so the animation frame never closes over stale props.
  const latest = useRef({ voice, monitored, patienceSeconds, total, secondsPerMinute, onComplete })
  latest.current = { voice, monitored, patienceSeconds, total, secondsPerMinute, onComplete }

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    const totals = totalsRef.current
    if (!totals) return
    const finalTotals: SessionTotals = { ...totals, seconds: elapsedRef.current / latest.current.secondsPerMinute * 60 }
    clearProgress()
    latest.current.onComplete(finalTotals, startedAtRef.current)
  }, [])

  useEffect(() => {
    if (!active) return

    finishedRef.current = false
    startedAtRef.current = resume?.startedAt ?? Date.now()
    elapsedRef.current = resume ? resume.elapsed * (secondsPerMinute / 60) : 0
    sampledToRef.current = elapsedRef.current
    totalsRef.current = resume
      ? { ...resume.totals, buckets: [...resume.totals.buckets] }
      : {
          minutes,
          seconds: 0,
          monitored,
          nudges: 0,
          ticks: 0,
          eyesTicks: 0,
          slouchTicks: 0,
          awayTicks: 0,
          buckets: emptyBuckets(),
        }
    // Buckets hold a fraction; sampling needs the counts behind it.
    const bucketHits = new Array<number>(BUCKET_COUNT).fill(0)
    const bucketDisturbed = new Array<number>(BUCKET_COUNT).fill(0)
    if (resume) {
      resume.totals.buckets.forEach((fraction, i) => {
        if (fraction === null) return
        // The exact counts are gone; one weighted hit preserves the shape.
        bucketHits[i] = 1
        bucketDisturbed[i] = fraction
      })
    }

    episodeRef.current = null
    nudgeRef.current = { text: '', shownAt: -Infinity }
    lastFrameRef.current = performance.now()
    lastSaveRef.current = performance.now()

    const step = () => {
      frameRef.current = requestAnimationFrame(step)
      const now = performance.now()
      const dt = (now - lastFrameRef.current) / 1000
      lastFrameRef.current = now
      const totals = totalsRef.current
      if (!totals) return

      const opts = latest.current
      elapsedRef.current = Math.min(opts.total, elapsedRef.current + dt)
      const elapsed = elapsedRef.current

      const signal: Signal = opts.monitored ? (signalRef.current ?? 'settled') : 'settled'

      // Attribute elapsed time to timeline buckets, one 100ms step at a time.
      let steps = 0
      while (sampledToRef.current + SAMPLE_SECONDS <= elapsed && steps < MAX_CATCHUP_STEPS) {
        const position = Math.min(BUCKET_COUNT - 1, Math.floor((sampledToRef.current / opts.total) * BUCKET_COUNT))
        bucketHits[position] = (bucketHits[position] ?? 0) + 1
        if (signal !== 'settled') bucketDisturbed[position] = (bucketDisturbed[position] ?? 0) + 1
        totals.ticks += 1
        if (signal === 'eyes') totals.eyesTicks += 1
        else if (signal === 'slouch') totals.slouchTicks += 1
        else if (signal === 'away') totals.awayTicks += 1
        sampledToRef.current += SAMPLE_SECONDS
        steps += 1
      }
      if (sampledToRef.current + SAMPLE_SECONDS <= elapsed) sampledToRef.current = elapsed

      for (let i = 0; i < BUCKET_COUNT; i += 1) {
        const hits = bucketHits[i] ?? 0
        totals.buckets[i] = hits === 0 ? null : (bucketDisturbed[i] ?? 0) / hits
      }

      // Patience and nudge timing run on the wall clock, not the session clock,
      // so a scaled dev session still behaves the way a real sit would.
      if (signal === 'settled') {
        episodeRef.current = null
      } else {
        const episode = episodeRef.current
        if (!episode || episode.kind !== signal) {
          episodeRef.current = { kind: signal, startedAt: now, nudged: false }
        } else if (!episode.nudged && now - episode.startedAt >= opts.patienceSeconds * 1000) {
          episode.nudged = true
          nudgeRef.current = { text: nudgeFor(opts.voice, signal), shownAt: now }
          totals.nudges += 1
        }
      }

      const nudgeVisible = now - nudgeRef.current.shownAt < NUDGE_VISIBLE_MS
      const remaining = formatRemaining(opts.total - elapsed, opts.secondsPerMinute)
      setDisplay((prev) =>
        prev.remaining === remaining &&
        prev.nudgeVisible === nudgeVisible &&
        prev.nudgeText === nudgeRef.current.text &&
        prev.signal === signal
          ? prev
          : { remaining, nudgeVisible, nudgeText: nudgeRef.current.text, signal },
      )

      if (now - lastSaveRef.current >= PROGRESS_SAVE_MS) {
        lastSaveRef.current = now
        const progress: Omit<Progress, 'savedAt'> = {
          startedAt: startedAtRef.current,
          minutes,
          voice: opts.voice,
          elapsed: (elapsed / opts.secondsPerMinute) * 60,
          totals: { ...totals, seconds: (elapsed / opts.secondsPerMinute) * 60 },
          baseline: baselineRef.current,
        }
        saveProgress(progress)
      }

      if (elapsed >= opts.total) finish()
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    // A session is set up once, when it becomes active. Later prop changes are
    // read through `latest` rather than restarting the sit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return { display, end: finish }
}

/** Session time as m:ss, mapping a scaled dev clock back to real minutes. */
function formatRemaining(seconds: number, secondsPerMinute: number): string {
  const sessionSeconds = (Math.max(0, seconds) / secondsPerMinute) * 60
  const minutes = Math.floor(sessionSeconds / 60)
  const rest = Math.floor(sessionSeconds % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
