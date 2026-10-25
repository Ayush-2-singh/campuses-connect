/**
 * THE BAR KEEPS ONLY WHAT A CALL IS ABOUT, AND THE EMOJI SET IS THE WHOLE SET.
 *
 * Two requests, one surface:
 *   • "emoji jaldi jaldi bhejne ka option" — WhatsApp's sheet: every category,
 *     recents, and a tap that sends WITHOUT closing, so a burst of them is one
 *     continuous flick instead of open → tap → open. It opens twice: over the
 *     control bar (floating reaction) and over the message box (into the draft).
 *   • "samne minimum cheezein rahe" — games, the compiler and music (plus hand
 *     and screen share) move behind one More menu, so the bar shows six things
 *     on a phone instead of nine and wrapping into two rows.
 *
 * Guards the things that would quietly undo either: the sheet closing on every
 * pick, a duplicate emoji landing in the grid with a colliding React key, and
 * the hidden controls losing their labels or their panels.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { EMOJI_COUNT, EMOJI_GROUPS, readEmojiRecents, rememberEmoji } from '@/lib/emojis'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const surface = read('src/components/voice/CallSurface.tsx')
const panel = read('src/components/voice/CallChatPanel.tsx')
const picker = read('src/components/voice/EmojiPicker.tsx')
const css = read('src/app/globals.css')

describe('the emoji sheet is the whole set, and it stays open', () => {
  it('offers every category with a glyph on the tab strip', () => {
    expect(EMOJI_GROUPS.length).toBeGreaterThanOrEqual(9)
    for (const group of EMOJI_GROUPS) {
      expect(group.emojis.length, `${group.key} is empty`).toBeGreaterThan(40)
      expect(group.icon.length).toBeGreaterThan(0)
      expect(group.label.length).toBeGreaterThan(0)
    }
  })

  it('holds enough of the set to be called "sare emoji"', () => {
    expect(EMOJI_COUNT).toBeGreaterThan(600)
  })

  it('has no duplicate inside a group — a repeated key would break the grid', () => {
    for (const group of EMOJI_GROUPS) {
      expect(new Set(group.emojis).size, `${group.key} repeats an emoji`).toBe(group.emojis.length)
      for (const emoji of group.emojis) expect(emoji.trim()).toBe(emoji)
    }
  })

  it('sends on every tap without closing itself', () => {
    const pickStart = picker.indexOf('const pick = (emoji: string)')
    const pickEnd = picker.indexOf('return (', pickStart)
    const pickBody = picker.slice(pickStart, pickEnd)
    expect(pickBody).toContain('onPick(emoji)')
    expect(pickBody).toContain('rememberEmoji(emoji)')
    // The whole point: closing is its own gesture (✕ / Escape / outside tap).
    expect(pickBody).not.toContain('onClose()')
  })

  it('dismisses on Escape and on a tap outside its own surfaces', () => {
    expect(picker).toMatch(/export function useDismiss/)
    expect(picker).toMatch(/event\.key === 'Escape'/)
    expect(picker).toMatch(/surface\.current\?\.contains\(target\)/)
  })

  it('keeps recents, newest first and without repeats', () => {
    const store = new Map<string, string>()
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    }

    expect(rememberEmoji('🔥')).toEqual(['🔥'])
    expect(rememberEmoji('❤️')).toEqual(['❤️', '🔥'])
    expect(rememberEmoji('🔥')).toEqual(['🔥', '❤️']) // moves to the head
    expect(readEmojiRecents()).toEqual(['🔥', '❤️'])

    delete (globalThis as { window?: unknown }).window
    expect(readEmojiRecents()).toEqual([]) // never throws without storage
  })
})

describe('the sheet opens from both emoji surfaces', () => {
  it('over the control bar, where a tap is a floating reaction', () => {
    expect(surface).toMatch(/<EmojiPicker label="Send an emoji reaction"/)
    expect(surface).toMatch(/onPick=\{sendReaction\}/)
    expect(surface).toMatch(/aria-label="Send a reaction"/)
  })

  it('over the message box, where a tap lands in the draft', () => {
    expect(panel).toMatch(/<EmojiPicker label="Add an emoji to your message"/)
    expect(panel).toMatch(/onPick=\{insertEmoji\}/)
    expect(panel).toMatch(/aria-label="Add an emoji"/)
  })

  it('still respects the composer cap when an emoji is appended', () => {
    expect(panel).toMatch(/slice\(0, CALL_CHAT_MAX_TEXT\)/)
    expect(panel).toMatch(/maxLength=\{CALL_CHAT_MAX_TEXT\}/)
  })
})

describe('the bar shows the essentials and nothing else', () => {
  const buttons = surface.match(/className="lvc-ctrl/g) ?? []

  it('keeps mic, camera, messages and More — four round controls', () => {
    expect(buttons.length).toBe(4)
    expect(surface).toMatch(/aria-label=\{isMicrophoneEnabled \? 'Mute microphone' : 'Unmute microphone'\}/)
    expect(surface).toMatch(/aria-label=\{isCameraEnabled \? 'Turn camera off' : 'Turn camera on'\}/)
    expect(surface).toMatch(/Open in-call messages/)
    expect(surface).toMatch(/aria-label="Leave the call"/)
  })

  it('no longer draws hand, share, games, compiler or music as their own button', () => {
    for (const icon of ['hand', 'screen-share', 'gamepad', 'code', 'music']) {
      expect(surface, `${icon} still has a bar button`).not.toContain(`<Icon name="${icon}" size={23} />`)
    }
  })

  it('puts them behind one More menu', () => {
    expect(surface).toMatch(/aria-label="More call options"/)
    expect(surface).toMatch(/aria-haspopup="menu"/)
    expect(surface).toMatch(/setMoreOpen\(\(open\) => !open\)/)
    expect(surface).toMatch(/role="menuitem"/)
    for (const icon of ['hand', 'screen-share', 'gamepad', 'code', 'music']) {
      expect(surface, `${icon} is missing from the More menu`).toContain(`icon="${icon}"`)
    }
  })

  it('marks whichever panel the More menu opened, so nothing hides silently', () => {
    expect(surface).toMatch(/active=\{handUp\}/)
    expect(surface).toMatch(/active=\{isScreenShareEnabled\}/)
    expect(surface).toMatch(/active=\{gamesOpen\}/)
    expect(surface).toMatch(/active=\{codeOpen\}/)
    expect(surface).toMatch(/active=\{musicOpen\}/)
    expect(surface).toMatch(/data-active=\{active \? '1' : '0'\}/)
  })

  it('closes the menu after any choice, and on a tap outside', () => {
    expect(surface).toMatch(/useDismiss\(moreOpen, closeMore, \[moreRef, moreButtonRef\]\)/)
    // Every row runs its action then closes, so the menu never lingers over
    // the panel it just opened.
    const items = surface.match(
      /onClick=\{\(\) => \{\s*\n\s*(?:onToggleHand|void toggleScreenShare|onOpenGames|onOpenCode|onOpenMusic)\(\)\s*\n\s*closeMore\(\)/g
    )
    expect(items).toBeTruthy()
    expect((items ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('still hands every panel its open state', () => {
    expect(surface).toMatch(/<Controls[\s\S]*?gamesOpen=\{gamesOpen\}/)
    expect(surface).toMatch(/codeOpen=\{codeOpen\}/)
    expect(surface).toMatch(/musicOpen=\{musicOpen\}/)
    expect(surface).toMatch(/handUp=\{myHandUp\}/)
  })

  it('still hides screen share where the browser has no getDisplayMedia', () => {
    expect(surface).toMatch(/navigator\.mediaDevices\?\.getDisplayMedia/)
    expect(surface).toMatch(/canScreenShare &&/)
  })
})

describe('a sent reaction is impossible to miss — Meet style', () => {
  it('rises from the bottom of the call screen to the top', () => {
    expect(surface).toMatch(/<ReactionRise events=\{emojiEvents\}/)
    expect(surface).toMatch(/animation: 'ccReactionRise 6s/)
    expect(css).toMatch(/@keyframes ccReactionRise \{/)
    expect(css).toMatch(/transform: translateY\(-70vh\)/)
  })

  it('shows who sent it, and says You for your own', () => {
    expect(surface).toMatch(/const name = sender\?\.name\?\.trim\(\)/)
    expect(surface).toMatch(/\{mine \? 'You' : name\}/)
    // The name rides beside the emoji, not on a second line.
    expect(surface).toMatch(/display: 'inline-flex',[\s\S]{0,80}alignItems: 'center',\s*\n\s*gap: 8/)
  })

  it('no longer hides the emoji inside the sender\u2019s own tile', () => {
    // The old burst was a 26px glyph at the bottom of an overflow:hidden tile,
    // underneath the control bar — which is why it read as "not showing".
    expect(surface).not.toMatch(/mineReactions/)
    expect(css).not.toContain('ccEmojiFloat')
    expect(surface).not.toContain("animation: 'ccEmojiFloat 3s")
  })

  it('stays up long enough to read the name, and cannot swallow a click', () => {
    expect(surface).toMatch(/const REACTION_LIFETIME = 6_000/)
    expect(surface).toMatch(/}, REACTION_LIFETIME\)/)
    const rise = surface.slice(surface.indexOf('function ReactionRise'), surface.indexOf('Data-channel reactions'))
    expect(rise).toMatch(/pointerEvents: 'none'/)
    expect(rise).toMatch(/position: 'fixed'/)
    expect(rise).toMatch(/aria-live="polite"/)
  })
})
