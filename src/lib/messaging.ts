/**
 * MESSAGING HELPERS — pure functions behind /messages and /messages/[id].
 *
 * The network is connection-gated: a request has to be accepted before two
 * students can chat (the same rule the SQL enforces in 029_dms_connections and
 * 030_fix_chat_policies). Keeping that decision here makes every screen agree
 * on the same state — a profile button, the people finder and the hub all read
 * `connectionState` instead of each re-deriving it.
 *
 * Side-effect free and database-free on purpose: these are the parts that are
 * cheap to unit test, so the JSX can stay about layout.
 */

// ─── Connections ─────────────────────────────────────────────────────────────

export type ConnState = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

export interface ConnectionRow {
  id: string
  requester_id: string
  receiver_id: string
  status: string
  created_at?: string
}

export interface ScopeProfile {
  id?: string | null
  interaction_scope?: string | null
  campus_id?: string | null
}

/**
 * Mirrors `can_interact_with_profile` (migration 034): a campus-only profile is
 * reachable only from the same campus. The UI uses this to avoid offering a
 * Connect button the database would reject, and to say WHY it is unavailable.
 */
export function canRequestConnection(
  me: ScopeProfile | null | undefined,
  target: ScopeProfile | null | undefined
): boolean {
  if (!me?.id || !target?.id || me.id === target.id) return false
  const myScope = me.interaction_scope || 'global'
  const theirScope = target.interaction_scope || 'global'
  if (myScope === 'campus' && (!me.campus_id || me.campus_id !== target.campus_id)) return false
  if (theirScope === 'campus' && (!target.campus_id || target.campus_id !== me.campus_id)) return false
  return true
}

/**
 * Postgres/PostgREST errors → copy a student can act on. The generic fallback
 * keeps the backend message: a connection request used to fail with no clue
 * why, which is what made this bug hard to report.
 */
export function connectionErrorCopy(
  error: { code?: string | null; message?: string | null } | null | undefined
): string {
  switch (error?.code) {
    case '23505':
      return 'You already sent them a request'
    case '42501':
      return 'This student only accepts requests from their own campus'
    case '23503':
      return 'That student could not be found'
    case '23514':
      return 'You cannot connect with yourself'
    case 'PGRST202':
    case '42883':
      return 'Connections are not set up yet — try again in a moment'
    default:
      return error?.message ? `Could not send the request — ${error.message}` : 'Could not send the request'
  }
}

export interface Network {
  /** Accepted connections — these peers can be messaged. */
  accepted: { id: string; peerId: string }[]
  /** Requests waiting for me to accept or decline. */
  received: { id: string; peerId: string }[]
  /** Requests I sent that are still pending. */
  sent: { id: string; peerId: string }[]
}

/** The other student in a connection row. */
export function peerOf(row: Pick<ConnectionRow, 'requester_id' | 'receiver_id'>, meId: string): string {
  return row.requester_id === meId ? row.receiver_id : row.requester_id
}

/**
 * What the profile button should say. A row in either direction counts: an
 * accepted connection is mutual, and a pending request only means something
 * relative to who sent it.
 */
export function connectionState(rows: ConnectionRow[], meId: string, peerId: string): ConnState {
  let sent = false
  let received = false
  for (const row of rows) {
    const pair =
      (row.requester_id === meId && row.receiver_id === peerId) ||
      (row.requester_id === peerId && row.receiver_id === meId)
    if (!pair) continue
    if (row.status === 'accepted') return 'accepted'
    if (row.receiver_id === meId) received = true
    else sent = true
  }
  // Both directions can exist (the unique index only covers one direction).
  // Prefer the incoming request: accepting it closes the pair, whereas
  // "requested" would leave the peer's request stuck forever.
  if (received) return 'pending_received'
  return sent ? 'pending_sent' : 'none'
}

/** The connection row (if any) between two students — used to accept/withdraw. */
export function connectionBetween(rows: ConnectionRow[], meId: string, peerId: string): ConnectionRow | null {
  return (
    rows.find(
      (row) =>
        (row.requester_id === meId && row.receiver_id === peerId) ||
        (row.requester_id === peerId && row.receiver_id === meId)
    ) ?? null
  )
}

/**
 * Split every connection involving me into the three tabs. A row with any
 * status other than `accepted` is treated as pending so a declined/stale row
 * can never look like a live connection.
 */
export function buildNetwork(rows: ConnectionRow[], meId: string): Network {
  const network: Network = { accepted: [], received: [], sent: [] }
  for (const row of rows) {
    if (row.requester_id === meId && row.receiver_id === meId) continue
    const peerId = peerOf(row, meId)
    if (row.status === 'accepted') {
      network.accepted.push({ id: row.id, peerId })
    } else if (row.receiver_id === meId) {
      network.received.push({ id: row.id, peerId })
    } else {
      network.sent.push({ id: row.id, peerId })
    }
  }
  return network
}

// ─── Conversations ───────────────────────────────────────────────────────────

export interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  message_type?: string | null
  is_deleted?: boolean | null
  created_at: string
}

export interface ParticipantRow {
  profile_id: string
  last_read_at?: string | null
}

export interface ConversationRow {
  id: string
  created_at?: string
  conversation_participants?: ParticipantRow[]
}

/**
 * Newest message per conversation, ignoring deleted rows. Rows may arrive in
 * any order; the sort is done here so a `.limit()` on a descending query is
 * enough for the caller.
 */
export function latestByConversation(rows: MessageRow[]): Record<string, MessageRow> {
  const latest: Record<string, MessageRow> = {}
  for (const row of rows) {
    if (row.is_deleted) continue
    const current = latest[row.conversation_id]
    if (!current || row.created_at > current.created_at) latest[row.conversation_id] = row
  }
  return latest
}

/**
 * Unread = messages from the peer newer than my own `last_read_at`. My own
 * sends never count, and a conversation with no participant row for me is not
 * one I can read anyway.
 */
export function unreadByConversation(
  conversations: ConversationRow[],
  messages: MessageRow[],
  meId: string
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const conv of conversations) {
    const me = (conv.conversation_participants || []).find((p) => p.profile_id === meId)
    const since = me?.last_read_at || '1970-01-01T00:00:00.000Z'
    counts[conv.id] = messages.filter(
      (m) => m.conversation_id === conv.id && !m.is_deleted && m.sender_id !== meId && m.created_at > since
    ).length
  }
  return counts
}

export function totalUnread(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + (n > 0 ? n : 0), 0)
}

/** One-line chat-list preview. Empty threads invite the first message. */
export function conversationPreview(last: MessageRow | null | undefined, meId: string): string {
  if (!last) return 'Say hi — you’re connected'
  const body = last.content?.trim() || (last.message_type === 'image' ? 'Photo' : 'Message')
  return last.sender_id === meId ? `You: ${body}` : body
}

/** The other participant in a 1:1 conversation. */
export function chatPeerId(conv: ConversationRow, meId: string): string | null {
  const peer = (conv.conversation_participants || []).find((p) => p.profile_id !== meId)
  return peer?.profile_id ?? null
}

// ─── Time formatting ─────────────────────────────────────────────────────────

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact stamp for list rows: now · 5m · 3h · 2d · 12 Oct. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Math.max(0, now - then)
  if (diff < MINUTE) return 'now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/** Thread stamp: 9:41 AM today · Yesterday, 9:41 AM · 12 Oct, 9:41 AM. */
export function formatMessageTime(iso: string, now: number = Date.now()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date(now)
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === today.toDateString()) return time
  const yesterday = new Date(now - DAY)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`
}
