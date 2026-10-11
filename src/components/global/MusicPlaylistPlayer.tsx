'use client'

// ═══════════════════════════════════════════════════════════════════════════
// MusicPlaylistPlayer — the flavour chips + YouTube player, shared by the
// /global Music section and the in-call "listen together" panel.
//
// It is fully controlled: the owner holds `activeKey` and `autoPlay`. That
// matters for the call, where the selected flavour has to travel over the
// LiveKit data channel — one source of truth, one component.
//
// Honest by design: the embed is YouTube's own player, so YouTube ads may play
// between songs. Nothing here strips them (see src/lib/music.ts) — Premium
// viewers simply see fewer. `autoPlay` is only ever true after an explicit
// tap, never on first paint, so opening a surface does not blast audio.
// ═══════════════════════════════════════════════════════════════════════════

import { Icon } from '@/components/icons'
import { MUSIC_COLLECTIONS, musicCollection, youtubePlaylistEmbedUrl, youtubePlaylistWatchUrl } from '@/lib/music'

export default function MusicPlaylistPlayer({
  activeKey,
  autoPlay,
  onPick,
  compact = false,
}: {
  /** Flavour key currently loaded in the player. */
  activeKey: string
  /** Only true once the student has tapped a flavour themselves. */
  autoPlay: boolean
  onPick: (key: string) => void
  /** Tighter chrome for the in-call panel. */
  compact?: boolean
}) {
  const active = musicCollection(activeKey) ?? MUSIC_COLLECTIONS[0]
  const src = youtubePlaylistEmbedUrl(active.playlistId, autoPlay)

  return (
    <>
      {/* Flavour chips — the "library" half of the player. */}
      <div
        className="scrollbar-hide chip-scroll"
        style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: compact ? 8 : 12, paddingBottom: 4 }}
      >
        {MUSIC_COLLECTIONS.map((c) => {
          const isActive = c.key === active.key
          return (
            <button
              key={c.key}
              onClick={() => onPick(c.key)}
              aria-pressed={isActive}
              style={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
                padding: compact ? '6px 11px' : '7px 13px',
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
          <div style={{ flex: 1, minWidth: 140 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{active.label}</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '1px 0 0' }}>{active.description}</p>
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
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <Icon name="play" size={13} />
            Open on YouTube
          </a>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            Powered by YouTube · ads may play
          </span>
        </div>
      </div>
    </>
  )
}
