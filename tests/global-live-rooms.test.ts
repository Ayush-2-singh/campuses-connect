/**
 * /global live room board — the free4talk-style browser.
 *
 * The dashboard now opens with a browsable board of voice rooms. Two promises
 * are guarded here:
 *   1. LIVE is read through the ONE shared truth path (fetchLiveVoiceRooms), so
 *      a badge on /global can never disagree with the room page; and
 *   2. the board only offers the topics the database CHECK constraint allows,
 *      so selecting one can never produce an empty query by typo.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('the free4talk-style board on /global', () => {
  const dashboard = read('src/app/global/page.tsx')
  const board = read('src/components/global/LiveRoomBrowser.tsx')

  it('is wired into the dashboard top', () => {
    expect(dashboard).toContain("from '@/components/global/LiveRoomBrowser'")
    expect(dashboard).toContain('<LiveRoomBrowser')
  })

  it('reads LIVE through the one shared truth path', () => {
    expect(board).toMatch(/fetchLiveVoiceRooms/)
    // It must never invent its own liveness from raw call rows.
    expect(board).not.toMatch(/from\('live_voice_chat_calls'\)/)
  })

  it('offers exactly the topics the DB constraint allows', () => {
    for (const key of ['dsa', 'discussion', 'web-dev', 'english', 'random']) {
      expect(board, `missing section ${key}`).toContain(`key: '${key}'`)
    }
  })

  it('shows only live rooms — quiet ones are hidden', () => {
    // Still filtered by heartbeat-fresh participants...
    expect(board).toMatch(/liveByGroup\[g\.id\] \|\| 0\) > 0/)
    expect(board).toContain('Live now')
    // ...but non-live rooms are removed entirely: no "Quiet rooms" / "All
    // rooms" band, and no card rendered with a zero count.
    expect(board).not.toContain('Quiet rooms')
    expect(board).not.toContain('All rooms')
    expect(board).not.toMatch(/<RoomCard[^>]*count=\{0\}/)
  })

  it('summarises live rooms on each topic chip', () => {
    // The count map exists and the chip badge reads it...
    expect(board).toMatch(/const liveCountBySection = useMemo/)
    expect(board).toMatch(/liveCountBySection\[s\.key\]/)
    // ...built from EVERY group, not the section-filtered list, so a chip keeps
    // its count while another topic is selected.
    expect(board).toMatch(/for \(const g of groups\)/)
    expect(board).not.toMatch(/for \(const g of live\)/)
  })

  it('sends guests through login first', () => {
    expect(board).toContain('/auth/login?redirect=')
  })

  it('hands joining to the room page (which owns the password prompt)', () => {
    expect(board).toMatch(/live-voice-chat\/\$\{g\.id\}/)
  })
})

describe('Live Voice is a kept route (re-enabled after the V4 pivot)', () => {
  const community = read('src/app/community/page.tsx')
  const layout = read('src/components/Layout.tsx')
  const mobileNav = read('src/components/mobileNav.ts')

  it('the Community hub has no Live Voice card or link', () => {
    expect(community).not.toContain('/live-voice-chat')
    expect(community).not.toMatch(/title: 'Live Voice'/)
  })

  it('is reachable from the mobile bar and the ☰ menu', () => {
    // Re-enabled: the rooms are a primary destination again.
    expect(mobileNav).toContain("'/live-voice-chat'")
    expect(layout).toContain('/live-voice-chat')
  })

  it('no longer surfaces the student talent browser in the mobile shell', () => {
    expect(mobileNav).not.toContain("'/talent'")
  })

  it('is no longer gated in the shared feature-gate config', () => {
    // Re-enabled: the LiveKit rooms are study rooms, so they are not part of
    // the retired social plane any more. The config must say so explicitly.
    const gates = read('src/lib/featureGates.ts')
    // Not in the retired list any more…
    expect(gates).not.toMatch(/'\/live-voice-chat'\s*,?/)
    // …and the config states the re-enable explicitly, so the next reader
    // knows the removal was deliberate rather than an oversight.
    expect(gates).toMatch(/was on this list and has been RE-ENABLED/)
  })

  it('/global page still ships on disk (gated, not deleted)', () => {
    expect(read('src/app/global/page.tsx')).toContain('<LiveRoomBrowser')
  })
})
