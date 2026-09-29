import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'The page you are looking for does not exist on ConnectToCampus.',
  robots: { index: false },
}

/**
 * CUSTOM 404 — brand-consistent fallback with clear recovery paths instead of
 * the bare Next.js default. Offers the two destinations users almost always
 * want: the feed (product home) and the notes library (top search landing).
 */
export default function NotFound() {
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
      <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <p
          style={{
            fontSize: 64,
            fontWeight: 800,
            margin: 0,
            lineHeight: 1,
            background: 'linear-gradient(120deg, var(--accent), var(--accent-text))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
          aria-hidden="true"
        >
          404
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '10px 0 6px' }}>This page went missing</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 22px', lineHeight: 1.5 }}>
          The link may be old or mistyped. The campus, however, is still very much here.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/feed"
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
            Go to Feed
          </Link>
          <Link
            href="/notes"
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
            Browse Notes
          </Link>
        </div>
      </div>
    </main>
  )
}
