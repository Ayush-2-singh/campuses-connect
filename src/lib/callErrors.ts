// ═══════════════════════════════════════════════════════════════════════════
// VOICE CALL ERRORS — turn the LiveKit SDK's raw text into something a student
// can act on. Pure and unit-testable: no React, no SDK import.
// ═══════════════════════════════════════════════════════════════════════════

/** Map a LiveKit/network failure onto one actionable sentence. */
export function describeCallError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (/permission|notallowed|denied/i.test(message)) {
    return 'Microphone access was blocked. Allow the microphone for this site and join again.'
  }
  if (/token|unauthor|401|403/i.test(message)) {
    return 'Your call token was rejected. Rejoin the room to get a new one.'
  }
  if (/network|disconnect|websocket/i.test(message)) {
    return 'Lost the connection to the voice server. Check your internet and rejoin.'
  }
  return message || 'Could not connect to the voice room.'
}
