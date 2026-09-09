'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /games — Games landing page
// ═══════════════════════════════════════════════════════════════════════════

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const QuickMath = dynamic(() => import('@/components/games/QuickMath'), { ssr: false })

export default function GamesPage() {
  const [activeGame, setActiveGame] = useState<string | null>(null)

  if (activeGame === 'quick_math') {
    return (
      <div data-accent="cyan" style={{ minHeight: '100vh' }}>
        <div
          style={{
            maxWidth: 500,
            margin: '0 auto',
            padding: '24px 20px 48px',
          }}
        >
          {/* Back button */}
          <button
            onClick={() => setActiveGame(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '4px 0',
              marginBottom: 16,
            }}
          >
            ← Back to Games
          </button>

          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 4px',
            }}
          >
            ⚡ Quick Math
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
            Race against real players with fast mental calculations.
          </p>

          <QuickMath />
        </div>
      </div>
    )
  }

  return (
    <div data-accent="cyan" style={{ minHeight: '100vh' }}>
      <div
        style={{
          maxWidth: 600,
          margin: '0 auto',
          padding: '32px 20px 48px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <p style={{ fontSize: 40, margin: '0 0 8px' }}>🎮</p>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            Games
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Challenge friends or compete with anyone in real time.
            <br />
            No login required — just pick a nickname and play.
          </p>
        </div>

        {/* Quick Math Card */}
        <button
          onClick={() => setActiveGame('quick_math')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '20px 20px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
            boxShadow: 'var(--shadow-sm)',
            transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
          }}
          className="card-hover"
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'var(--accent-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0,
            }}
          >
            ⚡
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h2
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Quick Math
              </h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--success-text)',
                  background: 'var(--success-light)',
                  padding: '2px 8px',
                  borderRadius: 8,
                }}
              >
                LIVE
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Race against real players with fast mental calculations. Create a room or join with a code.
            </p>
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            Play →
          </span>
        </button>

        {/* Coming Soon Cards */}
        {[
          { emoji: '🏎️', title: 'Speed Math', desc: 'How fast can you solve? Race the clock.' },
          { emoji: '✖️', title: 'Multiplication Rush', desc: 'Master your times tables under pressure.' },
          { emoji: '➕', title: 'Addition Sprint', desc: 'Chain additions as fast as possible.' },
          { emoji: '⚔️', title: 'Number Clash', desc: 'Head-to-head number battles.' },
        ].map((game, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '16px 18px',
              marginTop: 10,
              opacity: 0.6,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {game.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  {game.title}
                </h3>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    background: 'var(--bg-tertiary)',
                    padding: '2px 8px',
                    borderRadius: 8,
                  }}
                >
                  COMING SOON
                </span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  margin: '2px 0 0',
                }}
              >
                {game.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
