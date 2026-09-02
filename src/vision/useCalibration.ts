import { useEffect, useRef, useState } from 'react'
import type { Observation } from '../types'
import { median } from './verdict'
import type { Vision } from './useVision'

/**
 * Walks the two framing checks, each driven by what the camera actually sees:
 *
 *   0 → 1  a face has held still in frame for a moment
 *   1 → 2  both shoulders have been read, fixing the posture baseline
 *
 * Both are things you can watch happen with your eyes open. The eye baseline is
 * captured later, by useEyesClosedGate, at the moment the sit actually begins.
 */

const POLL_MS = 100
const FACE_STABLE_MS = 1000
const SHOULDER_SAMPLES = 10

export type CalibrationState = {
  /** 0 to 2; 2 means framing is settled and the sit can begin. */
  step: number
  /** The live observation, for the framing overlays. */
  observation: Observation | null
}

export function useCalibration(vision: Vision, active: boolean): CalibrationState {
  const [state, setState] = useState<CalibrationState>({ step: 0, observation: null })
  const { observationRef, setPosture } = vision

  const faceSinceRef = useRef<number | null>(null)
  const shoulderRef = useRef<{ shoulder: number[]; head: number[] }>({ shoulder: [], head: [] })

  useEffect(() => {
    if (!active) return
    faceSinceRef.current = null
    shoulderRef.current = { shoulder: [], head: [] }
    setState({ step: 0, observation: null })

    const id = window.setInterval(() => {
      const obs = observationRef.current
      const now = performance.now()

      setState((prev) => {
        let step = prev.step
        if (!obs || !obs.faceFound) {
          // Losing the face pauses progress but never takes back a passed check.
          faceSinceRef.current = null
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
          if (shoulderRef.current.shoulder.length >= SHOULDER_SAMPLES) {
            setPosture({
              shoulderY: median(shoulderRef.current.shoulder),
              headY: median(shoulderRef.current.head),
            })
            step = 2
          }
        }

        return step === prev.step && obs === prev.observation ? prev : { step, observation: obs }
      })
    }, POLL_MS)

    return () => window.clearInterval(id)
  }, [active, observationRef, setPosture])

  return state
}
