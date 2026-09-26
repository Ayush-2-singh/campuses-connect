import type { CapacitorConfig } from '@capacitor/cli'

/**
 * CampusConnect — Android shell for the existing Next.js web app.
 *
 * WHY `server.url` (remote mode) instead of a bundled static `webDir`:
 *
 * This Next.js 15 App Router project cannot be statically exported without
 * destroying functionality the spec requires us to preserve. `output: 'export'`
 * does not support:
 *   - API route handlers  → all 44 route handlers under src/app/api/**
 *   - middleware.ts       → session refresh + the /admin authorization gate
 *   - next/headers / cookies() → chunked-cookie session auth in src/lib/api/middleware.ts
 *
 * So the Android app is a native shell around the deployed site: identical
 * features, identical Supabase project, identical RLS. The web deployment is
 * unchanged, and native capabilities (camera, files, deep links, status bar)
 * are layered on top through src/lib/native/.
 *
 * `capacitor-www/` is NOT the app. It is only the local fallback Capacitor
 * shows when the remote server is unreachable (see `server.errorPath`), so the
 * user sees a branded offline state instead of the WebView's default error.
 *
 * Override the target for local development against `next dev`:
 *   CAPACITOR_SERVER_URL=http://192.168.1.20:3000 npx cap sync android
 */

const APP_URL = process.env.CAPACITOR_SERVER_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com'

// Plain HTTP is only reachable over a LAN dev tunnel, and Android blocks
// cleartext by default. Allow it *only* for an explicit http:// override so a
// release build can never ship with cleartext traffic enabled.
const isCleartext = APP_URL.startsWith('http://')

const config: CapacitorConfig = {
  appId: 'com.connecttocampus.app',
  appName: 'CampusConnect',
  webDir: 'capacitor-www',

  server: {
    url: APP_URL,
    cleartext: isCleartext,
    // Shown when the remote app cannot be reached (offline / server down).
    errorPath: 'offline.html',
  },

  android: {
    // Keep the WebView from zooming the whole UI when a form field is focused.
    // (`captureInput` for camera capture is left off — we use the Camera plugin.)
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      // We hide the splash ourselves once React has mounted and the session has
      // been restored, so the user never sees a white flash between splash and
      // first paint. See src/components/NativeShell.tsx.
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#0D1116',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
}

export default config
