'use client'

import { useEffect, useState } from 'react'
import { getCookieConsent, CONSENT_EVENT } from '@/components/CookieConsent'

/**
 * ANALYTICS — privacy-first, consent-gated page analytics.
 *
 * Nothing loads until the user accepts the cookie banner AND an analytics
 * provider is configured, so:
 *   • no measurement script ever runs for declined/undecided visitors,
 *   • the component renders nothing (no layout shift) in every other case.
 *
 * Enable by setting env vars (Vercel → Project → Settings → Environment
 * Variables) — no code change needed:
 *   NEXT_PUBLIC_PLAUSIBLE_DOMAIN=connecttocampus.com   (Plausible, recommended)
 *   NEXT_PUBLIC_GA_MEASURE_ID=G-XXXXXXXXXX             (Google Analytics 4)
 * If both are set, both load; if neither, this is a silent no-op.
 *
 * GA4 is special: its loader is already in <head> (that is what the Search
 * Console ownership check reads), initialised with Consent Mode denied and
 * without `config`. This component therefore does not re-inject the script —
 * it only flips consent to granted and calls `config`, which is the moment the
 * first hit is sent.
 */
export default function Analytics() {
  const [consent, setConsent] = useState<'granted' | 'denied' | null>(null)

  useEffect(() => {
    setConsent(getCookieConsent())
    const sync = (e: Event) => setConsent((e as CustomEvent).detail ?? null)
    window.addEventListener(CONSENT_EVENT, sync)
    return () => window.removeEventListener(CONSENT_EVENT, sync)
  }, [])

  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  const gaId = process.env.NEXT_PUBLIC_GA_MEASURE_ID

  useEffect(() => {
    if (consent !== 'granted') return

    const added: HTMLScriptElement[] = []

    if (plausibleDomain) {
      const s = document.createElement('script')
      s.defer = true
      s.dataset.domain = plausibleDomain
      s.src = 'https://plausible.io/js/script.js'
      document.head.appendChild(s)
      added.push(s)
    }

    if (gaId) {
      const w = window as unknown as { dataLayer: unknown[]; gtag?: (...args: unknown[]) => void }
      // The <head> loader (app/layout.tsx) defines gtag and the dataLayer. If it
      // is missing — env var added after a cached page was served — inject the
      // script here so accepting still measures.
      if (!w.gtag) {
        const s = document.createElement('script')
        s.async = true
        s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`
        document.head.appendChild(s)
        added.push(s)
        w.dataLayer = w.dataLayer || []
        w.gtag = (...args: unknown[]) => w.dataLayer.push(args)
        w.gtag('js', new Date())
      }
      // Consent Mode: this is the first moment analytics storage may be used,
      // so it is also the first moment a hit is sent.
      w.gtag('consent', 'update', { analytics_storage: 'granted' })
      w.gtag('config', gaId, { anonymize_ip: true })
    }

    return () => {
      added.forEach((el) => el.remove())
    }
  }, [consent, plausibleDomain, gaId])

  return null
}
