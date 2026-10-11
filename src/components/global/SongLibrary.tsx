'use client'

// ═══════════════════════════════════════════════════════════════════════════
// SongLibrary — the "/global" Music section: free4talk-style curated Hindi
// playlists that play through YouTube's official embedded player.
//
// Honest by design: the embed is YouTube's own player, so YouTube ads may play
// between songs. Nothing here strips them (see src/lib/music.ts) — Premium
// viewers simply see fewer. The player only autoplays after an explicit chip
// tap, never on page load, so opening /global does not blast audio.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { Icon } from '@/components/icons'
import { MUSIC_COLLECTIONS, youtubePlaylistEmbedUrl, youtubePlaylistWatchUrl, type MusicCollection } from '@/lib/music'

export default function SongLibrary() {
  const [active, setActive] = useState<MusicCollection>(MUSIC_COLLECTIONS[0])
  // Autoplay is armed only once the student picks a playlist themselves.
  const [autoPlay, setAutoPlay] = useState(false)

  const src = youtubePlaylistEmbedUrl(active.playlistId, autoPlay)

  const pick = (collection: MusicCollection) => {
    setActive(collection)
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
              {MUSIC_COLLECTIONS.length} playlists
            </span>
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Pick a vibe and let it play — study, chill or party with your campus.
          </p>
        </div>
        <a
          href={youtubePlaylistWatchUrl(active.playlistId)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '9px 14px',
            fontSize: 12.5,
            fontWeight: 700,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <Icon name="play" size={14} />
          Open on YouTube
        </a>
      </div>

      {/* Collection chips — the "library" half of free4talk's music panel. */}
      <div
        className="scrollbar-hide chip-scroll"
        style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}
      >
        {MUSIC_COLLECTIONS.map((c) => {
          const isActive = c.key === active.key
          return (
            <button
              key={c.key}
              onClick={() => pick(c)}
              aria-pressed={isActive}
              style={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
                padding: '7px 13px',
                borderRadius: 999,
                border: isActive ? 'none' : '1px solid var(--border)',
                background: isActive ? 'var(--accent)' : 'var(--bg)',
                color: isActive ? 'var(--on-accent)' : 'var(--text-secondary)',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name={c.icon} size={13} strokeWidth={2.2} />
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Player — the active playlist. `key` remounts the iframe so a new
          playlist always loads (and autoplays) cleanly. */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
          <iframe
            key={src}
            src={src}
            title={`${active.label} — YouTube playlist`}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 14px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: 'var(--accent-light)',
              color: 'var(--accent-text)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <Icon name={active.icon} size={15} />
          </span>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{active.label}</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '1px 0 0' }}>{active.description}</p>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            Powered by YouTube · ads may play
          </span>
        </div>
      </div>
    </section>
  )
}
