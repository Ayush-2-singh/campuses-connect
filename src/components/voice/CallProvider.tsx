'use client'

/**
 * CALL PROVIDER — the live voice call lives ABOVE the routes.
 *
 * It used to live inside the `/…/call` route, and that made navigation
 * destructive: leaving the page unmounted the LiveKit room and ran the leave
 * RPC, so back (or minimising) could never mean anything but "hang up". The
 * connection is owned here instead — mounted once in the root layout — so it
 * survives every route change: the user browses the rest of the app with the
 * call still running, and a compact bar follows them around (see CallSurface).
 *
 * Leaving is therefore explicit and owned in exactly one place: the Leave
 * button, or closing the tab (`pagehide`). Backgrounding the tab deliberately
 * does NOT leave — switching apps mid-sentence must not drop the call.
 *
 * The LiveKit room itself is dynamically imported and rendered only once a
 * call has a token, so no other page pays for the LiveKit bundle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { describeCallError } from '@/lib/callErrors'
import { CallContext, callScreenPath, type CallContextValue, type CallSession } from '@/components/voice/callContext'

const LiveKitCallLayer = dynamic(() => import('@/components/voice/LiveKitCallLayer'), { ssr: false })

const supabase = createClient()

export function CallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [session, setSession] = useState<CallSession | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  /** Guards the leave RPC so it can never run twice for one call. */
  const leftRef = useRef(false)
  /** Live mirror of `session` for callbacks that must stay stable. */
  const sessionRef = useRef<CallSession | null>(null)
  sessionRef.current = session

  const connect = useCallback((callId: string, groupId: string) => {
    // Already in this call — "back to call", or the route remounting after a
    // navigation. Re-fetching a token here would tear the LiveKit room down
    // and reconnect, which is exactly the blip we removed.
    if (sessionRef.current?.callId === callId) return
    leftRef.current = false
    setError('')
    setConnected(false)
    setToken(null)
    setUrl(null)
    setSession({ callId, groupId })
  }, [])

  // Token handshake — runs once per call, not per route.
  useEffect(() => {
    if (!session) return
    let cancelled = false

    const getToken = async () => {
      const { data } = await supabase.auth.getSession()
      const jwt = data.session?.access_token
      if (!jwt) throw new Error('Your session is missing. Sign in again to join the call.')

      const res = await fetch('/api/live-voice-chat/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ callId: session.callId }),
      })
      const json = await res.json()
      if (cancelled) return
      if (!res.ok) throw new Error(json.error ?? 'Could not get a call token.')
      if (!json.url) {
        throw new Error(
          'The voice server address is missing on this deployment. Add NEXT_PUBLIC_LIVEKIT_URL (or LIVEKIT_URL) to the environment and redeploy.'
        )
      }
      setToken(json.token)
      setUrl(json.url)
    }

    void getToken().catch((err) => {
      if (!cancelled) setError(describeCallError(err))
    })

    return () => {
      cancelled = true
    }
  }, [session])

  const leave = useCallback(async () => {
    const current = sessionRef.current
    if (!leftRef.current) {
      leftRef.current = true
      if (current) await supabase.rpc('leave_live_voice_chat_call', { p_call_id: current.callId })
    }
    setSession(null)
    setToken(null)
    setUrl(null)
    setConnected(false)
    setError('')

    // If the user is looking at the call screen, send them back to the room:
    // the route would otherwise sit there with nothing to show and simply
    // re-join the call it just left.
    if (current && typeof window !== 'undefined') {
      if (window.location.pathname.startsWith(callScreenPath(current.groupId))) {
        router.replace(`/live-voice-chat/${current.groupId}`)
      }
    }
  }, [router])

  /**
   * CLOSING THE TAB IS THE ONLY AUTOMATIC LEAVE.
   *
   * `pagehide` is the last event the browser reliably fires on teardown — a
   * React unmount cleanup is not guaranteed to run there — and it does NOT
   * fire when the tab is merely hidden. If even this never lands (crash,
   * force-kill), the 150s freshness sweep in 20260927_voice_live_truth still
   * clears the ghost.
   */
  useEffect(() => {
    const onPageHide = () => {
      const current = sessionRef.current
      if (!current || leftRef.current) return
      leftRef.current = true
      void supabase.rpc('leave_live_voice_chat_call', { p_call_id: current.callId })
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  /**
   * Presence heartbeat. Every surface derives LIVE from "a user is ACTUALLY
   * inside", and the server decides that from this beat (fresh = heartbeat
   * < 150s old). A crashed tab stops beating and gets swept as left within
   * ~5 minutes, so no room can show LIVE with nobody in it. Errors are ignored
   * on purpose: before the migration is applied the RPC simply doesn't exist.
   */
  useEffect(() => {
    if (!connected || !session) return
    const beat = () => {
      void supabase.rpc('touch_live_voice_chat_heartbeat', { p_call_id: session.callId })
    }
    beat()
    const timer = setInterval(beat, 30_000)
    return () => clearInterval(timer)
  }, [connected, session])

  const value = useMemo<CallContextValue>(
    () => ({
      session,
      connected,
      error,
      connect,
      leave,
      callUrl: session ? `${callScreenPath(session.groupId)}?callId=${session.callId}` : null,
    }),
    [session, connected, error, connect, leave]
  )

  return (
    <CallContext.Provider value={value}>
      {children}
      {session && token && url && (
        <LiveKitCallLayer
          token={token}
          url={url}
          onConnected={() => setConnected(true)}
          onDisconnected={leave}
          onError={(err: unknown) => setError(describeCallError(err))}
        />
      )}
    </CallContext.Provider>
  )
}
