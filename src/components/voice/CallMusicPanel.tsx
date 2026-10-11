'use client'

// ═══════════════════════════════════════════════════════════════════════════
// CALL MUSIC — the "listen together" surface of a live voice call.
//
// Rendered INSIDE the call shell (the LiveKit room never unmounts, so the
// conversation keeps flowing while the music plays). The flavour the host
// shares travels over the call's own data channel — topic 'music', payload
// { key } — and every participant plays it locally from YouTube's OFFICIAL
// embed.
//
// Deliberately cheap by construction:
//   • ZERO Supabase writes, no new tables, no RPC, no polling;
//   • NOTHING is uploaded or hosted — no files in Supabase Storage;
//   • the playlist id is a reference, so the payload is a few bytes.
// The music is live-room ephemeral: it stops when the call ends, exactly like
// reactions, chat and game invites.
//
// Each person still has to press play in their own player once — YouTube (and
// every browser) budget audio per user, so nobody can be made to hear sound
// they never opted into.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { Icon } from '@/components/icons'
import MusicPlaylistPlayer from '@/components/global/MusicPlaylistPlayer'
import { DEFAULT_MUSIC_KEY, isMusicKey } from '@/lib/music'

export default function CallMusicPanel({
  initialKey,
  initialAutoPlay = false,
  sharedKey,
  participantCount,
  onShare,
  onClose,
}: {
  /** Flavour the panel opens on (an invite's pick, or the default). */
  initialKey?: string
  /** True when the panel was opened by tapping an invite — the tap that got
   *  the student here is the gesture that arms autoplay. */
  initialAutoPlay?: boolean
  /** Flavour currently broadcast to the call by ME, or null. */
  sharedKey: string | null
  participantCount: number
  /** Broadcast a flavour (or null to stop) to everyone on the call. */
  onShare: (key: string | null) => void
  onClose: () => void
}) {
  const [activeKey, setActiveKey] = useState(isMusicKey(initialKey) ? initialKey : DEFAULT_MUSIC_KEY)
  // Autoplay is armed only after a tap — same rule as /global.
  const [autoPlay, setAutoPlay] = useState(initialAutoPlay)

  const pick = (key: string) => {
    setActiveKey(key)
    setAutoPlay(true)
  }

  const sharing = sharedKey === activeKey

  return (
    <section
      aria-label="Music"
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '14px 16px 20px',
        marginBottom: 14,
        animation: 'ccCardUp 0.15s ease',
      }}
    >
      {/* ── Panel header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="music" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Listen together</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '1px 0 0' }}>
            Pick a Top 50 list and play it for everyone on the call.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close the music panel"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <MusicPlaylistPlayer activeKey={activeKey} autoPlay={autoPlay} onPick={pick} compact />

      {/* ── Share with the call ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button
          onClick={() => onShare(sharing ? null : activeKey)}
          style={{
            minHeight: 40,
            padding: '0 18px',
            borderRadius: 10,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <Icon name={sharing ? 'x' : 'play'} size={14} />
          {sharing ? 'Stop for everyone' : 'Play for everyone'}
        </button>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', alignSelf: 'center', flex: 1, minWidth: 160 }}>
          {sharing
            ? `Shared with the call — ${participantCount} in the room, everyone taps play on their own player.`
            : 'Everyone on the call gets a one-tap invite. Nothing is uploaded — just the playlist.'}
        </span>
      </div>
    </section>
  )
}
