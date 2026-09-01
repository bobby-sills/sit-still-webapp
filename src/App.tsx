import { useCallback, useEffect, useRef, useState } from 'react'
import { Calibrate } from './screens/Calibrate'
import { Complete } from './screens/Complete'
import { Home } from './screens/Home'
import { Session } from './screens/Session'
import { useSessionEngine } from './session/useSessionEngine'
import { clearProgress, loadProgress, loadVoice, saveSession, saveVoice } from './storage/local'
import type { Minutes, NudgeVoice, Observation, Screen, SessionTotals } from './types'
import { useIsDesktop } from './ui/useIsDesktop'
import { useCalibration } from './vision/useCalibration'
import { useCameraPermission } from './vision/useCameraPermission'
import { useVision } from './vision/useVision'

/**
 * How long a problem must persist before the app says anything. Small enough to
 * be useful, large enough that a blink or a shift in the seat never surfaces.
 */
const PATIENCE_SECONDS = 1.3

/** Dev-only clock scaling, so a 20 minute sit can be exercised in a minute. */
const SECONDS_PER_MINUTE = (() => {
  if (!import.meta.env.DEV) return 60
  const value = Number(new URLSearchParams(window.location.search).get('spm'))
  return Number.isFinite(value) && value > 0 ? value : 60
})()

export function App() {
  const desktop = useIsDesktop()
  const vision = useVision()
  const cameraPermission = useCameraPermission()

  const [interrupted] = useState(loadProgress)
  const [resume, setResume] = useState(interrupted)
  const [screen, setScreen] = useState<Screen>(interrupted ? 'session' : 'home')
  const [minutes, setMinutes] = useState<Minutes>(interrupted?.minutes ?? 10)
  const [voice, setVoice] = useState<NudgeVoice>(interrupted?.voice ?? loadVoice)
  const [monitored, setMonitored] = useState(false)
  const [totals, setTotals] = useState<SessionTotals | null>(null)
  // A monitored sit picked up after a reload has to reacquire the camera first.
  const [reacquiring, setReacquiring] = useState(Boolean(interrupted?.totals.monitored))

  const calibration = useCalibration(vision, screen === 'calibrate')
  const previewLive = screen === 'home' && vision.status === 'ready'
  const observation = useObservation(vision, (screen === 'session' && monitored) || previewLive)

  const { setBaseline, start, stop } = vision

  useEffect(() => {
    if (!interrupted) return
    let cancelled = false
    void start().then((status) => {
      if (cancelled) return
      const restored = status === 'ready' && interrupted.baseline !== null
      if (restored) setBaseline(interrupted.baseline)
      // If the camera cannot be had again, the rest of the sit is simply untimed
      // by the camera — better than reporting a watch that never happened.
      setMonitored(restored)
      setReacquiring(false)
    })
    return () => {
      cancelled = true
    }
  }, [interrupted, start, setBaseline])

  // Home shows a live preview only where the camera is already allowed, so
  // opening the page never raises a permission prompt on its own.
  useEffect(() => {
    if (screen === 'home' && cameraPermission === 'granted') void start()
  }, [screen, cameraPermission, start])

  const handleComplete = useCallback(
    (finalTotals: SessionTotals, startedAt: number) => {
      saveSession({ ...finalTotals, startedAt })
      setTotals(finalTotals)
      setResume(null)
      setScreen('complete')
      // The sit is over, so the camera goes off — visibly, at the hardware light.
      stop()
    },
    [stop],
  )

  const engine = useSessionEngine({
    active: screen === 'session' && !reacquiring,
    minutes,
    voice,
    monitored,
    patienceSeconds: PATIENCE_SECONDS,
    secondsPerMinute: SECONDS_PER_MINUTE,
    signalRef: vision.signalRef,
    baselineRef: vision.baselineRef,
    resume,
    onComplete: handleComplete,
  })

  const beginCalibration = useCallback(() => {
    clearProgress()
    setResume(null)
    setBaseline(null)
    setScreen('calibrate')
    void start()
  }, [setBaseline, start])

  const beginSession = useCallback(
    (watched: boolean) => {
      setMonitored(watched)
      setResume(null)
      setScreen('session')
    },
    [],
  )

  const chooseVoice = useCallback((next: NudgeVoice) => {
    setVoice(next)
    saveVoice(next)
  }, [])

  const goHome = useCallback(() => {
    setTotals(null)
    setScreen('home')
    // Where home will show a preview, keep the stream rather than stopping it
    // only to reacquire the camera and reload the models a moment later.
    if (cameraPermission !== 'granted') stop()
  }, [stop, cameraPermission])

  if (screen === 'session' && reacquiring) {
    return <div className={shellClass(desktop)} />
  }

  return (
    <div className={shellClass(desktop)}>
      {screen === 'home' && (
        <Home
          desktop={desktop}
          minutes={minutes}
          onMinutes={setMinutes}
          voice={voice}
          onVoice={chooseVoice}
          onBegin={beginCalibration}
          videoRef={vision.videoRef}
          previewLive={previewLive}
          observation={observation}
        />
      )}

      {screen === 'calibrate' && (
        <Calibrate
          desktop={desktop}
          status={vision.status}
          step={calibration.step}
          observation={calibration.observation}
          videoRef={vision.videoRef}
          onStart={() => beginSession(true)}
          onSitWithoutCamera={() => beginSession(false)}
        />
      )}

      {screen === 'session' && (
        <Session
          desktop={desktop}
          display={engine.display}
          monitored={monitored}
          observation={observation}
          videoRef={vision.videoRef}
          onEnd={engine.end}
        />
      )}

      {screen === 'complete' && totals && (
        <Complete desktop={desktop} totals={totals} onDone={goHome} />
      )}
    </div>
  )
}

function shellClass(desktop: boolean): string {
  return `app ${desktop ? 'is-desktop' : 'is-mobile'}`
}

/**
 * Surfaces the latest frame reading for the session's feed overlays. Detection
 * runs far faster than this; the overlays only need to keep up with a body.
 */
function useObservation(
  vision: ReturnType<typeof useVision>,
  active: boolean,
  intervalMs = 500,
): Observation | null {
  const [observation, setObservation] = useState<Observation | null>(null)
  const { observationRef } = vision
  const latest = useRef(observationRef)
  latest.current = observationRef

  useEffect(() => {
    if (!active) {
      setObservation(null)
      return
    }
    const id = window.setInterval(() => setObservation(latest.current.current), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])

  return observation
}
