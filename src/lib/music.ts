// ═══════════════════════════════════════════════════════════════════════════
// MUSIC — the curated song library behind the /global "Music" section.
//
// Playback is YouTube's OWN embedded player (the official iframe embed), so a
// public playlist plays with no API key and nothing to host. Like every
// YouTube surface, ADS MAY PLAY between songs — that is YouTube's call, not
// ours, and there is no supported way to remove them. This file deliberately
// contains NO ad-stripping or stream-extraction logic: bypassing the player
// breaks YouTube's Terms and dies the moment YouTube changes anything.
//
// Each collection is a public YouTube playlist id (the `list=` value of a
// youtube.com/playlist?list=… URL). To swap a collection, replace its
// `playlistId` with your own and the embed picks it up — nothing else changes.
// ═══════════════════════════════════════════════════════════════════════════

export interface MusicCollection {
  /** Stable key — used for React keys and the active chip. */
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

export const MUSIC_COLLECTIONS: MusicCollection[] = [
  {
    key: '90s',
    label: '90s Bollywood',
    description: 'The golden era — Kumar Sanu, Alka Yagnik, Udit Narayan.',
    icon: 'clock',
    playlistId: 'PLinVjP-aRmluhL7dSHirH8V7S5ltowfU_',
  },
  {
    key: 'new',
    label: 'New Bollywood',
    description: 'Fresh Hindi chartbusters and the latest releases.',
    icon: 'sparkles',
    playlistId: 'PLdSCVZbBP-PzWK0FZ2bBItKblfa3V0QhP',
  },
  {
    key: 'romantic',
    label: 'Romantic',
    description: 'Love songs and slow jukeboxes, evergreen to now.',
    icon: 'heart',
    playlistId: 'PLb3Oj6WK5v95-69OrlGA3Dtb0MBFGdUod',
  },
  {
    key: 'retro',
    label: 'Retro 80s',
    description: 'Disco, Kishore and the classics that never fade.',
    icon: 'star',
    playlistId: 'PL4OqLl4qvLkc66m2pNiD0CBRyISex0qwW',
  },
  {
    key: 'party',
    label: 'Party / Dance',
    description: 'Non-stop dance hits to get the room going.',
    icon: 'flame',
    playlistId: 'PLinVjP-aRmltthWxyInQ6xmDWs-3nm-xK',
  },
  {
    key: 'lofi',
    label: 'Lo-fi Chill',
    description: 'Slowed + reverb — perfect for studying late.',
    icon: 'headphones',
    playlistId: 'PLBKQGzSL_9lT2KmyCrO0Ehuk3FhZHXDuX',
  },
]

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
