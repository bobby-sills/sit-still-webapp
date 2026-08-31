import { disturbanceLabel } from '../session/summary'

type Props = {
  /** Fraction of each bucket that was not settled; null where nothing was sampled. */
  buckets: Array<number | null>
  nudges: number
  /** Bar geometry, which differs between the two layouts. */
  track: number
  base: number
  span: number
}

/**
 * The shape of the sit: where the attention went, and where it stayed. Buckets
 * with no data — a backgrounded tab, or time never reached — sit at the faintest
 * opacity rather than reading as calm.
 */
export function Timeline({ buckets, nudges, track, base, span }: Props) {
  return (
    <div className="timeline">
      <div className="timeline__bars" style={{ height: track }} aria-hidden="true">
        {buckets.map((fraction, i) => (
          <div
            key={i}
            className="timeline__bar"
            style={
              fraction === null
                ? { height: 2, opacity: 0.08 }
                : { height: Math.round(base + fraction * span), opacity: fraction > 0.3 ? 0.95 : 0.22 }
            }
          />
        ))}
      </div>
      <div className="timeline__axis">
        <div>start</div>
        <div>{disturbanceLabel(nudges)}</div>
        <div>end</div>
      </div>
    </div>
  )
}
