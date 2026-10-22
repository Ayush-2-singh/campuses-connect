/**
 * FEATURE GATES — guards the V4 pivot (campus-hiring) route retirement.
 *
 * The social plane is retired, not deleted: retired page routes redirect to a
 * kept hub via src/middleware.ts, driven by src/lib/featureGates.ts. Two
 * promises are guarded here:
 *   1. isRetiredPath matches retired route PREFIXES only — segment-aware, so
 *      `/post` never swallows `/poster` and `/community` never swallows
 *      `/communities` (both are gated, but for their own reasons);
 *   2. the middleware actually consults the gate for page routes (and never
 *      gates API routes, whose contracts must stay intact).
 *
 * Reversibility: flipping SOCIAL_LAYER_RETIRED to false restores every route.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { FALLBACK_ROUTE, RETIRED_ROUTES, SOCIAL_LAYER_RETIRED, isRetiredPath } from '@/lib/featureGates'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('retired-route matching', () => {
  it('retires the social plane while it is switched on', () => {
    expect(SOCIAL_LAYER_RETIRED).toBe(true)
  })

  it('matches exact retired routes and their sub-paths', () => {
    expect(isRetiredPath('/global')).toBe(true)
    expect(isRetiredPath('/global/abc')).toBe(true)
    expect(isRetiredPath('/community')).toBe(true)
    expect(isRetiredPath('/communities')).toBe(true)
    expect(isRetiredPath('/post/123')).toBe(true)
  })

  it('never leaks into a kept route', () => {
    for (const kept of [
      '/jobs',
      '/jobs/42',
      '/companies',
      '/applications',
      '/experiences',
      // Re-enabled: LiveKit study rooms are a kept product feature (see the
      // RECRUITER_SALES_HIDDEN-era policy note in src/lib/featureGates.ts).
      '/live-voice-chat',
      '/live-voice-chat/room-1',
      '/hire/b/token-1',
      '/talent',
      '/compete',
      '/leaderboard',
      '/brain',
      '/integrations',
      '/blog',
      '/profile',
      '/campus-change',
      '/notifications',
      '/reminders',
      '/premium',
      '/admin',
    ]) {
      expect(isRetiredPath(kept), kept).toBe(false)
    }
  })

  it('is segment-aware — a retired prefix never swallows a longer name', () => {
    // `/post` is retired; `/poster` must not be treated as its child.
    expect(isRetiredPath('/poster')).toBe(false)
    expect(isRetiredPath('/posting')).toBe(false)
  })

  it('redirects to a kept hub', () => {
    // The hub moved from /jobs to /colleges when the job board was hidden.
    expect(FALLBACK_ROUTE).toBe('/colleges')
    expect(isRetiredPath(FALLBACK_ROUTE)).toBe(false)
  })

  it('lists the full retired surface', () => {
    for (const route of ['/global', '/community', '/communities', '/chat', '/messages', '/games', '/watch']) {
      expect(RETIRED_ROUTES).toContain(route)
    }
  })

  it('keeps the re-enabled live study rooms out of the retired surface', () => {
    // The LiveKit rooms were retired with the social plane and then re-enabled:
    // reading/studying together is part of the student product, not social.
    expect(RETIRED_ROUTES).not.toContain('/live-voice-chat')
    expect(isRetiredPath('/live-voice-chat')).toBe(false)
    expect(isRetiredPath('/live-voice-chat/room-1/call')).toBe(false)
  })
})

describe('middleware wiring', () => {
  const middleware = read('src/middleware.ts')

  it('consults the gate for page routes only', () => {
    expect(middleware).toContain("from '@/lib/featureGates'")
    expect(middleware).toMatch(/isRetiredPath\(path\)/)
    // API routes are exempt so backend contracts survive the pivot.
    expect(middleware).toMatch(/!path\.startsWith\('\/api\/'\)/)
  })

  it('redirects retired routes to FALLBACK_ROUTE', () => {
    expect(middleware).toMatch(/NextResponse\.redirect\(new URL\(FALLBACK_ROUTE, request\.url\)\)/)
  })
})
