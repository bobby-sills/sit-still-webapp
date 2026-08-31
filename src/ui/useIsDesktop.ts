import { useEffect, useState } from 'react'

/**
 * The two designs are structurally different — the desktop layout is not the
 * mobile one stretched — so the arrangement is chosen here rather than being
 * bent into shape with media queries alone.
 */
const QUERY = '(min-width: 960px)'

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const onChange = () => setIsDesktop(media.matches)
    media.addEventListener('change', onChange)
    onChange()
    return () => media.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
