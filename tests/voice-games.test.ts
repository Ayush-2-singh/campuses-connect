/**
 * TALK + PLAY — a live voice call can host a game without anybody hanging up.
 *
 * The point of this feature is that the conversation never breaks: the panel
 * mounts INSIDE the call shell (LiveKit keeps the mic open), the room code
 * travels over the call's own data channel instead of being read out loud, and
 * only the room's creator announces it.
 *
 * Failure modes this guards against:
 *   - the game navigating the call away, dropping everyone's audio
 *   - the invite channel disappearing, leaving players to type codes by hand
 *   - every joiner re-broadcasting the code, so a room invites itself forever
 *   - the control bar (mic / leave) getting swallowed by the games panel
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('the voice call offers games', () => {
  const call = read('src/app/live-voice-chat/[id]/call/page.tsx')

  it('has a games control beside mic, camera and leave', () => {
    expect(call).toMatch(/Play a game with the call/)
    expect(call).toMatch(/gamesOpen/)
    expect(call).toMatch(/onOpenGames/)
  })

  it('keeps the audio renderer mounted on the page itself', () => {
    // RoomAudioRenderer must NOT move inside the games panel — it is what
    // keeps everyone audible while a game is on screen.
    expect(call).toMatch(/<RoomAudioRenderer \/>/)
  })

  it('sends the room code over the call data channel', () => {
    expect(call).toMatch(/useDataChannel\('game'/)
    expect(call).toMatch(/JSON\.stringify\(\{ game: next, code \}\)/)
  })

  it('shows a joinable invite to everyone else on the call', () => {
    expect(call).toMatch(/started \{CALL_GAME_LABELS\[invite\.game\]\}/)
    expect(call).toMatch(/onClick=\{joinInvite\}/)
  })

  it('mounts the panel in the shell instead of navigating away', () => {
    expect(call).toContain("from '@/components/games/CallGamePanel'")
    expect(call).toMatch(/<Controls[\s\S]*?gamesOpen=\{gamesOpen\}/)
  })
})

describe('the panel runs the games the app already ships', () => {
  const panel = read('src/components/games/CallGamePanel.tsx')

  it('offers Typing Battle and Quick Math', () => {
    expect(panel).toMatch(/Typing Battle/)
    expect(panel).toMatch(/Quick Math/)
    expect(panel).toMatch(/typing: 'Typing Battle'/)
    expect(panel).toMatch(/math: 'Quick Math'/)
  })

  it('hands the invited code straight to the game', () => {
    expect(panel).toMatch(/initialRoomCode=\{roomCode\}/)
    expect(panel).toMatch(/\/\* ssr: false \*\/|ssr: false/)
  })

  it('returns the created room code to the call for broadcasting', () => {
    expect(panel).toMatch(/onRoomReady\('typing', code\)/)
    expect(panel).toMatch(/onRoomReady\('math', code\)/)
  })

  it('says out loud that the call is still live', () => {
    expect(panel).toMatch(/mic is still connected/)
    expect(panel).toMatch(/Voice stays live/)
  })
})

describe('only the room creator announces the code', () => {
  it('typing broadcasts from create, never from join', () => {
    const src = read('src/components/games/TypingBattle.tsx')
    const createAt = src.indexOf('const createRoom')
    const joinAt = src.indexOf('const joinRoom')
    const announceAt = src.indexOf('onRoomReady?.(')

    expect(createAt).toBeGreaterThan(-1)
    expect(joinAt).toBeGreaterThan(createAt)
    expect(announceAt).toBeGreaterThan(createAt)
    expect(announceAt).toBeLessThan(joinAt)
    expect(src.split('onRoomReady?.(').length - 1).toBe(1)
  })

  it('quick math broadcasts from create, never from join', () => {
    const src = read('src/components/games/QuickMath.tsx')
    const createAt = src.indexOf('const handleCreate')
    const joinAt = src.indexOf('const handleJoin')
    const announceAt = src.indexOf('onRoomReady?.(')

    expect(createAt).toBeGreaterThan(-1)
    expect(joinAt).toBeGreaterThan(createAt)
    expect(announceAt).toBeGreaterThan(createAt)
    expect(announceAt).toBeLessThan(joinAt)
    expect(src.split('onRoomReady?.(').length - 1).toBe(1)
  })

  it('both games accept the callback prop', () => {
    for (const file of ['src/components/games/TypingBattle.tsx', 'src/components/games/QuickMath.tsx']) {
      expect(read(file)).toMatch(/onRoomReady\?: \(code: string\) => void/)
    }
  })
})
