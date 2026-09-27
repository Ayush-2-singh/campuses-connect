'use client'

import { Icon } from '@/components/icons'

export default function BlogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          margin: '0 auto 14px',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--accent-light)',
          color: 'var(--accent-text)',
        }}
      >
        <Icon name="notebook" size={30} strokeWidth={1.8} />
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
        Blog couldn&apos;t load
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>
        Something went wrong loading the blog. Try again.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '10px 24px',
          borderRadius: 10,
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Try again
      </button>
    </div>
  )
}
