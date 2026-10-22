'use client'

/**
 * WATCH — /watch, the Netflix-style video wall.
 *
 * A hero banner + horizontally scrolling rows per category. Tapping any card
 * (or Play on the hero) opens a fullscreen player overlay. Playback is the
 * official YouTube embed resolved through src/lib/videos.ts — streaming
 * costs this app nothing: no uploads, no Supabase Storage, no rows.
 */

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'
import {
  FEATURED_VIDEO,
  WATCH_CATEGORIES,
  videosForCategory,
  youtubeHeroThumbUrl,
  youtubeThumbUrl,
  youtubeVideoEmbedUrl,
  type WatchVideo,
} from '@/lib/videos'

export default function WatchPage() {
  const [playing, setPlaying] = useState<WatchVideo | null>(null)

  // Escape closes the player; the page behind it stops scrolling while open.
  useEffect(() => {
    if (!playing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlaying(null)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [playing])

  const cardWidth = 216

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 14px 40px' }}>
        {/* ── Page header ── */}
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Watch</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Stream what the campus is watching — free, straight from the classroom
          </p>
        </div>

        {/* ── Hero banner ── */}
        <button
          onClick={() => setPlaying(FEATURED_VIDEO)}
          aria-label={`Play ${FEATURED_VIDEO.title}`}
          style={{
            position: 'relative',
            display: 'block',
            width: '100%',
            border: '1px solid var(--border)',
            borderRadius: 16,
            overflow: 'hidden',
            padding: 0,
            cursor: 'pointer',
            background: 'var(--bg-secondary)',
            textAlign: 'left',
            marginBottom: 22,
          }}
        >
          <img
            src={youtubeHeroThumbUrl(FEATURED_VIDEO.youtubeId)}
            alt=""
            style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: 380, objectFit: 'cover', display: 'block' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.78) 100%)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '16px 18px',
            }}
          >
            <span
              style={{
                alignSelf: 'flex-start',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                background: 'var(--danger, #e50914)',
                color: '#fff',
                borderRadius: 5,
                padding: '3px 8px',
                marginBottom: 8,
              }}
            >
              Featured
            </span>
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 800, lineHeight: 1.25 }}>
              {FEATURED_VIDEO.title}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 }}>
              {FEATURED_VIDEO.channel}
            </span>
            <span
              style={{
                marginTop: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                alignSelf: 'flex-start',
                background: '#fff',
                color: '#111',
                borderRadius: 9,
                padding: '9px 18px',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <Icon name="video" size={15} strokeWidth={2.2} /> Play
            </span>
          </div>
        </button>

        {/* ── Category rows ── */}
        {WATCH_CATEGORIES.map((cat) => {
          const videos = videosForCategory(cat.id)
          if (videos.length === 0) return null
          return (
            <section key={cat.id} style={{ marginBottom: 24 }}>
              <div style={{ marginBottom: 9 }}>
                <h2 style={{ fontSize: 16, fontWeight: 750, margin: 0 }}>{cat.label}</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{cat.blurb}</p>
              </div>
              <div className="scrollbar-hide" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
                {videos.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setPlaying(v)}
                    aria-label={`Play ${v.title}`}
                    style={{
                      flex: `0 0 ${cardWidth}px`,
                      width: cardWidth,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                  >
                    <img
                      src={youtubeThumbUrl(v.youtubeId)}
                      alt=""
                      loading="lazy"
                      style={{
                        width: '100%',
                        aspectRatio: '16 / 9',
                        objectFit: 'cover',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        display: 'block',
                        transition: 'transform 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                    <span
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: 13,
                        fontWeight: 650,
                        marginTop: 7,
                        lineHeight: 1.3,
                      }}
                    >
                      {v.title}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {v.channel}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {/* ── Player overlay ── */}
      {playing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Now playing: ${playing.title}`}
          onClick={() => setPlaying(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 14,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(960px, 100%)', position: 'relative' }}>
            <div
              style={{
                position: 'relative',
                aspectRatio: '16 / 9',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#000',
              }}
            >
              <iframe
                src={youtubeVideoEmbedUrl(playing.youtubeId)}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>{playing.title}</p>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12.5, margin: '3px 0 0' }}>{playing.channel}</p>
              </div>
              <button
                onClick={() => setPlaying(null)}
                aria-label="Close player"
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'transparent',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Icon name="x" size={13} strokeWidth={2.2} /> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
