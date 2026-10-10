// ═══════════════════════════════════════════════════════════════════════════
// CALL CONTEXT — the shape of "you are in a live voice call", and how to read
// it.
//
// It deliberately lives in its own module rather than in CallProvider: the
// provider renders CallSurface through the LiveKit layer, and the surface
// needs to read this context. Keeping the context here means the chain is
// provider → layer → surface → context, with no cycle back into the provider.
// ═══════════════════════════════════════════════════════════════════════════

import { createContext, useContext } from 'react'

export interface CallSession {
  callId: string
  groupId: string
}

export interface CallContextValue {
  /** The call this tab is in — null means not in a call. */
  session: CallSession | null
  /** LiveKit is connected. */
  connected: boolean
  /** Human-readable failure from the token handshake or the connection. */
  error: string
  /** Join (or come back to) a call. A no-op when already in that same call. */
  connect: (callId: string, groupId: string) => void
  /** Hang up for real. */
  leave: () => void
  /** The full call screen's URL, for "back to call". */
  callUrl: string | null
}

export const CallContext = createContext<CallContextValue | null>(null)

/** Read the call. Throws outside the provider so a missing mount is loud. */
export function useCall(): CallContextValue {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall() must be used inside <CallProvider>')
  return ctx
}

/** The call screen's path for a group — used to tell "on the call" apart. */
export function callScreenPath(groupId: string): string {
  return `/live-voice-chat/${groupId}/call`
}
