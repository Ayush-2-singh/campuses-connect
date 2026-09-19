/**
 * Repo-wide guard: the GupShup → Live Voice Chat rename must stay complete.
 *
 * The rename touched UI copy, routes, API paths, table names, RPC names and
 * the migration itself. The failure mode this guards against is the obvious
 * one: a stale string or table name surviving somewhere the rename never
 * reached — a nav item, a fetch URL, an RPC name, a doc line — which then
 * fails silently at runtime ("Call not found", an empty list, a 404) instead
 * of loudly at build time.
 *
 * Scanned by walking the tree rather than by calling git, so files that are
 * not committed yet are covered too.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'out', 'build', 'dist', '.turbo', 'android', 'ios'])
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.json', '.md', '.css'])

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, found)
    else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) found.push(full)
  }
  return found
}

/**
 * Files that legitimately contain the old name, with the reason why.
 *
 * Only the rename guards themselves qualify: they have to spell out the old
 * string to assert it is gone. No application, route, component, API or SQL
 * file may appear here.
 */
const ALLOWED: { file: string; why: string }[] = [
  { file: 'tests/live-voice-chat-rename.test.ts', why: 'this guard names the old string' },
  { file: 'tests/live-voice-chat-token.test.ts', why: 'asserts the token never grants the old room name' },
]

function isAllowed(relative: string) {
  return ALLOWED.some((a) => relative === a.file)
}

describe('GupShup rename completeness', () => {
  const root = process.cwd()
  const files = walk(root)

  it('scans a meaningful number of files (guards against a broken walk)', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has zero remaining gupshup references anywhere in the tree', () => {
    const offenders: string[] = []

    for (const file of files) {
      const relative = path.relative(root, file)
      if (isAllowed(relative)) continue

      const content = fs.readFileSync(file, 'utf8')
      if (/gupshup/i.test(content)) {
        // Report the matching line numbers so a failure is actionable.
        const lines = content
          .split('\n')
          .map((line, i) => ({ line, n: i + 1 }))
          .filter((l) => /gupshup/i.test(l.line))
          .map((l) => l.n)
        offenders.push(`${relative}: line ${lines.slice(0, 5).join(', ')}`)
      }
    }

    expect(offenders, `stale GupShup references:\n${offenders.join('\n')}`).toEqual([])
  })

  it('has no gupshup-named routes, pages or migration files left behind', () => {
    const leftovers = files.map((f) => path.relative(root, f)).filter((f) => /gupshup/i.test(f))

    expect(leftovers).toEqual([])
  })

  it('keeps the live voice chat route tree in place', () => {
    for (const expected of [
      'src/app/live-voice-chat/page.tsx',
      'src/app/live-voice-chat/[id]/page.tsx',
      'src/app/live-voice-chat/[id]/call/page.tsx',
      'src/app/api/live-voice-chat/token/route.ts',
      'supabase/migrations/20260920_live_voice_chat.sql',
    ]) {
      expect(fs.existsSync(path.join(root, expected)), `missing ${expected}`).toBe(true)
    }
  })
})

describe('section values stay in sync with the database CHECK', () => {
  const root = process.cwd()
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260920_live_voice_chat.sql'), 'utf8')
  const listing = fs.readFileSync(path.join(root, 'src/app/live-voice-chat/page.tsx'), 'utf8')

  const SECTIONS = ['dsa', 'discussion', 'web-dev', 'english', 'random']

  it('the migration enforces exactly these five sections', () => {
    for (const section of SECTIONS) {
      expect(migration, `migration is missing section ${section}`).toContain(`'${section}'`)
    }
    // The CHECK must list all five and nothing that the UI does not offer.
    const check = migration.match(/CHECK \(section IN \(([^)]*)\)\)/)?.[1] ?? ''
    const inCheck = [...check.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(inCheck.sort()).toEqual([...SECTIONS].sort())
  })

  it('the listing page filters on exactly the same five sections', () => {
    const block = listing.match(/const SECTIONS = \[([\s\S]*?)\] as const/)?.[1] ?? ''
    const keys = [...block.matchAll(/key: '([^']+)'/g)].map((m) => m[1]).filter((k) => k !== 'all')

    expect(keys.sort()).toEqual([...SECTIONS].sort())
  })

  it('the create RPC accepts a section and falls back to random', () => {
    expect(migration).toContain('p_section')
    // An unknown section must not reject the group — it degrades to random.
    expect(migration).toMatch(/IF v_section NOT IN[\s\S]{0,80}v_section := 'random'/)
  })
})
