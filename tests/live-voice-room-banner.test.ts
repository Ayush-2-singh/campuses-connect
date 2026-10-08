/**
 * ROOM BANNER — "This room does not exist" must never sit on top of a room
 * that is visibly rendered.
 *
 * What went wrong in the field: a room page showed the red banner AND the
 * room card, members and Join button underneath it. Three things let that
 * happen:
 *   1. App Router keeps the component mounted when only the dynamic param
 *      changes, so the previous room's error survived navigation.
 *   2. load() never cleared its own error on a later, successful pass.
 *   3. Overlapping loads (realtime + focus + the 15s fallback) let the
 *      slowest, oldest request win and paint from a stale snapshot.
 *
 * Failure mode this guards against: a student believing a room they can
 * plainly see is deleted, and never tapping Join.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const page = fs.readFileSync(path.join(root, 'src/app/live-voice-chat/[id]/page.tsx'), 'utf8')

describe('a successful load wipes the banner it previously raised', () => {
  it('tracks which error came from load()', () => {
    expect(page).toMatch(/loadErrorRef = useRef/)
    expect(page).toMatch(/loadErrorRef\.current = NOT_FOUND/)
  })

  it('clears exactly that error once the room is visible again', () => {
    expect(page).toMatch(/if \(loadErrorRef\.current\) \{/)
    expect(page).toMatch(/loadErrorRef\.current = ''/)
    expect(page).toMatch(/setError\(''\)/)
  })

  it('says not-found exactly once — as one constant, not inline at each call', () => {
    const message = 'This room does not exist, or it is a campus room you cannot see.'
    expect(page.split(message).length - 1).toBe(1)
  })
})

describe('the banner only ever describes a room that is not on screen', () => {
  it('stays silent when a null read happens while the room is still shown', () => {
    // A transient RLS gap (session refresh) must not shout "deleted" over a
    // fully rendered room — the guard keys off the room we already have.
    expect(page).toMatch(/if \(!groupRef\.current\) \{[\s\S]{0,200}NOT_FOUND/)
    expect(page).toMatch(/groupRef\.current = groupRow/)
  })
})

describe('only the newest load may write to the screen', () => {
  it('sequences every load', () => {
    expect(page).toMatch(/const seq = \+\+loadSeq\.current/)
    expect(page).toMatch(/const isCurrent = \(\) => seq === loadSeq\.current/)
  })

  it('drops stale work at every slow await', () => {
    const guards = page.match(/if \(!isCurrent\(\)\) return/g) ?? []
    expect(guards.length).toBeGreaterThanOrEqual(2)
  })

  it('invalidates in-flight work when the room id changes', () => {
    expect(page).toMatch(/loadSeq\.current\+\+/)
  })
})

describe('a new room id starts from a clean slate', () => {
  it('resets the previous room before the next load runs', () => {
    const reset = page.match(/useEffect\(\(\) => \{[\s\S]{0,600}\}, \[groupId\]\)/)?.[0] ?? ''
    expect(reset).toMatch(/setGroup\(null\)/)
    expect(reset).toMatch(/setError\(''\)/)
    expect(reset).toMatch(/setLoading\(true\)/)
    expect(reset).toMatch(/loadErrorRef\.current = ''/)
  })

  it('declares that reset before the init effect so ordering holds', () => {
    const resetAt = page.search(/useEffect\(\(\) => \{[\s\S]{0,600}\}, \[groupId\]\)/)
    const initAt = page.indexOf('const init = async () =>')
    expect(resetAt).toBeGreaterThan(-1)
    expect(initAt).toBeGreaterThan(resetAt)
  })
})
