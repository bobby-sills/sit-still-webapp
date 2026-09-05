import { useState } from 'react'
import { CameraPanel } from '../components/CameraPanel'
import type { Minutes, Observation } from '../types'

const PRESETS: Minutes[] = [5, 10, 15, 20]

/** A sit has to be worth sitting, and long enough to lose an afternoon to. */
const MIN_MINUTES = 1
const MAX_MINUTES = 180

type Props = {
  desktop: boolean
  minutes: Minutes
  onMinutes: (minutes: Minutes) => void
  sound: boolean
  onSound: (enabled: boolean) => void
  voice: boolean
  onVoice: (enabled: boolean) => void
  onBegin: () => void
  videoRef: React.RefCallback<HTMLVideoElement>
  /**
   * Only true once a stream is actually running. There is no placeholder
   * preview: a striped panel that never resolves into a picture reads as
   * broken, so when the camera is not already allowed the panel is absent.
   */
  previewLive: boolean
  observation: Observation | null
}

export function Home({
  desktop,
  minutes,
  onMinutes,
  sound,
  onSound,
  voice,
  onVoice,
  onBegin,
  videoRef,
  previewLive,
  observation,
}: Props) {
  // A length that is not one of the presets can only have been typed.
  const [custom, setCustom] = useState(() => !PRESETS.includes(minutes))
  const [draft, setDraft] = useState(() => String(minutes))

  const enterCustom = (raw: string) => {
    setDraft(raw)
    const typed = Number(raw)
    // Mid-edit the box can be empty or nonsense; the sit keeps its old length
    // until something usable is in it.
    if (raw.trim() === '' || !Number.isFinite(typed)) return
    onMinutes(Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(typed))))
  }

  const lead = (
    <div className="home__lead">
      <h1 className="home__headline">A meditation app that watches over you, keeping your focus.</h1>
      <p className="home__sub">
        Remembering to keep your eyes closed and posture straight can be hard. Let this app
        keep you in check.
      </p>
    </div>
  )

  const foot = (
    <div className="home__foot">
      <div className="label">length</div>
      <div className="durations" role="group" aria-label="Session length in minutes">
        {PRESETS.map((value) => (
          <button
            type="button"
            key={value}
            className={`duration${!custom && value === minutes ? ' is-selected' : ''}`}
            aria-pressed={!custom && value === minutes}
            onClick={() => {
              setCustom(false)
              onMinutes(value)
            }}
          >
            {value}
          </button>
        ))}
        {custom ? (
          <input
            className="duration duration--custom is-selected"
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            aria-label="Session length in minutes"
            value={draft}
            autoFocus
            // Sized to what has been typed, so the row stays as tight as the numerals.
            style={{ width: `${Math.max(1, draft.length)}ch` }}
            onChange={(event) => enterCustom(event.target.value)}
            // An abandoned or out-of-range entry falls back to what is running.
            onBlur={() => setDraft(String(minutes))}
          />
        ) : (
          <button
            type="button"
            className="duration duration--other"
            onClick={() => {
              setDraft(String(minutes))
              setCustom(true)
            }}
          >
            other
          </button>
        )}
        <div className="durations__unit">min</div>
      </div>
      {/* Both carry the session with the eyes shut, so both are on by
          default — but a shared room is reason enough to turn them off. */}
      <div className="settings">
        <button
          type="button"
          className={`settings__toggle${sound ? ' is-selected' : ''}`}
          aria-pressed={sound}
          onClick={() => onSound(!sound)}
        >
          {sound ? 'sound on' : 'sound off'}
        </button>
        <button
          type="button"
          className={`settings__toggle${voice ? ' is-selected' : ''}`}
          aria-pressed={voice}
          onClick={() => onVoice(!voice)}
        >
          {voice ? 'voice on' : 'voice off'}
        </button>
      </div>
      <button type="button" className="btn home__begin" onClick={onBegin}>
        begin
      </button>
    </div>
  )

  if (!desktop) {
    return (
      <div className="screen screen--home">
        <div className="eyebrow">still</div>
        <div className="home">
          {lead}
          {foot}
        </div>
      </div>
    )
  }

  return (
    <div className="screen screen--home">
      <div className="home">
        <div className="home__main">
          <div className="home__wordmark">
            <div className="home__wordmark-name">still</div>
          </div>
          {lead}
          {foot}
        </div>
        <aside className="home__aside">
          {previewLive && (
            <CameraPanel
              videoRef={videoRef}
              live
              caption="camera feed"
              observation={observation}
              showOval
              ovalSize={{ width: 92, height: 120 }}
              className="home__feed"
            />
          )}
          <p className="home__privacy">
            All processing happens locally, and every frame is discarded the moment it is
            read. Only past meditation sessions are saved on this device. No video, audio,
            or personal information is ever uploaded to any server.
          </p>
        </aside>
      </div>
    </div>
  )
}
