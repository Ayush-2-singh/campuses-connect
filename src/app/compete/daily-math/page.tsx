'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /compete/daily-math — today's seeded Quick Math set + its board.
// ═══════════════════════════════════════════════════════════════════════════

import dynamic from 'next/dynamic'

const DailyMath = dynamic(() => import('@/components/games/DailyMath'), { ssr: false })

export default function DailyMathPage() {
  return (
    <div data-accent="gold" style={{ minHeight: 'var(--app-vh)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 60px' }}>
        <a
          href="/compete?tab=games"
          style={{
            display: 'inline-block',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            padding: '4px 0',
            marginBottom: 16,
            textDecoration: 'none',
          }}
        >
          ← All games
        </a>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          Daily Quick Math
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          One set a day, the same for everyone. Play solo, no room code.
        </p>

        <DailyMath />
      </div>
    </div>
  )
}
