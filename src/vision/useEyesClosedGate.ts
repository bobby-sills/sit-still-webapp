import { useEffect, useRef } from 'react'
import type { Baseline } from '../types'
import { median } from './verdict'
import type { Vision } from './useVision'

/**
 * Holds the sit at its starting line until the eyes are actually shut, and uses
 * that moment to record what shut looks like.
 *
 * This is where the eye baseline belongs. Asking for it during framing meant
 * closing your eyes to satisfy a checklist you then could not see, and doing it
 * a second time for real once the sit began. Here the two are the same act.
 */

const POLL_MS = 100
/** Aperture below this reads as shut on the blendshape scale. */
const EYES_CLOSED_APERTURE = 0.35
/** Long enough that a blink on the way in does not start the clock. */
const EYES_CLOSED_MS = 1200

/**
 * If detection never resolves — bad light, glasses, a model that cannot see
 * this face — the sit starts anyway rather than leaving someone sitting in
 * front of a timer that will not run.
 */
const GIVE_UP_MS = 45000

export function useEyesClosedGate(
  vision: Vision,
  active: boolean,
  onClosed: () => void,
): void {
  const { observationRef, postureRef, setBaseline } = vision
  const latestOnClosed = useRef(onClosed)
  latestOnClosed.current = onClosed

  useEffect(() => {
    if (!active) return
    const startedAt = performance.now()
    let closedSince: number | null = null
    let samples: number[] = []

    const settle = (eyeAperture: number) => {
      const posture = postureRef.current
      const observation = observationRef.current
      const baseline: Baseline = {
        eyeAperture,
        // Framing should have supplied these; fall back to the current frame so
        // a missing posture reading cannot strand the sit.
        shoulderY: posture?.shoulderY ?? observation?.shoulderY ?? 1,
        headY: posture?.headY ?? observation?.headY ?? 1,
      }
      setBaseline(baseline)
      latestOnClosed.current()
    }

    const id = window.setInterval(() => {
      const observation = observationRef.current
      const now = performance.now()

      if (now - startedAt > GIVE_UP_MS) {
        window.clearInterval(id)
        // No usable reading, so nothing can be judged against it: settle on a
        // baseline that never fires, and let the timer run.
        settle(samples.length > 0 ? median(samples) : 1)
        return
      }

      const aperture = observation?.eyeAperture ?? null
      if (!observation?.faceFound || aperture === null || aperture >= EYES_CLOSED_APERTURE) {
        closedSince = null
        samples = []
        return
      }

      closedSince ??= now
      samples.push(aperture)
      if (now - closedSince >= EYES_CLOSED_MS) {
        window.clearInterval(id)
        settle(median(samples))
      }
    }, POLL_MS)

    return () => window.clearInterval(id)
  }, [active, observationRef, postureRef, setBaseline])
}
