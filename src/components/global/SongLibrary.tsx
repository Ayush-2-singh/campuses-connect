'use client'

// ═══════════════════════════════════════════════════════════════════════════
// SongLibrary — the "/jobs" Music section: free4talk-style curated Hindi
// playlists that play through YouTube's official embedded player.
//
// One "Top 50"-shaped chart per flavour — no single songs, no jumping between
// tabs. The chips and the player live in MusicPlaylistPlayer so the live voice
// call can offer the exact same library without a second copy.
//
// Honest by design: the embed is YouTube's own player, so YouTube ads may play
// between songs. Nothing strips them (see src/lib/music.ts) — Premium viewers
// simply see fewer. The player only autoplays after an explicit chip tap,
// never on page load, so opening /global does not blast audio.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { Icon } from '@/components/icons'
import MusicPlaylistPlayer from '@/components/global/MusicPlaylistPlayer'
import { DEFAULT_MUSIC_KEY, MUSIC_COLLECTIONS } from '@/lib/music'

export default function SongLibrary() {
  const [activeKey, setActiveKey] = useState(DEFAULT_MUSIC_KEY)
  // Autoplay is armed only once the student picks a playlist themselves.
  const [autoPlay, setAutoPlay] = useState(false)

  const pick = (key: string) => {
    setActiveKey(key)
    setAutoPlay(true)
  }

  return (
    <section style={{ marginBottom: 24 }} aria-label="Music">
      {/* Header — same card shape as the Live Rooms board above it. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-sm)',
          padding: '14px 16px',
          marginBottom: 12,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="music" size={19} />
        </span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              flexWrap: 'wrap',
            }}
          >
            Music
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: 'var(--accent-text)',
                background: 'var(--accent-light)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              Top 50 × {MUSIC_COLLECTIONS.length} flavours
            </span>
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Pick a vibe — study, chill or party with your campus. Or start one inside a live voice call and listen
            together.
          </p>
        </div>
      </div>

      <MusicPlaylistPlayer activeKey={activeKey} autoPlay={autoPlay} onPick={pick} />
    </section>
  )
}
