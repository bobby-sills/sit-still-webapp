import { CameraPanel } from '../components/CameraPanel'
import type { Minutes, NudgeVoice, Observation } from '../types'

const DURATIONS: Minutes[] = [5, 10, 20]
const VOICES: NudgeVoice[] = ['minimal', 'poetic']

type Props = {
  desktop: boolean
  minutes: Minutes
  onMinutes: (minutes: Minutes) => void
  voice: NudgeVoice
  onVoice: (voice: NudgeVoice) => void
  sound: boolean
  onSound: (enabled: boolean) => void
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
  voice,
  onVoice,
  sound,
  onSound,
  onBegin,
  videoRef,
  previewLive,
  observation,
}: Props) {
  const lead = (
    <div className="home__lead">
      <h1 className="home__headline">Meditate. The camera watches so you don't have to.</h1>
      <p className="home__sub">
        {desktop
          ? 'Attention wanders and the body shows it — eyes opening, shoulders creeping forward. A quiet word on screen brings you back, nothing more.'
          : 'Attention wanders and the body shows it — eyes opening, shoulders folding. A quiet word brings you back. Nothing leaves the device.'}
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
      <div className="voice">
        <div className="voice__options" role="group" aria-label="Reminder voice">
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
        {/* Sound carries the session with the eyes shut, so it is on by
            default — but a shared room is reason enough to turn it off. */}
        <button
          type="button"
          className={`voice__option${sound ? ' is-selected' : ''}`}
          aria-pressed={sound}
          onClick={() => onSound(!sound)}
        >
          {sound ? 'sound on' : 'sound off'}
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
            <div className="home__wordmark-note">nothing leaves this browser</div>
          </div>
          {lead}
          {foot}
        </div>
        <aside className="home__aside">
          {previewLive && (
            <>
              <div className="mono">camera — preview only</div>
              <CameraPanel
                videoRef={videoRef}
                live
                caption="camera feed"
                observation={observation}
                showOval
                ovalSize={{ width: 92, height: 120 }}
                className="home__feed"
              />
            </>
          )}
          <p className="home__privacy">
            Frames are read and discarded in the tab. No upload, no recording, no account.
          </p>
        </aside>
      </div>
    </div>
  )
}
