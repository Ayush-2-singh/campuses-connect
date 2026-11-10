'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /compete/play — the live landing spot for every shared game link.
//
// `/games` is retired, and the routes that used to receive these links are
// archived, so a shared "beat my score" link or a room-code link pointed at a
// page that no longer exists. This is the replacement: one route that reads
// the same query shapes and mounts the same engines GamesTab mounts.
//
//   ?beat=<payload>            → solo challenge run (no room, no sign-in)
//   ?game=math&room=482913     → join that Quick Math room
//   ?game=typing&room=482913   → join that Typing Battle room
//
// The game is held back one tick: a room-mounting socket must never be created
// just to be replaced by the solo run a moment later.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const QuickMath = dynamic(() => import('@/components/games/QuickMath'), { ssr: false })
const TypingBattle = dynamic(() => import('@/components/games/TypingBattle'), { ssr: false })
const ChallengeRun = dynamic(() => import('@/components/games/ChallengeRun'), { ssr: false })

type Link =
  { kind: 'challenge'; beat: string } | { kind: 'room'; game: 'math' | 'typing'; room: string } | { kind: 'none' }

/** Read a link out of the URL — the only place query state is trusted. */
function readLink(): Link {
  const q = new URLSearchParams(window.location.search)
  const beat = q.get('beat')
  if (beat) return { kind: 'challenge', beat }

  const room = (q.get('room') || '').replace(/\D/g, '').slice(0, 6)
  if (room.length === 6) return { kind: 'room', game: q.get('game') === 'typing' ? 'typing' : 'math', room }

  return { kind: 'none' }
}

function Shell({ heading, sub, children }: { heading: string; sub: string; children: React.ReactNode }) {
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

        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>{heading}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>{sub}</p>

        {children}
      </div>
    </div>
  )
}

export default function CompetePlayPage() {
  const [link, setLink] = useState<Link | null>(null)

  useEffect(() => {
    setLink(readLink())
  }, [])

  // One tick: `link` is null until the effect has read the URL.
  if (!link) return null

  if (link.kind === 'none') {
    return (
      <Shell heading="No game in this link" sub="A challenge or room code is missing from the URL.">
        <a
          href="/compete?tab=games"
          style={{
            display: 'inline-block',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            borderRadius: 12,
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          Pick a game
        </a>
      </Shell>
    )
  }

  if (link.kind === 'challenge') {
    return (
      <Shell heading="Beat my score" sub="A friend set a score — beat it. Same questions, played solo.">
        <ChallengeRun encoded={link.beat} />
      </Shell>
    )
  }

  const isTyping = link.game === 'typing'
  return (
    <Shell heading={isTyping ? '⌨️ Typing Battle' : '⚡ Quick Math'} sub={`Join room ${link.room}`}>
      {isTyping ? <TypingBattle initialRoomCode={link.room} /> : <QuickMath initialRoomCode={link.room} />}
    </Shell>
  )
}
