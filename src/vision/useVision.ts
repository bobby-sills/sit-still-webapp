import { useCallback, useEffect, useRef, useState } from 'react'
import type { Baseline, Observation, Signal } from '../types'

/** The posture half of a baseline, captured during framing. */
export type PostureBaseline = { shoulderY: number; headY: number }
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
   * The element detection reads from. It is mounted once, for the life of the
   * app, and kept off screen: screens that show no camera panel — the whole
   * mobile session — must still be watched.
   */
  videoRef: React.RefCallback<HTMLVideoElement>
  /**
   * A second element, for screens that actually show the feed. Sharing one
   * stream between the two costs a decode but keeps detection independent of
   * whatever the layout happens to be displaying.
   */
  previewRef: React.RefCallback<HTMLVideoElement>
  observationRef: React.RefObject<Observation | null>
  signalRef: React.RefObject<Signal>
  baselineRef: React.RefObject<Baseline | null>
  /**
   * Shoulders and head, fixed during framing. The eye half of the baseline is
   * captured later, as the sit begins and the eyes actually close.
   */
  postureRef: React.RefObject<PostureBaseline | null>
  start: () => Promise<VisionStatus>
  stop: () => void
  setBaseline: (baseline: Baseline | null) => void
  setPosture: (posture: PostureBaseline | null) => void
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
  const postureRef = useRef<PostureBaseline | null>(null)

  const attach = (element: HTMLVideoElement | null) => {
    if (element && streamRef.current && element.srcObject !== streamRef.current) {
      element.srcObject = streamRef.current
      void element.play().catch(() => undefined)
    }
  }

  const attachVideo = useCallback<React.RefCallback<HTMLVideoElement>>((element) => {
    videoRef.current = element
    attach(element)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const attachPreview = useCallback<React.RefCallback<HTMLVideoElement>>((element) => {
    previewRef.current = element
    attach(element)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const previewRef = useRef<HTMLVideoElement | null>(null)
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
    if (previewRef.current) previewRef.current.srcObject = null
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
        for (const element of [videoRef.current, previewRef.current]) {
          if (!element) continue
          element.srcObject = stream
          await element.play().catch(() => undefined)
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

  const setPosture = useCallback((posture: PostureBaseline | null) => {
    postureRef.current = posture
  }, [])

  const resetSmoother = useCallback(() => smootherRef.current.reset(), [])

  useEffect(() => stop, [stop])

  return {
    status,
    videoRef: attachVideo,
    previewRef: attachPreview,
    observationRef,
    signalRef,
    baselineRef,
    postureRef,
    start,
    stop,
    setBaseline,
    setPosture,
    resetSmoother,
  }
}
