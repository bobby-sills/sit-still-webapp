import type { Observation } from '../types'

type Props = {
  videoRef: React.RefCallback<HTMLVideoElement>
  /** The feed is only painted once there is something to paint. */
  live: boolean
  /** Shown over the stripes while there is no picture. */
  caption: string
  /** Live landmarks, so the overlays sit on the real face rather than a guess. */
  observation?: Observation | null
  showOval?: boolean
  showShoulders?: boolean
  /** Fallback oval geometry, matching the design, before any face is found. */
  ovalSize?: { width: number; height: number }
  className?: string
}

/**
 * The live feed. The <video> element is the only place a frame ever exists —
 * it is never drawn to a canvas, copied, or sent anywhere.
 */
export function CameraPanel({
  videoRef,
  live,
  caption,
  observation,
  showOval = false,
  showShoulders = false,
  ovalSize = { width: 96, height: 126 },
  className = '',
}: Props) {
  const box = observation?.faceBox ?? null
  // The feed is mirrored for the viewer, so landmark x must be mirrored too.
  const ovalStyle: React.CSSProperties = box
    ? {
        left: `${(1 - box.cx) * 100}%`,
        top: `${box.cy * 100}%`,
        width: `${box.w * 118}%`,
        height: `${box.h * 108}%`,
      }
    : { left: '50%', top: '46%', width: ovalSize.width, height: ovalSize.height }

  const shoulderY = observation?.shoulderY ?? null

  return (
    <div className={`feed ${className}`.trim()}>
      <video
        ref={videoRef}
        className={`feed__video${live ? ' is-live' : ''}`}
        playsInline
        muted
        autoPlay
      />
      <div className="feed__caption" style={{ opacity: live ? 0 : 1 }}>
        {caption}
      </div>
      <div className="feed__oval" style={{ ...ovalStyle, opacity: showOval ? 1 : 0 }} />
      <div
        className="feed__shoulders"
        style={{
          left: '14%',
          right: '14%',
          top: shoulderY !== null ? `${shoulderY * 100}%` : '78%',
          opacity: showShoulders ? 1 : 0,
        }}
      />
    </div>
  )
}
