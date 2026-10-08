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

  it('floats live rooms above quiet ones', () => {
    expect(board).toMatch(/liveByGroup\[g\.id\] \|\| 0\) > 0/)
    expect(board).toContain('Live now')
  })

  it('sends guests through login first', () => {
    expect(board).toContain('/auth/login?redirect=')
  })

  it('hands joining to the room page (which owns the password prompt)', () => {
    expect(board).toMatch(/live-voice-chat\/\$\{g\.id\}/)
  })
})

describe('Live Voice lives under Global, never Community', () => {
  const community = read('src/app/community/page.tsx')
  const layout = read('src/components/Layout.tsx')
  const mobileNav = read('src/components/mobileNav.ts')

  it('the Community hub has no Live Voice card or link', () => {
    expect(community).not.toContain('/live-voice-chat')
    expect(community).not.toMatch(/title: 'Live Voice'/)
  })

  it('the desktop sidebar keeps it out of Community and inside Global', () => {
    const communityChildren = layout.slice(
      layout.indexOf('const COMMUNITY_CHILDREN'),
      layout.indexOf('const GLOBAL_CHILDREN')
    )
    expect(communityChildren).not.toContain('/live-voice-chat')

    const globalChildren = layout.slice(layout.indexOf('const GLOBAL_CHILDREN'), layout.indexOf('const PROFILE_NAV'))
    expect(globalChildren).toContain('/live-voice-chat')
    // Global must actually render its group, or the child is unreachable.
    expect(layout).toMatch(/items=\{GLOBAL_CHILDREN\}/)
  })

  it('the mobile menu files it with Global', () => {
    // Scope to the ☰ menu: the primary tab list also carries /global.
    const menu = mobileNav.slice(mobileNav.indexOf('MOBILE_MENU_NAV'))
    const globalIdx = menu.indexOf("href: '/global'")
    const voiceIdx = menu.indexOf("href: '/live-voice-chat'")
    expect(globalIdx).toBeGreaterThan(-1)
    expect(voiceIdx).toBeGreaterThan(globalIdx)
  })

  it('/global still hosts the room board', () => {
    expect(read('src/app/global/page.tsx')).toContain('<LiveRoomBrowser')
  })
})
