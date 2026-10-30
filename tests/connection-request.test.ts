import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestResultCopy, sendConnectionRequest } from '@/lib/connectionRequest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestResultCopy', () => {
  it('celebrates a sent or instantly accepted request', () => {
    expect(requestResultCopy({ status: 'pending' }).message).toBe('Request sent')
    expect(requestResultCopy({ status: 'accepted' })).toMatchObject({ tone: 'success' })
  })

  it('explains every refusal instead of a generic failure', () => {
    expect(requestResultCopy({ status: 'campus_only' }).message).toContain('own campus')
    expect(requestResultCopy({ status: 'blocked' }).message).toContain('cannot')
    expect(requestResultCopy({ status: 'not_found' }).message).toContain('could not be found')
    expect(requestResultCopy({ status: 'self' }).message).toContain('yourself')
  })

  it('keeps a server message on unknown failures', () => {
    const copy = requestResultCopy({ status: 'error', message: 'connection refused' })
    expect(copy.tone).toBe('danger')
    expect(copy.message).toContain('connection refused')
    expect(copy.message.length).toBeLessThan(230)
  })
})

describe('sendConnectionRequest', () => {
  it('posts the receiver id and reads the status', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'pending', id: 'c1' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendConnectionRequest('peer')).resolves.toEqual({ status: 'pending', id: 'c1' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connections/request',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ receiverId: 'peer' }),
      })
    )
  })

  it('maps a refusal to its status and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'campus_only' }),
      }))
    )
    await expect(sendConnectionRequest('peer')).resolves.toEqual({ status: 'campus_only', message: undefined })
  })

  it('turns a network failure into an actionable result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    const result = await sendConnectionRequest('peer')
    expect(result.status).toBe('error')
    expect(result.message).toContain('Network')
  })
})
