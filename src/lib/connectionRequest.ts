/**
 * CLIENT → /api/connections/request
 *
 * The request itself runs on the server (service role) so a missing table
 * privilege or an over-tight RLS policy cannot fail a student's tap with an
 * opaque error. This module only knows how to call that route and how to turn
 * its answer into one line of copy.
 */

export type RequestStatus = 'pending' | 'accepted' | 'campus_only' | 'blocked' | 'not_found' | 'self' | 'error'

export interface RequestResult {
  status: RequestStatus
  id?: string
  message?: string
}

const STATUSES: RequestStatus[] = ['pending', 'accepted', 'campus_only', 'blocked', 'not_found', 'self', 'error']

export async function sendConnectionRequest(receiverId: string): Promise<RequestResult> {
  try {
    const res = await fetch('/api/connections/request', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverId }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && STATUSES.includes(data?.status)) {
      return { status: data.status, id: data.id }
    }
    const status = STATUSES.includes(data?.error) ? data.error : 'error'
    return { status, message: typeof data?.message === 'string' ? data.message : undefined }
  } catch {
    return { status: 'error', message: 'Network error — check your connection' }
  }
}

/** One line + toast tone for every server answer. */
export function requestResultCopy(result: RequestResult): {
  message: string
  tone: 'success' | 'danger'
} {
  switch (result.status) {
    case 'pending':
      return { message: 'Request sent', tone: 'success' }
    case 'accepted':
      return { message: 'Connected — you can message each other now', tone: 'success' }
    case 'campus_only':
      return { message: 'This student only accepts requests from their own campus', tone: 'danger' }
    case 'blocked':
      return { message: 'You cannot send a request to this student', tone: 'danger' }
    case 'not_found':
      return { message: 'That student could not be found', tone: 'danger' }
    case 'self':
      return { message: 'You cannot connect with yourself', tone: 'danger' }
    default: {
      const detail = result.message ? ` — ${result.message.slice(0, 160)}` : ''
      return { message: `Could not send the request${detail}`, tone: 'danger' }
    }
  }
}
