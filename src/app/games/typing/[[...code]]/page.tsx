'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /games/typing — deep-linkable route (shareable room codes land here)
//
// Also the landing spot for a "Beat my score" challenge link
// (/games/typing?beat=…), which swaps the multiplayer game for a solo run.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const TypingBattle = dynamic(() => import('@/components/games/TypingBattle'), { ssr: false })
const ChallengeRun = dynamic(() => import('@/components/games/ChallengeRun'), { ssr: false })

export default function TypingPage() {
  const params = useParams()
  // A catch-all segment ([[...code]]) always arrives as an array, never a
  // string — so /games/typing/123456 used to silently lose its room code.
  const rawCode = params?.code
  const code = Array.isArray(rawCode) ? (rawCode[0] ?? '') : typeof rawCode === 'string' ? rawCode : ''

  // A challenge travels in the query string. Read it from `window` rather than
  // useSearchParams so the page needs no Suspense boundary, and hold the game
  // back for one tick so we never mount a socket-connecting battle just to
  // swap it for the solo run.
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

        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          ⌨️ Typing Battle
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          {beat
            ? 'A friend set a score — beat it. Same words, played solo.'
            : code
              ? `Join room ${code}`
              : 'Race another student. Type faster. Make fewer mistakes.'}
        </p>

        {beatReady && (beat ? <ChallengeRun encoded={beat} /> : <TypingBattle initialRoomCode={code} />)}
      </div>
    </div>
  )
}
