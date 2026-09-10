'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /games/room/[code] — Direct room link (shareable join URL)
// ═══════════════════════════════════════════════════════════════════════════

import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const QuickMath = dynamic(() => import('@/components/games/QuickMath'), { ssr: false })

export default function GameRoomPage() {
  const params = useParams()
  const code = (params.code as string) || ''

  return (
    <div data-accent="cyan" style={{ minHeight: '100vh' }}>
      <div
        style={{
          maxWidth: 500,
          margin: '0 auto',
          padding: '24px 20px 48px',
        }}
      >
        {/* Back button — games live in the Compete section */}
        <a
          href="/compete?tab=clash"
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
          ← Back to Compete
        </a>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 4px',
          }}
        >
          ⚡ Quick Math
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>Join room {code}</p>

        <QuickMath initialRoomCode={code} />
      </div>
    </div>
  )
}
