// ═══════════════════════════════════════════════════════════════════════════
// IN-CALL CHAT — pure logic for the Meet-style messages panel on a live voice
// call. No React, no LiveKit, no database: the transport is the call's own
// data channel (see useCallChat in the call page), so everything here is the
// shape and the rules of a line of chat, and all of it is unit-testable.
// ═══════════════════════════════════════════════════════════════════════════

/** Hard cap mirrored on both ends — a data-channel message must stay small. */
export const CALL_CHAT_MAX_TEXT = 1000

/** How many lines the thread keeps in memory (oldest are dropped). */
export const CALL_CHAT_MAX_THREAD = 200

/** One line of the in-call thread. */
export interface CallChatMessage {
  /** Stable React key, also the read/unread cursor for the control's badge. */
  key: number
  /** Sender identity — LiveKit sets it to the auth user id. */
  id: string
  name: string
  text: string
  /** Epoch ms, shown as a clock time on the message. */
  at: number
  /** True for messages this browser sent (tinted + labelled "You"). */
  mine: boolean
}

/**
 * cleanChatText — the one gate every line of chat passes through.
 *
 * Both ends run it: the receiver on whatever arrived over the wire, the sender
 * before it goes out. A peer on a modified client can therefore never render a
 * blank line or force an oversized string into the thread.
 * Returns '' for anything that is not usable text.
 */
export function cleanChatText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().slice(0, CALL_CHAT_MAX_TEXT)
}

/**
 * unreadCount — how many lines SOMEBODY ELSE wrote since the panel last showed
 * the thread. My own echo never counts: Meet does not badge you for your own
 * message.
 */
export function unreadCount(messages: CallChatMessage[], readKey: number): number {
  let n = 0
  for (const m of messages) if (!m.mine && m.key > readKey) n++
  return n
}

/**
 * appendChatMessage — add a line to the thread, dropping the oldest once the
 * thread is full so a long call cannot grow the list without bound.
 */
export function appendChatMessage(
  thread: CallChatMessage[],
  msg: Omit<CallChatMessage, 'key'>,
  key: number
): CallChatMessage[] {
  return [...thread.slice(-(CALL_CHAT_MAX_THREAD - 1)), { ...msg, key }]
}
