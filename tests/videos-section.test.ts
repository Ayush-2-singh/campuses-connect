/**
 * WATCH — guards the Netflix-style /watch video wall.
 *
 * Promises guarded here (mirroring tests/music-library.test.ts):
 *   1. playback is a real OFFICIAL YouTube embed — never an unofficial
 *      stream-extraction path that could silently break YouTube's Terms;
 *   2. the catalog ships honest data: real 11-char video ids, unique, every
 *      entry filed under a declared category;
 *   3. streaming costs the app nothing: no uploads, no Supabase Storage,
 *      no database writes anywhere in the video path;
 *   4. the page is reachable — Videos sits in the app menu.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

const lib = read('src/lib/videos.ts')
const page = read('src/app/watch/page.tsx')
const nav = read('src/components/mobileNav.ts')

describe('the video catalog', () => {
  it('declares its categories and rows honestly', () => {
    // Every category id appears in the catalog, and the catalog is non-empty.
    expect(lib).toContain("id: 'trending'")
    expect(lib).toContain("id: 'study'")
    expect(lib).toContain("id: 'learn'")
    expect(lib).toContain("id: 'chill'")
    expect(lib).toContain('export const WATCH_CATALOG: WatchVideo[]')
  })

  it('uses only real YouTube ids (11 chars, URL-safe)', () => {
    const ids = [...lib.matchAll(/youtubeId: '([^']+)'/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThanOrEqual(12)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/)
  })

  it('never repeats a video', () => {
    const ids = [...lib.matchAll(/youtubeId: '([^']+)'/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('playback stays official and free', () => {
  it('embeds through youtube.com/embed — nothing unofficial', () => {
    expect(lib).toContain('https://www.youtube.com/embed/')
    // No stream-extraction or third-party proxy hosts anywhere in the path.
    for (const host of ['piped', 'invidious', 'y2mate', 'savefrom', 'videoid']) {
      expect(lib).not.toContain(host)
      expect(page).not.toContain(host)
    }
  })

  it('costs nothing: no uploads, no storage, no writes', () => {
    for (const file of [lib, page]) {
      expect(file).not.toContain('.storage.from(')
      expect(file).not.toContain('.insert(')
      expect(file).not.toContain('.upload(')
      expect(file).not.toContain('createClient')
    }
  })
})

describe('the page is wired in', () => {
  it('renders the catalog through the shared lib', () => {
    expect(page).toContain("from '@/lib/videos'")
    expect(page).toContain('youtubeVideoEmbedUrl')
    expect(page).toContain('videosForCategory')
  })

  it('is retired from the app menu and gated (V4 pivot to campus hiring)', () => {
    // The /watch wall still ships on disk, but it is retired from navigation
    // and redirected by the shared feature-gate config.
    expect(nav).not.toContain("href: '/watch'")
    expect(read('src/lib/featureGates.ts')).toContain("'/watch'")
  })
})
