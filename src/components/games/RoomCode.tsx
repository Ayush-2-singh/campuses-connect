'use client'

// ═══════════════════════════════════════════════════════════════════════════
// RoomCode — prominent room code display with copy + share
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { formatRoomCode, copyToClipboard, shareRoom } from '@/lib/games/utils'

export default function RoomCode({
  code,
  playerCount,
  maxPlayers,
}: {
  code: string
  playerCount: number
  maxPlayers: number
}) {
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)

  const handleCopy = async () => {
    const ok = await copyToClipboard(code)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    setSharing(true)
    await shareRoom(code)
    setSharing(false)
  }

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--accent-border)',
        borderRadius: 16,
        padding: '20px 24px',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--accent-text)',
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          margin: '0 0 6px',
        }}
      >
        Room Code
      </p>
      <p
        style={{
          fontSize: 42,
          fontWeight: 800,
          color: 'var(--text-primary)',
          margin: '0 0 8px',
          fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
          letterSpacing: 6,
        }}
      >
        {formatRoomCode(code)}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
        {playerCount}/{maxPlayers} players connected
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button
          onClick={handleCopy}
          style={{
            background: copied ? 'var(--success-light)' : 'var(--bg-tertiary)',
            color: copied ? 'var(--success-text)' : 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {copied ? '✓ Copied' : '📋 Copy Code'}
        </button>
        <button
          onClick={handleShare}
          disabled={sharing}
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {sharing ? 'Sharing...' : '🔗 Share Game'}
        </button>
      </div>
    </div>
  )
}
