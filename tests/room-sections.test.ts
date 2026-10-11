/**
 * ROOM SECTIONS — guards the expanded topic taxonomy used when CREATING a room.
 *
 * The product now offers Games / Learn / Language / Discuss / Build and, inside
 * each, the real topic (DSA, Web Dev, Java, Python, SQL, AI/ML, English, …).
 * Two promises are guarded here:
 *   1. src/lib/rooms.ts and the DB CHECK constraint list EXACTLY the same ids —
 *      a value on one side only means the RPC silently files a Java room as
 *      Random (or Postgres rejects it outright);
 *   2. the create RPC keeps the 20261102 pgcrypto fix (schema-qualified crypt,
 *      search_path = public, extensions) instead of regressing it.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CATEGORY_SECTIONS,
  ROOM_CATEGORIES,
  ROOM_CATEGORY_IDS,
  ROOM_SECTIONS,
  SECTION_LABEL,
  sectionsForCategory,
} from '@/lib/rooms'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
const migration = read('supabase/migrations/20261108_room_sections.sql')

describe('the topic catalog covers the promised sections', () => {
  it('has the CS + language topics the product asked for', () => {
    const ids = ROOM_SECTIONS.map((s) => s.id)
    for (const required of [
      'dsa',
      'web-dev',
      'java',
      'python',
      'cpp',
      'sql',
      'ai-ml',
      'mobile',
      'interview',
      'english',
      'hindi',
      'spanish',
      'discussion',
      'random',
    ]) {
      expect(ids, `missing section ${required}`).toContain(required)
    }
  })

  it('files every section under a real category', () => {
    for (const s of ROOM_SECTIONS) {
      expect(ROOM_CATEGORY_IDS, `${s.id} has a bogus category`).toContain(s.categoryId)
    }
  })

  it('labels every section, and keeps topic ids unique', () => {
    const ids = ROOM_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(SECTION_LABEL[id]).toBeTruthy()
  })

  it('exposes Learn topics through the category helper', () => {
    const learn = sectionsForCategory('learn').map((s) => s.id)
    expect(learn).toEqual(expect.arrayContaining(['dsa', 'web-dev', 'java', 'python']))
  })

  it('keeps web-dev reachable from both Learn and Build', () => {
    expect(CATEGORY_SECTIONS.learn).toContain('web-dev')
    expect(CATEGORY_SECTIONS.build).toContain('web-dev')
  })

  it('still exposes every category to discovery', () => {
    expect(ROOM_CATEGORIES.map((c) => c.id)).toEqual(ROOM_CATEGORY_IDS)
  })
})

describe('the DB CHECK constraint matches the catalog exactly', () => {
  const checkStart = migration.indexOf('CHECK (section IN (')
  const checkList = migration
    .slice(checkStart, migration.indexOf('));', checkStart))
    .match(/'([^']+)'/g)!
    .map((s) => s.replace(/'/g, ''))

  it('accepts exactly the catalog ids — no more, no fewer', () => {
    expect([...checkList].sort()).toEqual([...ROOM_SECTIONS.map((s) => s.id)].sort())
  })
})

describe('the create RPC keeps the pgcrypto fix', () => {
  it('is recreated with the schema-qualified search_path', () => {
    expect(migration).toMatch(/FUNCTION public\.create_live_voice_chat_group/)
    expect(migration).toMatch(/SET search_path = public, extensions/)
    expect(migration).toContain("gen_salt('bf', 10)")
  })

  it('accepts the same wide topic list', () => {
    const rpcStart = migration.indexOf('v_section NOT IN (')
    const rpcList = migration
      .slice(rpcStart, migration.indexOf(')', rpcStart))
      .match(/'([^']+)'/g)!
      .map((s) => s.replace(/'/g, ''))
    expect([...rpcList].sort()).toEqual([...ROOM_SECTIONS.map((s) => s.id)].sort())
  })
})

describe('the create form offers the topics', () => {
  const hub = read('src/app/live-voice-chat/page.tsx')

  it('groups the topic picker by category', () => {
    expect(hub).toContain('sectionsForCategory')
    expect(hub).toContain('<optgroup')
    expect(hub).toContain('ROOM_CATEGORIES')
  })

  it('browses category → topic instead of one flat list', () => {
    expect(hub).toContain('browsableSections')
    expect(hub).not.toMatch(/const SECTIONS = \[/)
  })
})
