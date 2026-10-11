'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /games/math — Quick Math deep-linkable route (mirrors /games/typing)
// Shareable room codes land here: /games/math/ABC123
// Also the landing spot for a "Beat my score" link (/games/math?beat=…).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const QuickMath = dynamic(() => import('@/components/games/QuickMath'), { ssr: false })
const ChallengeRun = dynamic(() => import('@/components/games/ChallengeRun'), { ssr: false })

export default function MathGamePage() {
  const params = useParams()
  // A catch-all segment ([[...code]]) always arrives as an array, never a
  // string — so /games/math/123456 used to silently lose its room code (the
  // same trap /games/typing already fixed).
  const rawCode = params?.code
  const code = Array.isArray(rawCode) ? (rawCode[0] ?? '') : typeof rawCode === 'string' ? rawCode : ''

  // A "Beat my score" link carries its challenge in ?beat=. Read it from
  // `window` (no useSearchParams → no Suspense boundary) and hold the game
  // back one tick so a socket-connecting room is never mounted by mistake.
  const [beat, setBeat] = useState<string | null>(null)
  const [beatReady, setBeatReady] = useState(false)
  useEffect(() => {
    setBeat(new URLSearchParams(window.location.search).get('beat'))
    setBeatReady(true)
  }, [])

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
          {beat
            ? 'A friend set a score — beat it. Same questions, played solo.'
            : code
              ? `Join room ${code}`
              : 'Race another student. Solve faster. Beat the clock.'}
        </p>

        {beatReady && (beat ? <ChallengeRun encoded={beat} /> : <QuickMath initialRoomCode={code} />)}
      </div>
    </div>
  )
}
