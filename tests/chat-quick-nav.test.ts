/**
 * CHAT QUICK NAV — the chat room header keeps Community and Games one tap away.
 *
 * Failure mode this guards against: a conversation becoming a dead end, where
 * the only way out of /chat/[slug] is the back arrow, so someone chatting has
 * no route to the Community pillar or the games hub without unwinding the
 * whole stack first.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('chat room header', () => {
  const room = read('src/app/chat/[slug]/page.tsx')

  it('offers Community and Games while you are in the room', () => {
    expect(room).toMatch(/aria-label="Open Community"/)
    expect(room).toMatch(/aria-label="Open Games"/)
  })

  it('routes them at the real destinations', () => {
    expect(room).toMatch(/router\.push\('\/community'\)/)
    expect(room).toMatch(/router\.push\('\/games'\)/)
  })

  it('keeps them inside the header, beside the back/search controls', () => {
    const start = room.indexOf('chat-room-header')
    // The search panel (rendered right after the header) marks the header end.
    const end = room.indexOf('searchOpen &&', start)
    const block = room.slice(start, end)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(block).toMatch(/Open Community/)
    expect(block).toMatch(/Open Games/)
    expect(block).toMatch(/Back to rooms/)
  })
})
