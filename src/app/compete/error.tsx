'use client'

export default function CompeteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ margin: '0 0 10px', color: 'var(--accent-text)', display: 'flex', justifyContent: 'center' }}>
        <svg
          width={40}
          height={40}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
        </svg>
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
        Compete section failed
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>
        Couldn&apos;t load challenges or rankings. Try again.
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
