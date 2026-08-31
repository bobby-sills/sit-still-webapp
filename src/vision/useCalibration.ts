import { useEffect, useRef, useState } from 'react'
import type { Baseline, Observation } from '../types'
import { median } from './verdict'
import type { Vision } from './useVision'

/**
 * Walks the three framing checks, each driven by what the camera actually sees:
 *
 *   0 → 1  a face has held still in frame for a moment
 *   1 → 2  both shoulders have been read, giving the posture baseline
 *   2 → 3  the eyes have been shut long enough to record what shut looks like
 *
 * The last step is why the checklist reads "eyes closed — baseline set": the
 * user shuts their eyes here, and the button that follows asks them to do it
 * again for real.
 */

const POLL_MS = 100
const FACE_STABLE_MS = 1000
const SHOULDER_SAMPLES = 10
const EYES_CLOSED_MS = 1200
/** Aperture below this reads as shut on the blendshape scale. */
const EYES_CLOSED_APERTURE = 0.35

export type CalibrationState = {
  /** 0 to 3; 3 means every check has passed and the baseline is set. */
  step: number
  /** The live observation, for the framing overlays. */
  observation: Observation | null
}

export function useCalibration(vision: Vision, active: boolean): CalibrationState {
  const [state, setState] = useState<CalibrationState>({ step: 0, observation: null })
  const { observationRef, setBaseline } = vision

  const faceSinceRef = useRef<number | null>(null)
  const shoulderRef = useRef<{ shoulder: number[]; head: number[] }>({ shoulder: [], head: [] })
  const closedSinceRef = useRef<number | null>(null)
  const closedRef = useRef<number[]>([])

  useEffect(() => {
    if (!active) return
    faceSinceRef.current = null
    shoulderRef.current = { shoulder: [], head: [] }
    closedSinceRef.current = null
    closedRef.current = []
    setState({ step: 0, observation: null })

    const id = window.setInterval(() => {
      const obs = observationRef.current
      const now = performance.now()

      setState((prev) => {
        let step = prev.step
        if (!obs || !obs.faceFound) {
          // Losing the face pauses progress but never takes back a passed check.
          faceSinceRef.current = null
          if (step === 2) closedSinceRef.current = null
          return prev.observation === obs ? prev : { step, observation: obs }
        }

        if (step === 0) {
          faceSinceRef.current ??= now
          if (now - faceSinceRef.current >= FACE_STABLE_MS) step = 1
        } else if (step === 1) {
          if (obs.shoulderY !== null && obs.headY !== null) {
            shoulderRef.current.shoulder.push(obs.shoulderY)
            shoulderRef.current.head.push(obs.headY)
          }
          if (shoulderRef.current.shoulder.length >= SHOULDER_SAMPLES) step = 2
        } else if (step === 2) {
          const closed = obs.eyeAperture !== null && obs.eyeAperture < EYES_CLOSED_APERTURE
          if (closed) {
            closedSinceRef.current ??= now
            closedRef.current.push(obs.eyeAperture as number)
            if (now - closedSinceRef.current >= EYES_CLOSED_MS) {
              const baseline: Baseline = {
                eyeAperture: median(closedRef.current),
                shoulderY: median(shoulderRef.current.shoulder),
                headY: median(shoulderRef.current.head),
              }
              setBaseline(baseline)
              step = 3
            }
          } else {
            closedSinceRef.current = null
            closedRef.current = []
          }
        }

        return step === prev.step && obs === prev.observation ? prev : { step, observation: obs }
      })
    }, POLL_MS)

    return () => window.clearInterval(id)
  }, [active, observationRef, setBaseline])

  return state
}
