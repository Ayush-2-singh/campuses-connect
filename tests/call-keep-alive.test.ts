/**
 * THE ROOM OUTLIVES THE SCREEN.
 *
 * The request behind this file: screen off hone per bhi room active rahe,
 * samne wale ki awaaz sunai de — and it ends only when the user ends it
 * (Leave, or the page going away), never when the phone locks.
 *
 * Two halves are checked, because either one alone loses the call:
 *   • the web side must ask for the keep-alive exactly while a room is live,
 *     release it on leave — and must NEVER leave on backgrounding;
 *   • the Android shell must actually hold a foreground service with a wake
 *     lock, because that is what keeps the WebView unfrozen and the CPU awake
 *     once the screen is off.
 *
 * The native sources are read as text on purpose: the Android build cannot run
 * on this machine (see MOBILE.md), so the contract is asserted where it is
 * written rather than pretended to be verified.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { startCallKeepAlive, stopCallKeepAlive } from '@/lib/native/callKeepAlive'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const provider = read('src/components/voice/CallProvider.tsx')
const bridge = read('src/lib/native/callKeepAlive.ts')
const manifest = read('android/app/src/main/AndroidManifest.xml')
const service = read('android/app/src/main/java/com/connecttocampus/app/CallKeepAliveService.java')
const plugin = read('android/app/src/main/java/com/connecttocampus/app/CallKeepAlivePlugin.java')
const activity = read('android/app/src/main/java/com/connecttocampus/app/MainActivity.java')

describe('the web side holds the keep-alive only while the room is live', () => {
  it('starts it when the room connects and stops it when the user leaves', () => {
    expect(provider).toMatch(/startCallKeepAlive/)
    expect(provider).toMatch(/stopCallKeepAlive/)
    // The effect is gated on the room, so nothing runs before a call exists
    // and the cleanup fires the moment the session ends.
    expect(provider).toMatch(/if \(!connected \|\| !session\) return/)
    expect(provider).toMatch(/return \(\) => \{[\s\S]{0,200}stopCallKeepAlive/)
  })

  it('imports the bridge lazily so the deployed site never bundles Capacitor', () => {
    expect(provider).toMatch(/import\('@\/lib\/native\/callKeepAlive'\)/)
    expect(bridge).toMatch(/import\('@capacitor\/core'\)/)
    expect(bridge).toMatch(/isNativePlatform\(\)/)
  })

  it('never leaves on backgrounding — only the page going away releases it', () => {
    expect(provider).not.toMatch(/visibilitychange/)
    expect(provider).not.toMatch(/document\.hidden/)
    // pagehide is teardown, not hiding: it stops the service AND leaves.
    const onPageHide = provider.slice(provider.indexOf('const onPageHide'), provider.indexOf('window.addEventListener'))
    expect(onPageHide).toMatch(/stopCallKeepAlive/)
    expect(onPageHide).toMatch(/leave_live_voice_chat_call/)
  })

  it('is a no-op on the web, where there is no service to run', async () => {
    expect(await startCallKeepAlive()).toBe(false)
    await expect(stopCallKeepAlive()).resolves.toBeUndefined()
  })
})

describe('on Android the call gets a foreground service with a wake lock', () => {
  it('declares every permission the service needs', () => {
    // targetSdk 36: each foreground-service TYPE needs its own install-time
    // permission, or startForeground throws the moment the screen goes off.
    for (const permission of [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.WAKE_LOCK',
    ]) {
      expect(manifest).toContain(permission)
    }
  })

  it('registers the service with the two types it starts under', () => {
    expect(manifest).toMatch(
      /<service[\s\S]*?android:name="\.CallKeepAliveService"[\s\S]*?android:exported="false"[\s\S]*?android:foregroundServiceType="microphone\|mediaPlayback"/
    )
  })

  it('keeps the CPU awake and starts foreground with a matching type', () => {
    expect(service).toMatch(/PowerManager\.PARTIAL_WAKE_LOCK/)
    expect(service).toMatch(/startForeground\(NOTIFICATION_ID, notification, type\)/)
    expect(service).toMatch(/FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK/) // mic-without-permission fallback
    expect(service).toMatch(/createWifiLock/)
    expect(service).toMatch(/wakeLock\.release\(\)/)
  })

  it('falls back instead of crashing when the microphone is not granted', () => {
    expect(service).toMatch(/catch \(SecurityException denied\)/)
    expect(service).toMatch(/stopSelf\(\)/)
  })

  it('notifies the user the call is still on, and returns to it on tap', () => {
    expect(service).toMatch(/NotificationCompat\.Builder\(this, CHANNEL_ID\)/)
    expect(service).toMatch(/setOngoing\(true\)/)
    expect(service).toMatch(/PendingIntent\.getActivity\(this, 0, open, flags\)/)
  })

  it('is driven by a plugin that resolves rather than rejects', () => {
    expect(plugin).toMatch(/@CapacitorPlugin\(name = "CallKeepAlive"\)/)
    expect(plugin).toMatch(/startForegroundService\(intent\)|startService\(intent\)/)
    expect(plugin).toMatch(/stopService\(/)
    expect(plugin).not.toMatch(/call\.reject/)
  })

  it('registers the plugin before the bridge is built', () => {
    // super.onCreate() creates the bridge; a plugin added afterwards is never
    // exposed to the WebView and start() would silently do nothing.
    const registerAt = activity.indexOf('registerPlugin(CallKeepAlivePlugin.class)')
    const superAt = activity.indexOf('super.onCreate(savedInstanceState)')
    expect(registerAt).toBeGreaterThan(-1)
    expect(registerAt).toBeLessThan(superAt)
  })
})

describe('leaving stays the only way the call ends', () => {
  it('has exactly one automatic leave: closing the page', () => {
    expect(provider).toMatch(/CLOSING THE TAB IS THE ONLY AUTOMATIC LEAVE/)
    expect(provider).toMatch(/window\.addEventListener\('pagehide', onPageHide\)/)
  })

  it('guards the leave RPC so one tap can never leave twice', () => {
    expect(provider).toMatch(/if \(!leftRef\.current\) \{/)
    expect(provider).toMatch(/leftRef\.current = true/)
  })
})
