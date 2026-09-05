import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calibrate } from './screens/Calibrate'
import { Complete } from './screens/Complete'
import { Home } from './screens/Home'
import { Session } from './screens/Session'
import { BEGIN_FILE, END_FILE, type NudgeLine } from './session/nudges'
import { Chimes } from './session/sounds'
import { useSessionEngine } from './session/useSessionEngine'
import { AFTER_END_CHIME, AFTER_NUDGE_CHIME, Voice } from './session/voice'
import {
  clearProgress,
  loadProgress,
  loadSound,
  loadVoice,
  saveSession,
  saveSound,
  saveVoice,
} from './storage/local'
import type { Minutes, Observation, Screen, SessionTotals, Signal } from './types'
import { useIsDesktop } from './ui/useIsDesktop'
import { useCalibration } from './vision/useCalibration'
import { useCameraPermission } from './vision/useCameraPermission'
import { useEyesClosedGate } from './vision/useEyesClosedGate'
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
  const [monitored, setMonitored] = useState(false)
  const [totals, setTotals] = useState<SessionTotals | null>(null)
  const [sound, setSound] = useState(loadSound)
  const [voiceOn, setVoiceOn] = useState(loadVoice)
  /**
   * A monitored sit waits at its starting line until the eyes close, rather
   * than making someone set an eye baseline they cannot see the result of.
   */
  const [awaitingEyes, setAwaitingEyes] = useState(false)
  // A monitored sit picked up after a reload has to reacquire the camera first.
  const [reacquiring, setReacquiring] = useState(Boolean(interrupted?.totals.monitored))

  const chimes = useMemo(() => new Chimes(), [])
  useEffect(() => chimes.setEnabled(sound), [chimes, sound])
  useEffect(() => () => chimes.close(), [chimes])

  const voice = useMemo(() => new Voice(), [])
  useEffect(() => voice.setEnabled(voiceOn), [voice, voiceOn])
  useEffect(() => () => voice.close(), [voice])

  const beginTimer = useCallback(() => {
    setAwaitingEyes(false)
    chimes.play('start')
  }, [chimes])

  useEyesClosedGate(vision, screen === 'session' && awaitingEyes, beginTimer)

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
      chimes.play('end')
      // The bell rings out before the words, rather than over them.
      voice.play(END_FILE, sound ? AFTER_END_CHIME : 0)
      setTotals(finalTotals)
      setResume(null)
      setScreen('complete')
      // The sit is over, so the camera goes off — visibly, at the hardware light.
      stop()
    },
    [stop, chimes, voice, sound],
  )

  const onNudge = useCallback(
    (signal: Exclude<Signal, 'settled'>, line: NudgeLine) => {
      chimes.play(signal)
      voice.play(line.file, sound ? AFTER_NUDGE_CHIME : 0)
    },
    [chimes, voice, sound],
  )

  const engine = useSessionEngine({
    active: screen === 'session' && !reacquiring && !awaitingEyes,
    minutes,
    monitored,
    patienceSeconds: PATIENCE_SECONDS,
    secondsPerMinute: SECONDS_PER_MINUTE,
    signalRef: vision.signalRef,
    baselineRef: vision.baselineRef,
    resume,
    onComplete: handleComplete,
    onNudge,
  })

  const beginCalibration = useCallback(() => {
    // Audio has to be armed inside a real gesture or the first cue is swallowed.
    // This is also where the spoken lines start loading; framing buys the time.
    chimes.unlock()
    voice.unlock()
    clearProgress()
    setResume(null)
    setBaseline(null)
    setScreen('calibrate')
    void start()
  }, [setBaseline, start, chimes, voice])

  const beginSession = useCallback(
    (watched: boolean) => {
      chimes.unlock()
      voice.unlock()
      setMonitored(watched)
      setResume(null)
      setScreen('session')
      // Unwatched, there is nothing to wait for, so the sit starts at once.
      setAwaitingEyes(watched)
      if (watched) voice.play(BEGIN_FILE)
      else chimes.play('start')
    },
    [chimes, voice],
  )

  const chooseSound = useCallback(
    (next: boolean) => {
      setSound(next)
      saveSound(next)
      if (next) chimes.unlock()
    },
    [chimes],
  )

  const chooseVoice = useCallback(
    (next: boolean) => {
      setVoiceOn(next)
      saveVoice(next)
      // Turning it on here starts the download, well before it is needed.
      if (next) voice.unlock()
    },
    [voice],
  )

  const goHome = useCallback(() => {
    setTotals(null)
    setAwaitingEyes(false)
    setScreen('home')
    // Where home will show a preview, keep the stream rather than stopping it
    // only to reacquire the camera and reload the models a moment later.
    if (cameraPermission !== 'granted') stop()
  }, [stop, cameraPermission])

  if (screen === 'session' && reacquiring) {
    return (
      <div className={shellClass(desktop)}>
        <video ref={vision.videoRef} className="detector-video" playsInline muted autoPlay />
      </div>
    )
  }

  return (
    <div className={shellClass(desktop)}>
      {/* Detection reads from this element on every screen, including the ones
          that show no camera panel at all. It must never unmount while a sit
          is being watched. */}
      <video ref={vision.videoRef} className="detector-video" playsInline muted autoPlay />

      {screen === 'home' && (
        <Home
          desktop={desktop}
          minutes={minutes}
          onMinutes={setMinutes}
          sound={sound}
          onSound={chooseSound}
          voice={voiceOn}
          onVoice={chooseVoice}
          onBegin={beginCalibration}
          videoRef={vision.previewRef}
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
          videoRef={vision.previewRef}
          onStart={() => beginSession(true)}
          onSitWithoutCamera={() => beginSession(false)}
        />
      )}

      {screen === 'session' && (
        <Session
          desktop={desktop}
          display={engine.display}
          monitored={monitored}
          awaitingEyes={awaitingEyes}
          observation={observation}
          videoRef={vision.previewRef}
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
