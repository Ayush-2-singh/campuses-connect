/**
 * WATCH — the Netflix-style video section.
 *
 * Playback is YouTube's OFFICIAL embed, same promise as the music library
 * (src/lib/music.ts): it cannot silently start breaking YouTube's Terms or
 * ship a scraper, and streaming video costs NOTHING on our side — no rows,
 * no Supabase Storage, no egress bill. The catalog below is a curated
 * starter set of evergreen, official-channel videos; extend it by adding
 * entries (or later: an admin-managed `watch_videos` table — the shape of
 * WatchVideo is the contract either way).
 */

export interface WatchVideo {
  /** Stable catalog id (currently the YouTube id). */
  id: string
  /** Official YouTube video id — 11 chars, [A-Za-z0-9_-]. */
  youtubeId: string
  title: string
  channel: string
  category: WatchCategoryId
}

export type WatchCategoryId = 'trending' | 'study' | 'learn' | 'chill'

export interface WatchCategory {
  id: WatchCategoryId
  label: string
  blurb: string
}

/** Row order on /watch — Netflix shows its flagship row first. */
export const WATCH_CATEGORIES: WatchCategory[] = [
  { id: 'trending', label: 'Trending Now', blurb: 'What the whole campus has on repeat' },
  { id: 'study', label: 'Study & Focus', blurb: 'Long-form beats to lock in with' },
  { id: 'learn', label: 'Code & Learn', blurb: 'Full courses — free, forever' },
  { id: 'chill', label: 'Chill Vibes', blurb: 'Wind down between classes' },
]

export const WATCH_CATALOG: WatchVideo[] = [
  // ── Trending ──
  {
    id: 'blinding-lights',
    youtubeId: '4NRXx6U8ABQ',
    title: 'The Weeknd — Blinding Lights',
    channel: 'The Weeknd',
    category: 'trending',
  },
  {
    id: 'shape-of-you',
    youtubeId: 'JGwWNGJdvx8',
    title: 'Ed Sheeran — Shape of You',
    channel: 'Ed Sheeran',
    category: 'trending',
  },
  {
    id: 'uptown-funk',
    youtubeId: 'OPf0YbXqDm0',
    title: 'Mark Ronson — Uptown Funk',
    channel: 'Mark Ronson',
    category: 'trending',
  },
  {
    id: 'gangnam-style',
    youtubeId: '9bZkp7q19f0',
    title: 'PSY — GANGNAM STYLE',
    channel: 'officialpsy',
    category: 'trending',
  },

  // ── Study & Focus ──
  {
    id: 'lofi-live',
    youtubeId: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio — beats to relax/study to',
    channel: 'Lofi Girl',
    category: 'study',
  },
  {
    id: 'weightless',
    youtubeId: 'UfcAVejsR-U',
    title: 'Weightless — Marconi Union (8 hours of calm)',
    channel: 'MARCONI UNION',
    category: 'study',
  },
  {
    id: 'clair-de-lune',
    youtubeId: 'Cv1RJTHf5fk',
    title: 'Debussy — Clair de Lune',
    channel: 'Piano Tribute Players',
    category: 'study',
  },
  {
    id: 'moonlight-sonata',
    youtubeId: '4Tr0otuiQuU',
    title: 'Beethoven — Moonlight Sonata',
    channel: 'Kassia',
    category: 'study',
  },

  // ── Code & Learn ──
  {
    id: 'python-beginners',
    youtubeId: 'rfscVS0vtbw',
    title: 'Python for Beginners — Full Course',
    channel: 'freeCodeCamp.org',
    category: 'learn',
  },
  {
    id: 'js-full-course',
    youtubeId: 'PkZNo7MFNFg',
    title: 'JavaScript Programming — Full Course',
    channel: 'freeCodeCamp.org',
    category: 'learn',
  },
  {
    id: 'cs50-lecture-0',
    youtubeId: '8mAITcNt710',
    title: 'Harvard CS50 — Lecture 0: Scratch',
    channel: 'Harvard University',
    category: 'learn',
  },
  {
    id: 'react-course',
    youtubeId: 'bMknfKXIFA8',
    title: 'React.js — Full Course for Beginners',
    channel: 'freeCodeCamp.org',
    category: 'learn',
  },

  // ── Chill Vibes ──
  { id: 'faded', youtubeId: '60ItHLz5WEA', title: 'Alan Walker — Faded', channel: 'Alan Walker', category: 'chill' },
  { id: 'wake-me-up', youtubeId: 'UtF6Jej9yb0', title: 'Avicii — Wake Me Up', channel: 'Avicii', category: 'chill' },
  {
    id: 'firestone',
    youtubeId: '6-7BTJMFxy4',
    title: 'Kygo — Firestone (feat. Conrad Sewell)',
    channel: 'Kygo',
    category: 'chill',
  },
  {
    id: 'closer',
    youtubeId: 'PT2_F-1esPk',
    title: 'The Chainsmokers — Closer (feat. Halsey)',
    channel: 'The Chainsmokers',
    category: 'chill',
  },
]

/** The hero banner at the top of /watch. */
export const FEATURED_VIDEO: WatchVideo = WATCH_CATALOG[0]

export function videosForCategory(id: WatchCategoryId): WatchVideo[] {
  return WATCH_CATALOG.filter((v) => v.category === id)
}

/**
 * Official YouTube embed URL. `autoplay` is opt-in — browsers block
 * autoplay with sound, so the player opens muted-autoplay-safe only when
 * the user explicitly pressed Play.
 */
export function youtubeVideoEmbedUrl(youtubeId: string, autoplay = true): string {
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' })
  if (autoplay) params.set('autoplay', '1')
  return `https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}?${params.toString()}`
}

/** Guaranteed 16:9 thumbnail (mqdefault always exists, unlike maxres). */
export function youtubeThumbUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/mqdefault.jpg`
}

/** Larger thumbnail for the hero. */
export function youtubeHeroThumbUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`
}
