import { CameraPanel } from '../components/CameraPanel'
import type { Observation } from '../types'
import type { VisionStatus } from '../vision/useVision'

const STEPS = ['face in frame', 'shoulder line noted', 'eyes closed — baseline set']

/** What to say when the camera cannot be used, without making it feel like a failure. */
const UNAVAILABLE: Partial<Record<VisionStatus, string>> = {
  denied: 'The camera stayed shut. That is a fine way to meditate — the timer works either way.',
  unsupported: 'No camera here. That is a fine way to meditate — the timer works either way.',
  error: 'The camera could not be read. That is a fine way to meditate — the timer works either way.',
}

type Props = {
  desktop: boolean
  status: VisionStatus
  step: number
  observation: Observation | null
  videoRef: React.RefCallback<HTMLVideoElement>
  onStart: () => void
  onSitWithoutCamera: () => void
}

export function Calibrate({
  desktop,
  status,
  step,
  observation,
  videoRef,
  onStart,
  onSitWithoutCamera,
}: Props) {
  const unavailable = UNAVAILABLE[status]
  const ready = step >= 3

  const panel = (
    <CameraPanel
      videoRef={videoRef}
      live={status === 'ready'}
      caption={status === 'starting' ? 'waking the camera' : unavailable ? 'no feed' : 'camera feed'}
      observation={observation}
      showOval={step > 0}
      showShoulders={step > 1}
      ovalSize={desktop ? { width: 118, height: 154 } : { width: 96, height: 126 }}
    />
  )

  const detail = unavailable ? (
    <p className="calibrate__note">{unavailable}</p>
  ) : (
    <ol className="checklist">
      {STEPS.map((label, i) => (
        <li className={`checklist__item${step > i ? ' is-done' : ''}`} key={label}>
          <div className="checklist__dot" />
          <div className="checklist__label">{label}</div>
        </li>
      ))}
    </ol>
  )

  const action = unavailable ? (
    <button type="button" className="btn" onClick={onSitWithoutCamera}>
      without the camera
    </button>
  ) : (
    <div className={`calibrate__ready${ready ? ' is-ready' : ''}`}>
      <button type="button" className="btn" onClick={onStart} disabled={!ready}>
        close your eyes
      </button>
    </div>
  )

  if (!desktop) {
    return (
      <div className="screen screen--calibrate">
        <div className="eyebrow">framing</div>
        <div className="calibrate">
          {panel}
          {detail}
        </div>
        {action}
      </div>
    )
  }

  return (
    <div className="screen screen--calibrate">
      <div className="calibrate">
        {panel}
        <div className="calibrate__side">
          <div className="eyebrow">framing</div>
          {detail}
          {action}
        </div>
      </div>
    </div>
  )
}
