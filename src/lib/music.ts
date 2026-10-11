// ═══════════════════════════════════════════════════════════════════════════
// MUSIC — the curated song library behind the /global "Music" section and the
// in-call "listen together" panel.
//
// Playback is YouTube's OWN embedded player (the official iframe embed), so a
// public playlist plays with no API key, nothing to host and NOTHING written to
// Supabase. Like every YouTube surface, ADS MAY PLAY between songs — that is
// YouTube's call, not ours, and there is no supported way to remove them. This
// file deliberately contains NO ad-stripping or stream-extraction logic:
// bypassing the player breaks YouTube's Terms and dies the moment YouTube
// changes anything.
//
// Every flavour below is a "Top 50"-shaped chart playlist, not a single song.
// Each entry is a public YouTube playlist id (the `list=` value of a
// youtube.com/playlist?list=… URL). To swap a flavour, replace its
// `playlistId` with your own and both surfaces pick it up — nothing else
// changes.
// ═══════════════════════════════════════════════════════════════════════════

export interface MusicCollection {
  /** Stable key — React keys, the active chip, and the in-call data channel. */
  key: string
  /** Chip label shown to the student. */
  label: string
  /** One-line description under the title. */
  description: string
  /** Shared SVG icon name (see src/components/icons.tsx). */
  icon: string
  /** Public YouTube playlist id (the `list=` param). */
  playlistId: string
}

/** Top-50-style chart playlists, one per flavour. */
export const MUSIC_COLLECTIONS: MusicCollection[] = [
  {
    key: 'hindi50',
    label: 'Top 50 Hindi',
    description: 'The 50 most-played Hindi songs right now, chart order.',
    icon: 'music',
    playlistId: 'PLHuHXHyLu7BEnMJNeVvkXpxapvDSp5UdI',
  },
  {
    key: 'new',
    label: 'New Bollywood',
    description: 'Top 50 fresh Hindi chartbusters and this week’s releases.',
    icon: 'sparkles',
    playlistId: 'PLdSCVZbBP-PzWK0FZ2bBItKblfa3V0QhP',
  },
  {
    key: '90s',
    label: '90s Bollywood',
    description: 'Top 50 golden-era hits — Kumar Sanu, Alka Yagnik, Udit Narayan.',
    icon: 'clock',
    playlistId: 'PLinVjP-aRmluhL7dSHirH8V7S5ltowfU_',
  },
  {
    key: 'romantic',
    label: 'Romantic Top 50',
    description: 'Top 50 love songs and slow jukeboxes, evergreen to now.',
    icon: 'heart',
    playlistId: 'PLb3Oj6WK5v95-69OrlGA3Dtb0MBFGdUod',
  },
  {
    key: 'retro',
    label: 'Retro 80s Top 50',
    description: 'Top 50 disco, Kishore and the classics that never fade.',
    icon: 'star',
    playlistId: 'PL4OqLl4qvLkc66m2pNiD0CBRyISex0qwW',
  },
  {
    key: 'party',
    label: 'Party / Dance Top 50',
    description: 'Top 50 non-stop dance hits to get the room going.',
    icon: 'flame',
    playlistId: 'PLinVjP-aRmltthWxyInQ6xmDWs-3nm-xK',
  },
  {
    key: 'punjabi',
    label: 'Punjabi Top 50',
    description: 'Top 50 Punjabi bangers — Aujla, Diljit, Sidhu and the new wave.',
    icon: 'crown',
    playlistId: 'PLHaJ4W2RPWfM',
  },
  {
    key: 'english',
    label: 'Top 50 English',
    description: 'Top 50 worldwide hits of the week, in chart order.',
    icon: 'globe',
    playlistId: 'PLLdPJGHquctFFaYNmcSIZVjpHxjO9dZTS',
  },
  {
    key: 'lofi',
    label: 'Lo-fi Chill',
    description: 'Slowed + reverb — 50 tracks to study to, late at night.',
    icon: 'headphones',
    playlistId: 'PLBKQGzSL_9lT2KmyCrO0Ehuk3FhZHXDuX',
  },
  {
    key: 'sad',
    label: 'Sad / Emotional',
    description: 'Heartbreak songs for the moody nights and long walks.',
    icon: 'heart',
    playlistId: 'PLqnqbPpEfEKiW7H-KcbKkBlnEHU9-8szn',
  },
  {
    key: 'bhakti',
    label: 'Bhakti / Devotional',
    description: 'Aartis and bhajans — 50+ to loop in the morning.',
    icon: 'sparkles',
    playlistId: 'PLV_5eq7MC2L5uqDnifeou264tfxanEJwK',
  },
]

/** The default flavour both surfaces open on. */
export const DEFAULT_MUSIC_KEY = MUSIC_COLLECTIONS[0].key

/** Lookup by key — undefined for an unknown key (e.g. a stale peer payload). */
export function musicCollection(key: string | null | undefined): MusicCollection | undefined {
  if (!key) return undefined
  return MUSIC_COLLECTIONS.find((c) => c.key === key)
}

/**
 * Is this a flavour we actually ship? Used to validate what arrived over the
 * call's data channel before it is shown — a peer on an older bundle is
 * ignored rather than trusted.
 */
export function isMusicKey(key: unknown): key is string {
  return typeof key === 'string' && MUSIC_COLLECTIONS.some((c) => c.key === key)
}

/**
 * YouTube embed URL for a public playlist.
 *
 * `autoplay` is only ever true after the student taps a chip: browsers block
 * unmuted autoplay on first paint, and starting audio the moment /global opens
 * would be hostile. `playsinline` keeps iOS from hijacking the player
 * full-screen; `rel=0` limits end-of-video suggestions to the same channel.
 */
export function youtubePlaylistEmbedUrl(playlistId: string, autoplay = false): string {
  const params = new URLSearchParams({
    list: playlistId,
    rel: '0',
    playsinline: '1',
    modestbranding: '1',
  })
  if (autoplay) params.set('autoplay', '1')
  // `videoseries` is the playlist form of the embed player.
  return `https://www.youtube.com/embed/videoseries?${params.toString()}`
}

/** Public watch URL — the "Open on YouTube" escape hatch. */
export function youtubePlaylistWatchUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`
}
