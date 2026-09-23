/**
 * Live Chat — pure helpers shared by the category list, the room screen and
 * the moderation sheet.
 *
 * Everything here is side-effect free and runs without a database, so the
 * decisions that matter (may I post? how bad is this mute? is this body
 * sendable?) are unit-testable instead of being buried in JSX.
 *
 * These functions MIRROR the SQL in 20261017_live_chat.sql. The SQL is the
 * authority — it is what actually runs on the server. The copies here exist so
 * the UI can disable a composer before a request is made and explain why.
 */

// ─── Moderation durations ─────────────────────────────────────────────────────
export interface MutePreset {
  label: string
  minutes: number | null
}

/** Presets exactly as the product spec lists them, plus indefinite. */
export const MODERATION_DURATIONS: MutePreset[] = [
  { label: '10 minutes', minutes: 10 },
  { label: '1 hour', minutes: 60 },
  { label: '24 hours', minutes: 1440 },
  { label: 'Indefinite', minutes: null },
]

export function isValidDuration(minutes: number | null | undefined): boolean {
  if (minutes === null || minutes === undefined) return true // indefinite is valid
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 60 * 24 * 365
}

/** "1 hour" · "10 minutes" · "Indefinite" — for confirmation copy. */
export function describeDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'Indefinite'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  if (minutes < 1440) {
    const h = minutes / 60
    return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`
  }
  const d = minutes / 1440
  return `${Number.isInteger(d) ? d : d.toFixed(1)} day${d === 1 ? '' : 's'}`
}

// ─── Composer rules ───────────────────────────────────────────────────────────
export const CHAT_MAX_BODY = 4000

/**
 * Is there something worth sending? Whitespace-only input is not.
 * Mirrors the `chat_messages_content_present` CHECK and the `empty_message`
 * guard in chat_post().
 */
export function isSendable(body: string, hasAttachment = false): boolean {
  if (hasAttachment) return true
  const trimmed = body.trim()
  return trimmed.length > 0 && trimmed.length <= CHAT_MAX_BODY
}

/** Server-side rejection codes → copy a student can act on. */
export function chatErrorCopy(raw: string | null | undefined): string {
  const code = (raw || '').toLowerCase()

  if (code.includes('banned')) return 'You are banned from this room.'
  if (code.includes('muted')) return 'You are muted in this room right now.'
  if (code.includes('not_a_member')) return 'Join this room to send messages.'
  if (code.includes('chat_closed')) return 'Chat is closed for this room.'
  if (code.includes('message_too_long')) return `Messages can be at most ${CHAT_MAX_BODY} characters.`
  if (code.includes('empty_message')) return 'Write something first.'
  if (code.includes('not_allowed')) return 'You do not have permission to do that.'
  if (code.includes('cannot_moderate_self')) return 'You cannot moderate yourself.'
  if (code.includes('cannot_moderate_admin')) return 'You cannot moderate another admin.'
  if (code.includes('not_authenticated')) return 'Please sign in again.'
  if (code.includes('reason_required')) return 'Please add a short reason.'
  if (code.includes('cannot_report_self')) return 'You cannot report your own message.'
  if (code.includes('invalid_reply')) return 'That message is no longer available.'
  if (code.includes('rate') || code.includes('too many')) return 'Slow down a little.'

  return raw || 'Something went wrong. Please try again.'
}

// ─── Posting permission (mirrors can_post_chat) ───────────────────────────────
export type ChatBlockReason = 'banned' | 'muted' | null

export interface PostingContext {
  signedIn: boolean
  isMember: boolean
  chatEnabled: boolean
  blockReason: ChatBlockReason
}

export interface PostingVerdict {
  allowed: boolean
  /** Why the composer is disabled — surfaced as the helper text under it. */
  reason: 'sign_in' | 'join' | 'banned' | 'muted' | 'closed' | null
}

export function postingVerdict(ctx: PostingContext): PostingVerdict {
  if (!ctx.signedIn) return { allowed: false, reason: 'sign_in' }
  if (!ctx.chatEnabled) return { allowed: false, reason: 'closed' }
  if (ctx.blockReason === 'banned') return { allowed: false, reason: 'banned' }
  if (ctx.blockReason === 'muted') return { allowed: false, reason: 'muted' }
  if (!ctx.isMember) return { allowed: false, reason: 'join' }
  return { allowed: true, reason: null }
}

export function postingReasonCopy(reason: PostingVerdict['reason']): string {
  switch (reason) {
    case 'sign_in':
      return 'Sign in to join the conversation.'
    case 'join':
      return 'Join this room to send messages.'
    case 'banned':
      return 'You are banned from this room.'
    case 'muted':
      return 'You are muted — you can read, but not send.'
    case 'closed':
      return 'Chat is closed for this room.'
    default:
      return ''
  }
}

// ─── Message grouping ─────────────────────────────────────────────────────────
export const GROUP_WINDOW_MS = 5 * 60 * 1000

export interface ChatMessageRow {
  id: string
  community_id: string
  author_id: string
  body: string | null
  attachment_url?: string | null
  attachment_type?: string | null
  reply_to_id?: string | null
  pinned_at?: string | null
  edited_at?: string | null
  deleted_at?: string | null
  created_at: string
}

/**
 * Group consecutive messages from the same author within a 5-minute window so a
 * burst of messages reads as one block on a phone (avatar + name once, not five
 * times). Returns the same rows with a `groupWithPrev` flag — no reordering, no
 * mutation of the input.
 */
export function groupMessages(rows: ChatMessageRow[]): (ChatMessageRow & { groupWithPrev: boolean })[] {
  return rows.map((row, i) => {
    const prev = rows[i - 1]
    const groupWithPrev =
      !!prev &&
      prev.author_id === row.author_id &&
      !isNewDay(prev.created_at, row.created_at) &&
      timeGapMs(prev.created_at, row.created_at) < GROUP_WINDOW_MS
    return { ...row, groupWithPrev }
  })
}

export function timeGapMs(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime())
}

export function isNewDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() !== db.getFullYear() || da.getMonth() !== db.getMonth() || da.getDate() !== db.getDate()
}

/** Day separator label: "Today" · "Yesterday" · "12 Sep 2026". */
export function daySeparatorLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const sameDay = (x: Date, y: Date) =>
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()

  if (sameDay(d, now)) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'

  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Short clock time for a message bubble. */
export function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

// ─── Category list helpers ────────────────────────────────────────────────────
/** "1,284 members" */
export function formatCount(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-IN')
}

/**
 * Honest presence label. Returns null when nobody is around — the UI then shows
 * nothing rather than a fake "1 online".
 */
export function activeLabel(active: number | null | undefined): string | null {
  const n = active ?? 0
  if (n <= 0) return null
  return `${formatCount(n)} active now`
}

export function unreadLabel(n: number | null | undefined): string | null {
  const v = n ?? 0
  if (v <= 0) return null
  return v > 99 ? '99+' : String(v)
}

// ─── Moderation ───────────────────────────────────────────────────────────────
export type ModerationAction = 'warn' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban'

export const MODERATION_ACTIONS: { action: ModerationAction; label: string; hint: string; destructive: boolean }[] = [
  { action: 'warn', label: 'Warn', hint: 'Send a warning and log it', destructive: false },
  { action: 'mute', label: 'Mute', hint: 'Read only, for a set duration', destructive: false },
  { action: 'kick', label: 'Kick', hint: 'Remove from this room — they can rejoin', destructive: true },
  { action: 'ban', label: 'Ban', hint: 'Block this room until lifted', destructive: true },
]

export const LIFT_ACTIONS: { action: ModerationAction; label: string }[] = [
  { action: 'unmute', label: 'Unmute' },
  { action: 'unban', label: 'Unban' },
]

/**
 * Whether an action needs a duration picker. Kick is an immediate removal and
 * warn writes only an audit row, so neither takes a duration.
 */
export function actionNeedsDuration(action: ModerationAction): boolean {
  return action === 'mute' || action === 'ban'
}

/** Destructive actions are confirmed with an explicit dialog. */
export function actionNeedsConfirm(action: ModerationAction): boolean {
  return action === 'kick' || action === 'ban'
}

/**
 * Can this admin action this target? Mirrors the guards in moderate_chat():
 * no self-moderation, and only a platform admin may action a platform admin.
 */
export function canModerate(args: {
  adminId: string | null
  targetId: string
  adminIsPlatformAdmin: boolean
  targetIsPlatformAdmin: boolean
}): boolean {
  if (!args.adminId) return false
  if (args.adminId === args.targetId) return false
  if (args.targetIsPlatformAdmin && !args.adminIsPlatformAdmin) return false
  return true
}

/** Stable colour-free initials for a chat avatar fallback. */
export function initials(name: string | null | undefined): string {
  const clean = (name || '').trim()
  if (!clean) return '?'
  const parts = clean.split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Reply preview: collapse newlines and clip for a one-line quote. */
export function replyPreview(body: string | null | undefined, max = 90): string {
  const flat = (body || '').replace(/\s+/g, ' ').trim()
  if (!flat) return 'Photo'
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
