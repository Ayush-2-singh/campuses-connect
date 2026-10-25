/**
 * CALL KEEP-ALIVE — the native half of "the room survives the screen going
 * off".
 *
 * The voice room is a LiveKit session inside the WebView. The moment Android
 * backgrounds the app (or the screen simply times out) the process becomes
 * eligible for freezing and the CPU can sleep: the other person's audio stops
 * even though the room never closed. The fix is Android's supported one — a
 * foreground service with a wake lock (CallKeepAliveService) — and this module
 * is the two-word bridge to it: `start` while a room is live, `stop` when the
 * user leaves.
 *
 * Rules inherited from src/lib/native/index.ts:
 *   • a no-op on the web (the browser has its own audio policy, and there is
 *     no service to run) — so nothing here can break the deployed site;
 *   • `@capacitor/core` is imported lazily, so the web bundle never carries it;
 *   • every failure resolves, never throws: a background-start refusal on
 *     Android 12+ degrades to "no wake lock", not to a broken call.
 */
import { isNativePlatform } from './platform'

interface CallKeepAliveApi {
  start(): Promise<{ started?: boolean; reason?: string }>
  stop(): Promise<void>
}

/** Registered once per page: Capacitor warns if the same plugin is re-registered. */
let apiPromise: Promise<CallKeepAliveApi | null> | null = null

function plugin(): Promise<CallKeepAliveApi | null> {
  if (!apiPromise) {
    apiPromise = import('@capacitor/core')
      .then(({ registerPlugin }) => registerPlugin<CallKeepAliveApi>('CallKeepAlive'))
      .catch(() => null) // APK built before this plugin existed — degrade quietly
  }
  return apiPromise
}

/**
 * The room just connected: ask Android to hold the process (and the CPU) for
 * as long as the call lasts. Returns whether the service actually started —
 * `false` on the web, on an old APK, or when a background-start restriction
 * refused it, all of which are legitimate states rather than errors.
 */
export async function startCallKeepAlive(): Promise<boolean> {
  if (!isNativePlatform()) return false
  const api = await plugin()
  if (!api) return false
  try {
    return !!(await api.start())?.started
  } catch {
    return false
  }
}

/** The call is over — release the wake lock and the notification. Idempotent. */
export async function stopCallKeepAlive(): Promise<void> {
  if (!isNativePlatform()) return
  const api = await plugin()
  if (!api) return
  try {
    await api.stop()
  } catch {
    /* already stopped — the leave path and pagehide both call this */
  }
}
