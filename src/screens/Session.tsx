import { BreathOrb } from '../components/BreathOrb'
import { CameraPanel } from '../components/CameraPanel'
import { signalLabel } from '../session/nudges'
import type { SessionDisplay } from '../session/useSessionEngine'
import type { Observation } from '../types'

type Props = {
  desktop: boolean
  display: SessionDisplay
  /** False when the sit is running without the camera; the indicator goes away. */
  monitored: boolean
  observation: Observation | null
  videoRef: React.RefCallback<HTMLVideoElement>
  onEnd: () => void
}

export function Session({ desktop, display, monitored, observation, videoRef, onEnd }: Props) {
  return (
    <div className="screen screen--session">
      <div className="session">
        <div className="session__status">
          {monitored && (
            <>
              <div className="session__status-dot" />
              <div className="mono">watching</div>
            </>
          )}
        </div>

        <div className="session__body">
          <div className="session__stack">
            <BreathOrb />
            <div
              className="session__countdown"
              role="timer"
              aria-live="off"
              aria-label={`${display.remaining} remaining`}
            >
              {display.remaining}
            </div>
          </div>
          <div className="session__nudge">
            {/* Held in the DOM at all times so its height never shifts the screen. */}
            <div
              className={`session__nudge-text${display.nudgeVisible ? ' is-visible' : ''}`}
              aria-live="polite"
            >
              {display.nudgeText}
            </div>
          </div>
        </div>

        <div className="session__foot">
          <button type="button" className="link-btn" onClick={onEnd}>
            end
          </button>
          {monitored && (
            <div className="session__watch">
              <div className="session__signal">{signalLabel(display.signal)}</div>
              {desktop && (
                <CameraPanel
                  videoRef={videoRef}
                  live
                  caption="camera feed"
                  observation={observation}
                  showOval
                  showShoulders
                  ovalSize={{ width: 34, height: 44 }}
                  className="session__thumb"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
