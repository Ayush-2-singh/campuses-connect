/**
 * SERVICE WORKER GUARDS — the two bugs that made the PWA look broken.
 *
 * 1. Offline navigation fell into a `caches.match('/') || new Response(...)`
 *    trap: caches.match() returns a Promise, which is always truthy, so the
 *    branded offline page was unreachable and a visitor with an evicted
 *    cache got `undefined` (a dead response) instead.
 * 2. Static assets were cache-first with no revalidation, so an avatar or an
 *    icon shipped under the same URL never updated until site data was
 *    cleared — the exact "my change is not showing" symptom.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const sw = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8')

describe('offline navigation actually resolves to something', () => {
  it('awaits the cached root before falling back to the offline page', () => {
    expect(sw).toMatch(/return caches\.match\('\/'\)\.then\(root =>/)
    expect(sw).toMatch(/root \|\| new Response\(offlineHTML\(\)/)
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
    expect(sw).toMatch(/STATIC_CACHE = 'campus-static-v9'/)
    expect(sw).toMatch(/DYNAMIC_CACHE = 'campus-dynamic-v9'/)
  })

  it('never caches auth pages', () => {
    expect(sw).toContain("url.pathname.startsWith('/auth/')) return")
  })
})
