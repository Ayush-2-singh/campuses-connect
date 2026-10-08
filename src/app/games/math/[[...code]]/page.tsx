'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /games/math — Quick Math deep-linkable route (mirrors /games/typing)
// Shareable room codes land here: /games/math/ABC123
// ═══════════════════════════════════════════════════════════════════════════

import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const QuickMath = dynamic(() => import('@/components/games/QuickMath'), { ssr: false })

export default function MathGamePage() {
  const params = useParams()
  const code = typeof params?.code === 'string' ? params.code : ''

  return (
    <div data-accent="gold" style={{ minHeight: 'var(--app-vh)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 60px' }}>
        <a
          href="/games"
          style={{
            display: 'inline-block',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '4px 0',
            marginBottom: 16,
            textDecoration: 'none',
          }}
        >
          ← Back to Games
        </a>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Quick Math</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          {code ? `Join room ${code}` : 'Race another student. Solve faster. Beat the clock.'}
        </p>

        <QuickMath initialRoomCode={code} />
      </div>
    </div>
  )
}
