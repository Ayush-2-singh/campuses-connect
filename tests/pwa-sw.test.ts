/**
 * SERVICE WORKER GUARDS — the bugs that made the PWA look broken.
 *
 * 1. Offline navigation fell into a `caches.match('/') || new Response(...)`
 *    trap: caches.match() returns a Promise, which is always truthy, so the
 *    branded offline page was unreachable and a visitor with an evicted
 *    cache got `undefined` (a dead response) instead.
 * 2. Static assets were cache-first with no revalidation, so an avatar or an
 *    icon shipped under the same URL never updated until site data was
 *    cleared — the exact "my change is not showing" symptom.
 * 3. The precache list pointed at retired routes (/jobs, /more, /integrations)
 *    and cached only HTML, so an offline reload had no JS/CSS chunks.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const sw = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8')

describe('offline navigation actually resolves to something', () => {
  it('awaits the offline page and the cached root before the inline fallback', () => {
    expect(sw).toMatch(/const offline = await caches\.match\('\/offline'\)/)
    expect(sw).toMatch(/const root = await caches\.match\('\/'\)/)
    expect(sw).toMatch(/return new Response\(offlineHTML\(\)/)
  })

  it('no longer short-circuits a Promise into the offline page', () => {
    // The old shape: caches.match('/') || new Response(offlineHTML()...)
    expect(sw).not.toMatch(/caches\.match\('\/'\) \|\| new Response/)
  })

  it('answers a non-navigate miss with a real error response', () => {
    expect(sw).toMatch(/if \(req\.mode !== 'navigate'\) return Response\.error\(\)/)
  })
})

describe('static assets refresh instead of rotting', () => {
  it('serves the cached copy and revalidates in the background', () => {
    expect(sw).toMatch(/background refresh, best effort/)
    expect(sw).toMatch(/refresh\.catch\(\(\) => undefined\)/)
  })

  it('still refuses to cache error responses', () => {
    expect(sw).toMatch(/Only cache successful responses/)
  })
})

describe('install and versioning stay resilient', () => {
  it('never lets one bad precache URL wedge the whole install', () => {
    expect(sw).toMatch(/Promise\.allSettled\(PRECACHE_URLS\.map/)
    expect(sw).not.toMatch(/cache\.addAll\(/)
  })

  it('carries a cache version that can be bumped to flush old bundles', () => {
    expect(sw).toMatch(/STATIC_CACHE = 'campus-static-v10'/)
    expect(sw).toMatch(/DYNAMIC_CACHE = 'campus-dynamic-v10'/)
  })

  it('never caches auth pages', () => {
    expect(sw).toContain("url.pathname.startsWith('/auth/')) return")
  })
})

describe('the offline shell is complete', () => {
  it('precaches routes that actually exist', () => {
    const list = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\]/)?.[1] ?? ''
    expect(list).toContain("'/'")
    expect(list).toContain("'/offline'")
    expect(list).toContain("'/experiences'")
    expect(list).toContain("'/companies'")
    expect(list).not.toContain("'/jobs'")
    expect(list).not.toContain("'/more'")
    expect(list).not.toContain("'/integrations'")
  })

  it('caches the Next.js chunks each precached page loads', () => {
    expect(sw).toContain('\\/_next\\/static\\/')
    expect(sw).toMatch(/precachePage/)
    expect(sw).toMatch(/precacheAsset/)
  })

  it('does not precache user-specific pages', () => {
    const list = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\]/)?.[1] ?? ''
    expect(list).not.toContain("'/messages'")
    expect(list).not.toContain("'/notifications'")
    expect(list).not.toContain("'/profile'")
    expect(list).not.toContain("'/admin'")
  })

  it('ships a real offline route to fall back to', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/offline/page.tsx'))).toBe(true)
  })

  it('keeps App Router navigation payloads out of the document cache', () => {
    expect(sw).toMatch(/req\.headers\.get\('RSC'\) === '1'/)
    expect(sw).toMatch(/RSC_CACHE/)
  })
})
