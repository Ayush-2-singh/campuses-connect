/**
 * IN-CALL MESSAGES — typing alongside a live voice call, the way Google Meet
 * does it.
 *
 * The point of the feature is that the conversation never breaks: typing must
 * NOT navigate away, must NOT unmount the LiveKit room (that would drop
 * everyone's audio), and the message control must never push the mic / leave
 * buttons off screen. Messages ride the call's own LiveKit data channel — the
 * same mechanism as the emoji reactions and the game invites — so nothing is
 * written to a database and a late joiner never sees stale lines.
 *
 * Failure modes this guards against:
 *   - chat reopening a second channel that collides with 'reaction'/'game'
 *   - the sender never seeing their own line (LiveKit does not echo back)
 *   - a hostile/garbled payload rendering as-is, or a giant string landing in
 *     the thread
 *   - the unread badge counting my own messages, or never clearing
 *   - the chat panel overlapping the control bar
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CALL_CHAT_MAX_TEXT,
  CALL_CHAT_MAX_THREAD,
  appendChatMessage,
  cleanChatText,
  unreadCount,
  type CallChatMessage,
} from '@/lib/callChat'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const call = read('src/components/voice/CallSurface.tsx')
const layer = read('src/components/voice/LiveKitCallLayer.tsx')
const panel = read('src/components/voice/CallChatPanel.tsx')
const css = read('src/app/globals.css')

describe('cleanChatText — one gate for every line of chat', () => {
  it('keeps ordinary text, trimmed', () => {
    expect(cleanChatText('  hello campus  ')).toBe('hello campus')
  })

  it('drops whitespace-only lines so nothing blank can be sent', () => {
    expect(cleanChatText('   ')).toBe('')
    expect(cleanChatText('\n\t ')).toBe('')
  })

  it('rejects anything that is not a string', () => {
    for (const bad of [undefined, null, 42, {}, ['hi']]) expect(cleanChatText(bad)).toBe('')
  })

  it('caps the line so a hostile peer cannot flood the thread', () => {
    const huge = 'x'.repeat(CALL_CHAT_MAX_TEXT * 10)
    expect(cleanChatText(huge)).toHaveLength(CALL_CHAT_MAX_TEXT)
  })

  it('keeps multi-line messages intact (Shift+Enter)', () => {
    expect(cleanChatText('line one\nline two')).toBe('line one\nline two')
  })
})

describe('unreadCount — the badge only counts other people', () => {
  const msg = (key: number, mine: boolean): CallChatMessage => ({
    key,
    id: mine ? 'me' : 'them',
    name: mine ? 'You' : 'Asha',
    text: 'hi',
    at: 0,
    mine,
  })

  it('counts lines from others that arrived after the last read', () => {
    const thread = [msg(1, false), msg(2, true), msg(3, false), msg(4, false)]
    expect(unreadCount(thread, 1)).toBe(2)
  })

  it('never badges me for my own message', () => {
    expect(unreadCount([msg(1, true), msg(2, true)], 0)).toBe(0)
  })

  it('reads as clear once the cursor reaches the newest line', () => {
    const thread = [msg(1, false), msg(2, false)]
    expect(unreadCount(thread, 2)).toBe(0)
  })

  it('is empty for an empty thread', () => {
    expect(unreadCount([], 0)).toBe(0)
  })
})

describe('the call page runs chat on its own data channel', () => {
  it('opens the chat topic next to reaction and game', () => {
    expect(call).toMatch(/useDataChannel\('chat'/)
    expect(call).toMatch(/useDataChannel\('reaction'/)
    expect(call).toMatch(/useDataChannel\('game'/)
  })

  it('echoes my own line locally, carrying MY identity', () => {
    // LiveKit never echoes a data message back to its sender, so without this
    // the person typing would never see their own message.
    expect(call).toMatch(/LiveKit does not echo a data message back to its sender/)
    expect(call).toMatch(/mine: true/)
    expect(call).toMatch(/id: myIdentity \?\? 'local'/)
  })

  it('sends reliably — a dropped chat line reads as being ignored', () => {
    expect(call).toMatch(/JSON\.stringify\(\{ text: body \}\)\), \{ reliable: true \}/)
  })

  it('ignores a malformed payload instead of rendering it', () => {
    expect(call).toMatch(/malformed payload, e\.g\. a peer still on an older bundle/)
    expect(call).toMatch(/const text = cleanChatText\(parsed\?\.text\)/)
    expect(call).toMatch(/if \(!text\) return/)
  })

  it('caps the thread so an all-night call stays small', () => {
    expect(call).toMatch(/appendChatMessage\(prev, msg, key\)/)
  })

  it('uses the shared unread cursor instead of counting my own lines', () => {
    expect(call).toMatch(/const unread = unreadCount\(messages, readKey\)/)
    expect(call).toMatch(/if \(chatOpen && messages\.length\) setReadKey/)
  })
})

describe('chat never breaks the call itself', () => {
  it('keeps the audio renderer on the call layer', () => {
    // RoomAudioRenderer must not move inside the chat panel — it is what keeps
    // everybody audible while the thread is on screen. It is mounted above the
    // routes, with the connection, so it survives navigation too.
    expect(layer).toMatch(/<RoomAudioRenderer \/>/)
    expect(panel).not.toMatch(/<RoomAudioRenderer \/>/)
  })

  it('keeps mic / camera / leave in the control bar alongside the message button', () => {
    expect(call).toMatch(/aria-label="Leave the call"/)
    expect(call).toMatch(/aria-label=\{isMicrophoneEnabled \? 'Mute microphone' : 'Unmute microphone'\}/)
    expect(call).toMatch(/Open in-call messages/)
  })

  it('floats the panel over the call instead of taking a column', () => {
    // It used to be a side column; it is now movable, so it takes no layout
    // space at all and the tiles keep the full width.
    expect(call).toMatch(/\{chatOpen && <CallChatPanel /)
    expect(call).not.toMatch(/lvc-chat-col/)
    expect(css).toMatch(/\.lvc-chat-float \{[\s\S]*?position: fixed;/)
  })

  it('is moved by the header, and never by the header\u2019s buttons', () => {
    // Grabbing the close / reset buttons must not drag the panel.
    expect(panel).toMatch(/if \(\(e\.target as HTMLElement\)\.closest\('button'\)\) return/)
    expect(css).toMatch(/\.lvc-chat-grip \{[\s\S]*?touch-action: none;/)
  })

  it('can be put back to its default spot', () => {
    expect(panel).toMatch(/aria-label="Move the panel back to its default spot"/)
    expect(panel).toMatch(/defaultPanelPosition\(measure\(\), viewportSize\(\)\)/)
  })

  it('closes the panel without touching the room', () => {
    expect(call).toMatch(/onClose=\{\(\) => setChatOpen\(false\)\}/)
    expect(call).not.toMatch(/onClose=\{[^}]*leave/)
  })

  it('badges the message control and anchors it for the badge', () => {
    expect(call).toMatch(/lvc-ctrl lvc-chat-toggle/)
    expect(css).toMatch(/\.lvc-chat-toggle \{\s*position: relative;/)
    expect(css).toMatch(/\.lvc-chat-badge \{/)
  })
})

describe('appendChatMessage — the thread stays bounded', () => {
  const line = (text: string): Omit<CallChatMessage, 'key'> => ({
    id: 'them',
    name: 'Asha',
    text,
    at: 0,
    mine: false,
  })

  it('appends a line and stamps its key', () => {
    const next = appendChatMessage([], line('hi'), 1)
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ key: 1, text: 'hi' })
  })

  it('drops the oldest line once the thread is full', () => {
    let thread: CallChatMessage[] = []
    for (let i = 1; i <= CALL_CHAT_MAX_THREAD + 5; i++) thread = appendChatMessage(thread, line(`m${i}`), i)

    expect(thread).toHaveLength(CALL_CHAT_MAX_THREAD)
    expect(thread[0].text).toBe('m6') // the first five fell off
    expect(thread[thread.length - 1].text).toBe(`m${CALL_CHAT_MAX_THREAD + 5}`)
  })

  it('keeps the read cursor meaningful after trimming (keys only grow)', () => {
    let thread: CallChatMessage[] = []
    for (let i = 1; i <= CALL_CHAT_MAX_THREAD + 5; i++) thread = appendChatMessage(thread, line(`m${i}`), i)
    // Nothing new since the newest line → badge clear, never negative.
    expect(unreadCount(thread, CALL_CHAT_MAX_THREAD + 5)).toBe(0)
    expect(unreadCount(thread, 3)).toBe(CALL_CHAT_MAX_THREAD)
  })
})

describe('the panel is a plain messenger', () => {
  it('sends on Enter and keeps Shift+Enter for a new line', () => {
    expect(panel).toMatch(/e\.key === 'Enter' && !e\.shiftKey && !e\.nativeEvent\.isComposing/)
    expect(panel).toMatch(/e\.preventDefault\(\)/)
    expect(panel).toMatch(/submit\(\)/)
  })

  it('auto-scrolls to the newest message', () => {
    expect(panel).toMatch(/el\.scrollTop = el\.scrollHeight/)
  })

  it('renders message text as a text node, never as HTML', () => {
    expect(panel).not.toMatch(/dangerouslySetInnerHTML/)
    expect(panel).toMatch(/\{m\.text\}/)
  })

  it('tells people the thread is live and not saved', () => {
    expect(panel).toMatch(/Everyone on the call can see this · not saved/)
    expect(panel).toMatch(/No messages yet\./)
  })

  it('caps the composer and disables send while empty', () => {
    expect(panel).toMatch(/maxLength=\{CALL_CHAT_MAX_TEXT\}/)
    expect(panel).toMatch(/disabled=\{!canSend\}/)
  })

  it('labels the panel and the log for screen readers', () => {
    expect(panel).toMatch(/aria-label="In-call messages"/)
    expect(panel).toMatch(/role="log"/)
    expect(panel).toMatch(/aria-label="Send message"/)
  })
})
