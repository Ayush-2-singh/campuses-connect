import Link from 'next/link'
import type { Metadata } from 'next'
import { Icon } from '@/components/icons'

export const metadata: Metadata = {
  title: 'You are offline',
  description: 'ConnectToCampus is unavailable right now. Check your connection and try again.',
  robots: { index: false },
}

/**
 * Served by the service worker when a navigation misses both the network and
 * every cached page. Kept deliberately static and free of data fetches so it
 * renders with only the precached shell.
 */
export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: 'var(--app-vh)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-page)',
        color: 'var(--text-primary)',
        padding: '24px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 18px',
            borderRadius: 18,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--bg)',
            border: '1px solid var(--border-strong)',
            color: 'var(--accent)',
          }}
        >
          <Icon name="wifi-off" size={30} strokeWidth={2} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>You&apos;re offline</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 22px', lineHeight: 1.6 }}>
          ConnectToCampus needs a connection for most of the site. Pages you opened while online stay available — check
          your network and try again.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 14,
              padding: '11px 20px',
              borderRadius: 10,
            }}
          >
            Try again
          </Link>
          <Link
            href="/experiences"
            style={{
              background: 'var(--bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
              padding: '11px 20px',
              borderRadius: 10,
            }}
          >
            Browse experiences
          </Link>
        </div>
      </div>
    </main>
  )
}
