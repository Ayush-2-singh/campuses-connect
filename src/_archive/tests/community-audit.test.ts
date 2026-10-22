/**
 * Repo-wide guard: the 2026-09-24 community audit must stay complete.
 *
 * The audit established the approved global community set:
 *   core: dsa, web-development, startups
 *   chat: ai-ml, academics, career, compete, general
 *
 * The legacy "Lost & Found" and "Travel Buddies" surfaces were standalone
 * features (never rows in `communities`) and were retired from the app: their
 * pages, nav cards and theme entries were removed, and
 * `20260924_archive_legacy_communities.sql` archives any non-approved row that
 * might ever appear in the table.
 *
 * Failure mode this guards against: a stale nav card, a resurrected route or a
 * hardcoded category list reappearing in a future PR and silently shipping a
 * retired surface again. Scanned by walking the tree (not git), so uncommitted
 * files are covered too.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'build',
  'dist',
  '.turbo',
  'android',
  'ios',
  '.vercel',
])
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'])

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
 * Files that legitimately mention the legacy names, with the reason why.
 * Only this guard, historical spec docs and point-in-time schema dumps
 * qualify — no route, component, nav list or theme file may appear here.
 */
const ALLOWED: { file: string; why: string }[] = [
  { file: 'tests/community-audit.test.ts', why: 'this guard names the legacy strings' },
  { file: 'docs/MIGRATION-V3.md', why: 'historical record of legacy tables kept for backward compatibility' },
  { file: 'docs/ARCHITECTURE-V3.md', why: 'historical V3 architecture spec written before the surfaces were retired' },
  { file: 'README.md', why: 'historical feature log; the retired sections describe pre-audit scope' },
  { file: 'README_CONTEXT.md', why: 'historical feature log; the retired sections describe pre-audit scope' },
  { file: 'INTERVIEW.md', why: 'historical route table written before the surfaces were retired' },
]

/** Point-in-time schema snapshots: they record what the DB *was*, not what ships. */
const ALLOWED_PREFIXES: { prefix: string; why: string }[] = [
  { prefix: 'supabase/dumps/', why: 'point-in-time schema dump (historical)' },
]

// The retired surfaces and their routes/tables. Any app-code hit is a regression.
const FORBIDDEN = [
  'lost-found', // route segment
  'lost_found', // table name
  'Lost & Found', // UI label
  'travel_buddies', // table name
  'Travel Buddies', // UI label
]

const PROJECT_ROOT = path.join(__dirname, '..')

describe('community audit guard', () => {
  it('no app file references the retired Lost & Found / Travel surfaces', () => {
    const offenders: string[] = []

    for (const file of walk(PROJECT_ROOT)) {
      const rel = path.relative(PROJECT_ROOT, file).split(path.sep).join('/')
      if (ALLOWED.some((a) => a.file === rel)) continue
      if (ALLOWED_PREFIXES.some((a) => rel.startsWith(a.prefix))) continue
      const text = fs.readFileSync(file, 'utf8')
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) offenders.push(`${rel} → "${needle}"`)
      }
    }

    expect(
      offenders,
      `Legacy community surfaces reappeared (see 20260924_archive_legacy_communities.sql and the audit notes):\n${offenders.join('\n')}`
    ).toEqual([])
  })

  it('the approved community set is asserted in the archival migration', () => {
    const migration = path.join(PROJECT_ROOT, 'supabase', 'migrations', '20260924_archive_legacy_communities.sql')
    expect(fs.existsSync(migration), 'archival migration missing').toBe(true)
    const sql = fs.readFileSync(migration, 'utf8')
    for (const key of ['dsa', 'web-development', 'startups', 'ai-ml', 'academics', 'career', 'compete', 'general']) {
      expect(sql, `approved community "${key}" missing from archival migration`).toContain(`'${key}'`)
    }
    // The archive sweep must exist and must not delete anything.
    expect(sql).toMatch(/UPDATE\s+public\.communities/i)
    expect(sql).toMatch(/is_active\s*=\s*FALSE/i)
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.communities/i)
  })

  it('the live-chat category list only ever reads active, chat-enabled communities', () => {
    const page = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'app', 'chat', 'page.tsx'), 'utf8')
    expect(page).toMatch(/\.eq\('is_active',\s*true\)/)
    expect(page).toMatch(/\.eq\('chat_enabled',\s*true\)/)
  })

  it('direct URLs to inactive rooms are blocked by is_active', () => {
    const room = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'app', 'chat', '[slug]', 'page.tsx'), 'utf8')
    expect(room).toMatch(/is_active/)
  })
})
