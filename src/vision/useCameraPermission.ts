import { useEffect, useState } from 'react'

/**
 * Whether the camera is already allowed, asked without prompting for it.
 *
 * 'unknown' covers browsers with no queryable camera permission — Safari among
 * them — where the only way to find out is to ask. Callers must treat it as
 * "not granted" so that merely opening the page never raises a prompt.
 */
export type CameraPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

export function useCameraPermission(): CameraPermission {
  const [permission, setPermission] = useState<CameraPermission>('unknown')

  useEffect(() => {
    if (!navigator.permissions?.query) return
    let cancelled = false
    let status: PermissionStatus | null = null
    const onChange = () => {
      if (status && !cancelled) setPermission(status.state as CameraPermission)
    }

    void (async () => {
      try {
        const result = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        })
        if (cancelled) return
        status = result
        setPermission(result.state as CameraPermission)
        result.addEventListener('change', onChange)
      } catch {
        // No camera descriptor in this browser; stay 'unknown'.
      }
    })()

    return () => {
      cancelled = true
      status?.removeEventListener('change', onChange)
    }
  }, [])

  return permission
}
