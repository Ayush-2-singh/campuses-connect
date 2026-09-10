'use client'

export default function EventsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: 40, margin: '0 0 10px' }}>🎪</p>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Events failed to load</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>
        Couldn&apos;t load campus events. This might be a temporary issue.
      </p>
      <button onClick={reset}
        style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        Try again
      </button>
    </div>
  )
}
