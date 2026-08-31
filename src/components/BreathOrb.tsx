/**
 * The breath pacer. One full cycle takes 11 seconds — a slow, even breath —
 * and nothing about it responds to the camera. It is the one thing on the
 * session screen that is simply there to be watched.
 */
export function BreathOrb() {
  return (
    <div className="orb__frame" aria-hidden="true">
      <div className="orb" />
    </div>
  )
}
