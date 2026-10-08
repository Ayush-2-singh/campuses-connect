'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /games/typing — deep-linkable route (shareable room codes land here)
// ═══════════════════════════════════════════════════════════════════════════

import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const TypingBattle = dynamic(() => import('@/components/games/TypingBattle'), { ssr: false })

export default function TypingPage() {
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

        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          ⌨️ Typing Battle
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          {code ? `Join room ${code}` : 'Race another student. Type faster. Make fewer mistakes.'}
        </p>

        <TypingBattle initialRoomCode={code} />
      </div>
    </div>
  )
}
