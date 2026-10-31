'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/icons'
import { isNativePlatform } from '@/lib/native'
import { CONSENT_EVENT, readConsent } from '@/lib/consent'

/**
 * INSTALL TO HOME SCREEN — the one prompt the PWA was missing.
 *
 * Chromium fires `beforeinstallprompt`; we hold the event and show our own card
 * so the install action is a normal, branded button instead of a tiny browser
 * menu entry. iOS Safari has no such event, so those visitors get the manual
 * Share → Add to Home Screen instruction instead. Nothing is shown in the
 * Capacitor shell (already an app), once the app is installed/standalone, on
 * auth/admin flows, or for 30 days after a dismissal.
 *
 * The prompt waits for the cookie choice so it never stacks on top of the
 * consent banner — both are fixed to the bottom of the screen.
 */

const DISMISS_KEY = 'cc-install-prompt-dismissed'
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000
const SHOW_DELAY_MS = 2500

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  const iOSStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return window.matchMedia('(display-mode: standalone)').matches || iOSStandalone
}

function isIOSSafari() {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  // CriOS/FxiOS/EdgiOS are WebKit but expose no Add to Home Screen flow.
  const safari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua)
  return iOS && safari
}

function dismissedRecently() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS
  } catch {
    return false
  }
}

function hasConsent() {
  try {
    return readConsent(window.localStorage, document.cookie) !== null
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const pathname = usePathname()
  const [mode, setMode] = useState<'chromium' | 'ios' | null>(null)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const excluded = pathname.startsWith('/auth') || pathname.startsWith('/admin') || pathname === '/offline'
    if (excluded) {
      setMode(null)
      return
    }

    if (isNativePlatform() || isStandalone() || dismissedRecently()) return

    const ios = isIOSSafari()
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const reveal = () => {
      if (cancelled || timer) return
      timer = setTimeout(() => {
        if (cancelled) return
        if (ios) setMode('ios')
        else if (deferredRef.current) setMode('chromium')
      }, SHOW_DELAY_MS)
    }

    const onBeforeInstall = (event: Event) => {
      // Keep Chromium's mini-infobar out of the way; our card calls prompt().
      event.preventDefault()
      deferredRef.current = event as BeforeInstallPromptEvent
      if (hasConsent()) reveal()
    }

    const onConsent = () => {
      if (ios || deferredRef.current) reveal()
    }

    const onInstalled = () => {
      if (timer) clearTimeout(timer)
      setMode(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener(CONSENT_EVENT, onConsent)

    // An already-decided visitor (or iOS) does not need to wait for an event.
    if (ios && hasConsent()) reveal()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener(CONSENT_EVENT, onConsent)
    }
  }, [pathname])

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* private mode — the prompt just comes back next visit */
    }
    setMode(null)
  }

  const install = async () => {
    const event = deferredRef.current
    if (!event) return
    deferredRef.current = null
    try {
      await event.prompt()
      await event.userChoice
    } catch {
      /* the browser withdrew the prompt — fall through and hide the card */
    }
    setMode(null)
  }

  if (!mode) return null

  return (
    <aside className="pwa-install" role="dialog" aria-modal="false" aria-labelledby="pwa-install-title">
      <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="Dismiss install prompt">
        <Icon name="x" size={15} />
      </button>

      <div className="pwa-install-head">
        <Image src="/icon-192.png" alt="" width={38} height={38} unoptimized className="pwa-install-icon" />
        <div>
          <p id="pwa-install-title" className="pwa-install-title">
            Install ConnectToCampus
          </p>
          <p className="pwa-install-body">
            {mode === 'ios'
              ? 'Tap Share, then “Add to Home Screen” for one-tap access — even offline.'
              : 'Add it to your home screen for one-tap access — even offline.'}
          </p>
        </div>
      </div>

      <div className="pwa-install-actions">
        {mode === 'chromium' ? (
          <>
            <button className="pwa-install-skip" type="button" onClick={dismiss}>
              Not now
            </button>
            <button className="pwa-install-cta" type="button" onClick={install}>
              Install app
            </button>
          </>
        ) : (
          <button className="pwa-install-cta" type="button" onClick={dismiss}>
            Got it
          </button>
        )}
      </div>
    </aside>
  )
}
