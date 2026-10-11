/**
 * MUSIC — guards the /global song library and the in-call "listen together"
 * panel.
 *
 * Playback is YouTube's OFFICIAL embed. Promises guarded here:
 *   1. it is a real YouTube embed (not an unofficial stream-extraction path),
 *      so it cannot silently start breaking YouTube's Terms or ship a scraper;
 *   2. it stays honest about ads, and ships the promised Top-50 flavours with
 *      real, non-empty playlist ids;
 *   3. listening together in a live call costs nothing: the shared playlist
 *      rides the call's LiveKit data channel, never Supabase and never a file
 *      upload — no rows, no storage, no bill.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('the Music section on /global', () => {
  const dashboard = read('src/app/global/page.tsx')
  const library = read('src/components/global/SongLibrary.tsx')
  const player = read('src/components/global/MusicPlaylistPlayer.tsx')
  const music = read('src/lib/music.ts')

  it('is wired into the dashboard', () => {
    expect(dashboard).toContain("from '@/components/global/SongLibrary'")
    expect(dashboard).toContain('<SongLibrary')
  })

  it('plays through the official YouTube embed', () => {
    expect(music).toMatch(/youtube\.com\/embed\/videoseries/)
    expect(player).toContain('<iframe')
    // Both surfaces share ONE player — no second, divergent embed implementation.
    expect(library).toContain("from '@/components/global/MusicPlaylistPlayer'")
  })

  it('carries no unofficial ad-stripping or scraping path', () => {
    for (const source of [library, player, music]) {
      expect(source).not.toMatch(/yt-?dlp|ytdl|invidious|piped|adblock|ad-?block|proxy/i)
    }
  })

  it('is honest that ads may play', () => {
    expect(player).toMatch(/ads may play/i)
  })

  it('ships a Top-50 chart for every flavour', () => {
    expect(music).toMatch(/label: '90s Bollywood'/)
    expect(music).toMatch(/label: 'New Bollywood'/)
    expect(music).toMatch(/label: 'Top 50 Hindi'/)
    expect(music).toMatch(/label: 'Punjabi Top 50'/)
    // Every collection id is a non-empty YouTube playlist id (PL…), never a stub.
    const ids = [...music.matchAll(/playlistId: '([^']*)'/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThanOrEqual(10)
    for (const id of ids) expect(id, `playlist id "${id}" looks fake`).toMatch(/^PL[\w-]{8,}$/)
    // The section advertises the size honestly.
    expect(library).toMatch(/Top 50/)
  })

  it('never autoplays before the student taps a playlist', () => {
    // Autoplay is opt-in: the flag starts false and flips only on a chip pick.
    expect(library).toMatch(/useState\(false\)/)
    expect(library).toMatch(/setAutoPlay\(true\)/)
    // …and the shared player only autoplays when its owner says so.
    expect(player).toMatch(/youtubePlaylistEmbedUrl\(active\.playlistId, autoPlay\)/)
  })
})

describe('listening together inside a live voice call', () => {
  const call = read('src/components/voice/CallSurface.tsx')
  const panel = read('src/components/voice/CallMusicPanel.tsx')

  it('uses the call’s own data channel, not the database', () => {
    expect(call).toMatch(/useDataChannel\('music'/)
    expect(call).toContain("from '@/components/voice/CallMusicPanel'")
    expect(call).toContain('<CallMusicPanel')
  })

  it('offers a music control next to the mic and games', () => {
    expect(call).toMatch(/onOpenMusic/)
    expect(call).toMatch(/aria-label=\{musicOpen \? 'Close the music panel'/)
  })

  it('writes nothing to Supabase and uploads nothing for the music', () => {
    // No table, no RPC, no realtime, no storage bucket in the panel that
    // makes music work — the playlist id is the whole payload. (The header
    // comment mentions Supabase; this checks real usage: an import or a call.)
    expect(panel).not.toMatch(/from '@\/lib\/supabase/)
    expect(panel).not.toMatch(/supabase\.(from|rpc|storage|channel)/)
    expect(panel).not.toMatch(/\.storage\.from\(/)

    // CallSurface's only data-channel payload for music is the flavour key.
    expect(call).toMatch(/JSON\.stringify\(\{ key \}\)/)
  })

  it('validates what arrives before showing it', () => {
    expect(panel).toMatch(/isMusicKey/)
    expect(read('src/lib/music.ts')).toMatch(/export function isMusicKey/)
  })

  it('stays honest that each listener presses play themselves', () => {
    expect(panel).toMatch(/own player/)
  })
})
