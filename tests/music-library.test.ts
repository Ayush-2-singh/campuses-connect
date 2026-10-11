/**
 * MUSIC SECTION — guards the /global song library.
 *
 * The section plays curated Hindi playlists through YouTube's OFFICIAL embed.
 * Two promises are guarded here:
 *   1. it is a real YouTube embed (not an unofficial stream-extraction path),
 *      so it cannot silently start breaking YouTube's Terms or ship a scraper;
 *   2. it stays honest about ads, and ships the promised collections
 *      (90s, New Bollywood, …) with real, non-empty playlist ids.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('the Music section on /global', () => {
  const dashboard = read('src/app/global/page.tsx')
  const library = read('src/components/global/SongLibrary.tsx')
  const music = read('src/lib/music.ts')

  it('is wired into the dashboard', () => {
    expect(dashboard).toContain("from '@/components/global/SongLibrary'")
    expect(dashboard).toContain('<SongLibrary')
  })

  it('plays through the official YouTube embed', () => {
    expect(music).toMatch(/youtube\.com\/embed\/videoseries/)
    expect(library).toContain('<iframe')
  })

  it('carries no unofficial ad-stripping or scraping path', () => {
    for (const source of [library, music]) {
      expect(source).not.toMatch(/yt-?dlp|ytdl|invidious|piped|adblock|ad-?block|proxy/i)
    }
  })

  it('is honest that ads may play', () => {
    expect(library).toMatch(/ads may play/i)
  })

  it('ships a real library of collections', () => {
    expect(music).toMatch(/label: '90s Bollywood'/)
    expect(music).toMatch(/label: 'New Bollywood'/)
    // Every collection id is a non-empty YouTube playlist id (PL…), never a stub.
    const ids = [...music.matchAll(/playlistId: '([^']*)'/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThanOrEqual(4)
    for (const id of ids) expect(id, `playlist id "${id}" looks fake`).toMatch(/^PL[\w-]{8,}$/)
  })

  it('never autoplays before the student taps a playlist', () => {
    // Autoplay is opt-in: the flag starts false and flips only on a chip pick.
    expect(library).toMatch(/useState\(false\)/)
    expect(library).toMatch(/setAutoPlay\(true\)/)
  })
})
