import { CameraPanel } from '../components/CameraPanel'
import type { Minutes, NudgeVoice } from '../types'

const DURATIONS: Minutes[] = [5, 10, 20]
const VOICES: NudgeVoice[] = ['minimal', 'poetic']

type Props = {
  desktop: boolean
  minutes: Minutes
  onMinutes: (minutes: Minutes) => void
  voice: NudgeVoice
  onVoice: (voice: NudgeVoice) => void
  onBegin: () => void
  videoRef: React.RefCallback<HTMLVideoElement>
  previewLive: boolean
}

export function Home({
  desktop,
  minutes,
  onMinutes,
  voice,
  onVoice,
  onBegin,
  videoRef,
  previewLive,
}: Props) {
  const lead = (
    <div className="home__lead">
      <h1 className="home__headline">Sit. The camera watches so you don't have to.</h1>
      <p className="home__sub">
        {desktop
          ? 'Eyes open, shoulders creeping forward, a body drifting out of frame — a quiet word on screen, nothing more.'
          : 'Eyes open, shoulders forward, a body drifting away — a quiet word, nothing more. Nothing leaves the device.'}
      </p>
    </div>
  )

  const foot = (
    <div className="home__foot">
      <div className="label">length</div>
      <div className="durations" role="group" aria-label="Session length in minutes">
        {DURATIONS.map((value) => (
          <button
            type="button"
            key={value}
            className={`duration${value === minutes ? ' is-selected' : ''}`}
            aria-pressed={value === minutes}
            onClick={() => onMinutes(value)}
          >
            {value}
          </button>
        ))}
        <div className="durations__unit">min</div>
      </div>
      <div className="voice" role="group" aria-label="Reminder voice">
        <div className="voice__options">
          {VOICES.map((option) => (
            <button
              type="button"
              key={option}
              className={`voice__option${option === voice ? ' is-selected' : ''}`}
              aria-pressed={option === voice}
              onClick={() => onVoice(option)}
            >
              {option}
            </button>
          ))}
        </div>
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
            <div className="home__wordmark-note">nothing leaves this browser</div>
          </div>
          {lead}
          {foot}
        </div>
        <aside className="home__aside">
          <div className="mono">camera — preview only</div>
          <CameraPanel
            videoRef={videoRef}
            live={previewLive}
            caption="camera feed"
            showOval
            ovalSize={{ width: 92, height: 120 }}
            className="home__feed"
          />
          <p className="home__privacy">
            Frames are read and discarded in the tab. No upload, no recording, no account.
          </p>
        </aside>
      </div>
    </div>
  )
}
