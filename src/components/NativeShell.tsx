'use client'

/**
 * Boots the Capacitor shell from inside the React tree.
 *
 * Renders nothing and does nothing on the web (every call below no-ops), so it
 * is safe to mount unconditionally in the root layout.
 *
 * Responsibilities:
 *   - start the native bridge (status bar, back button, network, deep links)
 *   - hide the splash screen once the app shell has painted and the session
 *     has been restored, so users never see a white flash or a stuck splash
 *   - refresh the Supabase session when the app returns to the foreground
 */

import { useEffect } from 'react'
import { initNative, isNativePlatform } from '@/lib/native'
import { createClient } from '@/lib/supabase/client'

/** Never leave the user staring at the splash because a request hung. */
const SPLASH_TIMEOUT_MS = 2500

export default function NativeShell() {
  useEffect(() => {
    if (!isNativePlatform()) return

    let cancelled = false
    let detach: (() => void) | undefined
    const supabase = createClient()

    const hideSplash = async () => {
      // `getSession()` also refreshes an expired token, which is exactly the
      // "restore on relaunch / handle expiry" behaviour we want before the
      // first authenticated render.
      await Promise.race([
        supabase.auth.getSession().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, SPLASH_TIMEOUT_MS)),
      ])

      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide({ fadeOutDuration: 200 })
      } catch (err) {
        console.error('[native] could not hide splash:', err)
      }
    }

    initNative({
      onResume: () => {
        void supabase.auth.getSession().catch(() => undefined)
      },
    })
      .then((teardown) => {
        if (cancelled) {
          teardown()
          return
        }
        detach = teardown
      })
      .catch((err: unknown) => console.error('[native] init failed:', err))
      .finally(() => {
        if (!cancelled) void hideSplash()
      })

    return () => {
      cancelled = true
      detach?.()
    }
  }, [])

  return null
}
