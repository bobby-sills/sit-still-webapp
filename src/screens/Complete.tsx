import { Stats } from '../components/Stats'
import { Timeline } from '../components/Timeline'
import { closingLine } from '../session/nudges'
import { minutesSat, percentages } from '../session/summary'
import type { SessionTotals } from '../types'

type Props = {
  desktop: boolean
  totals: SessionTotals
  onDone: () => void
}

export function Complete({ desktop, totals, onDone }: Props) {
  const pct = percentages(totals)
  const percent = (n: number) => `${Math.round(n * 100)}%`

  // Without the camera there is nothing to report but the sitting itself.
  const stats = totals.monitored
    ? [
        { label: 'settled', value: percent(pct.settled) },
        { label: 'eyes closed', value: percent(pct.eyesClosed) },
        { label: 'posture held', value: percent(pct.postureHeld) },
        { label: 'reminders', value: String(totals.nudges) },
      ]
    : []

  const count = (
    <div className="complete__count">
      <div className="complete__count-value">{minutesSat(totals.seconds)}</div>
      <div className="complete__count-label">minutes meditated</div>
    </div>
  )

  const timeline = totals.monitored ? (
    <Timeline
      buckets={totals.buckets}
      nudges={totals.nudges}
      track={desktop ? 64 : 38}
      base={desktop ? 8 : 6}
      span={desktop ? 54 : 30}
    />
  ) : null

  const closing = (
    <p className="complete__closing">
      {totals.monitored
        ? closingLine(totals.nudges, pct.settled)
        : 'No camera, no notes. Only the practice, which was the point.'}
    </p>
  )

  const done = (
    <button type="button" className="btn btn--soft" onClick={onDone}>
      done
    </button>
  )

  if (!desktop) {
    return (
      <div className="screen screen--complete">
        <div className="eyebrow">this meditation</div>
        <div className="complete">
          {count}
          {timeline}
          {stats.length > 0 && <Stats items={stats} />}
          {closing}
        </div>
        {done}
      </div>
    )
  }

  return (
    <div className="screen screen--complete">
      <div className="eyebrow">this meditation</div>
      <div className="complete">
        <div className="complete__left">
          {count}
          {closing}
          {done}
        </div>
        <div className="complete__right">
          {timeline}
          {stats.length > 0 && <Stats items={stats} />}
        </div>
      </div>
    </div>
  )
}
