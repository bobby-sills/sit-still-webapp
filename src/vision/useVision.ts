import { useCallback, useEffect, useRef, useState } from 'react'
import type { Baseline, Observation, Signal } from '../types'
import { Detector } from './detector'
import { SignalSmoother, rawVerdict } from './verdict'

export type VisionStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  /** The browser has no camera API at all, or no camera attached. */
  | 'unsupported'
  | 'denied'
  | 'error'

/** ~8 frames a second is enough to catch a drift and cheap enough for a phone. */
const DETECT_INTERVAL_MS = 125
/** After a pause this long (a backgrounded tab), stale frames are discarded. */
const STALE_GAP_MS = 1000

export type Vision = {
  status: VisionStatus
  /**
   * A callback ref: the <video> element is remounted as screens change, so the
   * stream is re-attached to whichever element is currently on screen.
   */
  videoRef: React.RefCallback<HTMLVideoElement>
  observationRef: React.RefObject<Observation | null>
  signalRef: React.RefObject<Signal>
  baselineRef: React.RefObject<Baseline | null>
  start: () => Promise<VisionStatus>
  stop: () => void
  setBaseline: (baseline: Baseline | null) => void
  resetSmoother: () => void
}

/**
 * Owns the camera stream and the detection loop for the life of the app, so the
 * stream survives the move from calibration into the session without a second
 * permission prompt. Frames are read and discarded in place — nothing is
 * uploaded, recorded, or kept.
 */
export function useVision(): Vision {
  const [status, setStatus] = useState<VisionStatus>('idle')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const observationRef = useRef<Observation | null>(null)
  const signalRef = useRef<Signal>('settled')
  const baselineRef = useRef<Baseline | null>(null)

  const attachVideo = useCallback<React.RefCallback<HTMLVideoElement>>((element) => {
    videoRef.current = element
    if (element && streamRef.current && element.srcObject !== streamRef.current) {
      element.srcObject = streamRef.current
      void element.play().catch(() => undefined)
    }
  }, [])

  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<Detector | null>(null)
  const smootherRef = useRef(new SignalSmoother())
  const frameRef = useRef<number | null>(null)
  const lastDetectRef = useRef(0)
  const startingRef = useRef<Promise<VisionStatus> | null>(null)

  const loop = useCallback(() => {
    frameRef.current = requestAnimationFrame(loop)
    const now = performance.now()
    const since = now - lastDetectRef.current
    if (since < DETECT_INTERVAL_MS) return
    if (since > STALE_GAP_MS) smootherRef.current.reset()
    lastDetectRef.current = now

    const video = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector) return

    let observation: Observation | null = null
    try {
      observation = detector.detect(video, now)
    } catch {
      // A single bad frame is not worth ending the sit over.
      return
    }
    if (!observation) return

    observationRef.current = observation
    const baseline = baselineRef.current
    signalRef.current = baseline
      ? smootherRef.current.push(rawVerdict(observation, baseline))
      : 'settled'
  }, [])

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    detectorRef.current?.close()
    detectorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    observationRef.current = null
    signalRef.current = 'settled'
    smootherRef.current.reset()
    setStatus('idle')
  }, [])

  const start = useCallback((): Promise<VisionStatus> => {
    if (streamRef.current && detectorRef.current) return Promise.resolve<VisionStatus>('ready')
    if (startingRef.current) return startingRef.current

    const attempt = (async (): Promise<VisionStatus> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported')
        return 'unsupported'
      }
      setStatus('starting')
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 },
          },
          audio: false,
        })
      } catch (err) {
        const name = err instanceof Error ? err.name : ''
        const next: VisionStatus =
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'unsupported'
              : 'error'
        setStatus(next)
        return next
      }

      try {
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        detectorRef.current = await Detector.create()
      } catch {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        setStatus('error')
        return 'error'
      }

      smootherRef.current.reset()
      lastDetectRef.current = 0
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(loop)
      setStatus('ready')
      return 'ready'
    })()

    startingRef.current = attempt
    void attempt.finally(() => {
      startingRef.current = null
    })
    return attempt
  }, [loop])

  const setBaseline = useCallback((baseline: Baseline | null) => {
    baselineRef.current = baseline
    smootherRef.current.reset()
  }, [])

  const resetSmoother = useCallback(() => smootherRef.current.reset(), [])

  useEffect(() => stop, [stop])

  return {
    status,
    videoRef: attachVideo,
    observationRef,
    signalRef,
    baselineRef,
    start,
    stop,
    setBaseline,
    resetSmoother,
  }
}
