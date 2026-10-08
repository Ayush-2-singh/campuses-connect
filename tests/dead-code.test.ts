/**
 * DEAD CODE GUARD — what the cleanup removed must stay removed.
 *
 * The cleanup deleted an unreferenced component set, the Events feature and a
 * pile of CSS nobody could reach. Every one of those came back once already
 * in this project's history (a nav item pointing at a route that no longer
 * exists), so the absence is asserted rather than assumed.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel: string) => fs.existsSync(path.join(root, rel))

/** Every source string in src/, joined, so "no reference anywhere" is one check. */
function srcCorpus(): string {
  const parts: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) parts.push(fs.readFileSync(full, 'utf8'))
    }
  }
  walk(path.join(root, 'src'))
  return parts.join('\n')
}

const corpus = srcCorpus()

describe('the Events feature is gone', () => {
  it('has no route', () => {
    expect(exists('src/app/events')).toBe(false)
  })

  it('has no link left anywhere', () => {
    // The GitHub activity API URL is not our route.
    const hits = corpus.match(/['"`]\/events/g) ?? []
    expect(hits).toHaveLength(0)
  })

  it('is out of the menu, sitemap and pulse feed', () => {
    expect(read('src/components/mobileNav.ts')).not.toMatch(/\/events/)
    expect(read('src/app/sitemap.ts')).not.toMatch(/\/events/)
    expect(read('src/components/LivePulseFeed.tsx')).not.toMatch(/\/events/)
    expect(read('src/app/more/page.tsx')).not.toMatch(/\/events/)
  })

  it('does not strand an old notification tap', () => {
    // A new_event notification used to deep-link straight to the deleted page.
    expect(read('src/app/notifications/page.tsx')).not.toMatch(/case 'new_event'/)
  })
})

describe('the Classroom notification category is gone', () => {
  it('is not classified or labelled', () => {
    expect(read('src/app/notifications/page.tsx')).not.toMatch(/Classroom/)
  })

  it('leaves the accent map without a dead entry', () => {
    expect(read('src/theme/colors.ts')).not.toMatch(/'\/events'/)
  })
})

describe('unreferenced files stayed deleted', () => {
  it('does not resurrect them', () => {
    const gone = [
      'src/components/IconBanner.tsx',
      'src/components/MatchScore.tsx',
      'src/components/PullToRefresh.tsx',
      'src/components/SplashScreen.tsx',
      'src/components/theme-provider.tsx',
      'src/components/theme-toggle.tsx',
      'src/lib/featureFlags.ts',
      'src/lib/noteUid.ts',
    ]
    for (const rel of gone) expect(exists(rel), `${rel} should be gone`).toBe(false)
  })

  it('leaves no import pointing at them', () => {
    for (const name of ['IconBanner', 'MatchScore', 'PullToRefresh', 'featureFlags', 'noteUid']) {
      expect(corpus).not.toMatch(new RegExp(`from '@/[^']*${name}'`))
    }
  })
})

describe('unreachable CSS stayed deleted', () => {
  const css = read('src/app/globals.css')

  it('drops classes no source file can reach', () => {
    for (const cls of [
      'card-premium',
      'feature-card',
      'grad-gold',
      'h-scroll-cards',
      'home-redesign-grid',
      'home-row-3',
      'home-announcements',
      'line-clamp-2',
      'lvc-header',
      'lvc-newroom',
      'note-highlight',
      'profile-ring',
      'rise-in',
      'standalone-bottomnav',
      'stat-grid',
      'text-gradient',
      'ai-search-input',
      'ai-search-btn',
    ]) {
      expect(css, `. ${cls} should be gone`).not.toContain(`.${cls}`)
    }
    expect(css).not.toContain('orbDrift')
  })

  it('keeps the modifier that is built at runtime', () => {
    // Toast.tsx renders `toast toast--${t.tone}` — a literal search never
    // finds it, which is exactly how it nearly got deleted once.
    expect(css).toContain('.toast--success')
    expect(css).toContain('.toast--danger')
    expect(read('src/components/Toast.tsx')).toContain('toast--${t.tone}')
  })
})
