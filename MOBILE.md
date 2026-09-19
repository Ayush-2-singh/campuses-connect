# CampusConnect — Android app (Capacitor)

The Android app is a **Capacitor shell around this same Next.js application**. It adds native
capabilities (status bar, splash, camera, file share, deep links) on top of the existing web UI.

There is one product and one backend:

```
                    SUPABASE  (unchanged — same project)
                        │
          ┌─────────────┴─────────────┐
          │                           │
     Web (Vercel)              Android app (Capacitor)
     Next.js 15                WebView → same deployment
     src/app/**                src/lib/native/** bridges
                                android/ native project
```

- Same Supabase URL, database, auth users, profiles, storage buckets, RLS policies.
- The client only ever uses the **anon key**. The service-role key stays server-side in the
  Next.js API routes and is never bundled into the app.
- A user who signs up on the web can log into the app with the same credentials, and vice versa.

---

## Why the app loads the deployed site instead of a bundled build

The spec's default flow (`next build` → `npx cap sync`) assumes Next.js can emit a static SPA
bundle for `webDir`. **This project cannot**, without deleting functionality we must preserve.
`output: 'export'` does not support:

| Unsupported feature | Where it is used here |
|---|---|
| API route handlers | all 45 routes under `src/app/api/**` |
| `middleware.ts` | session refresh + the `/admin` authorization gate |
| `next/headers` / `cookies()` | chunked-cookie session auth in `src/lib/api/middleware.ts` |
| `headers()` / image optimization | `next.config.ts` |

Static export would mean rewriting auth to client-side PKCE, reimplementing 45 endpoints as Edge
Functions, and moving admin authorization out of server code — i.e. exactly the rewrite the spec
forbids, with the security model as the casualty.

So `capacitor.config.ts` sets **`server.url`** to the deployed site. The WebView (Chromium) is the
same engine as Chrome on Android, so the existing responsive UI renders as-is, and every API
route, middleware rule and RLS policy keeps working untouched.

`capacitor-www/offline.html` is **not** the app. It is the branded fallback Capacitor shows when
the server is unreachable (`server.errorPath`).

### Upgrading to an offline bundle later

If a true offline build is ever required, the migration path is: extract a mobile-only React
surface, port the endpoints it needs to Supabase Edge Functions / RPC, and switch auth to
client-side PKCE with deep-link callbacks. That is a separate project, not a config change.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 20+ | matches the web app |
| **JDK 21** | Capacitor 8 / AGP 8.13 require JDK 17+. Gradle 8.14.3 supports **Java 24 max**, so JDK 25/26 cannot run this build. |
| Android Studio | ships the SDK + emulator |
| Android SDK Platform 36 + Build-Tools | `variables.gradle` targets `compileSdk`/`targetSdk` **36**, `minSdk` **24** |

### Verified state of this machine (builds currently blocked)

All three of these must be resolved before `npm run android:debug` can succeed:

1. **JDK 21 is not installed.** Only JDK 25 and 26 are present, and neither can run
   Gradle 8.14.3. `java -version` currently reports `26.0.2`.
2. **No Android SDK.** `ANDROID_HOME` / `ANDROID_SDK_ROOT` are unset, there is no
   `~/Library/Android/sdk`, and `adb` / `sdkmanager` are not on `PATH`.
3. **Gradle distribution download times out.** The wrapper fetches
   `gradle-8.14.3-all.zip` (~200 MB) via a redirect to
   `release-assets.githubusercontent.com`, and fails with
   `SocketTimeoutException: Connect timed out` on the wrapper's built-in 10 s
   connect timeout (observed at `HttpURLConnection.followRedirect0`).
   Pre-seed the cache to get past it:

   ```bash
   bash android/gradlew -p android --version   # retry; the .part file resumes
   # or download directly and let the wrapper pick it up:
   curl -L --retry 5 -o ~/.gradle/wrapper/dists/gradle-8.14.3-all/*/gradle-8.14.3-all.zip \
     https://services.gradle.org/distributions/gradle-8.14.3-all.zip
   ```

### Setup commands

```bash
# 1. JDK 21 (required — do NOT try to force JDK 25/26 into this build)
brew install --cask temurin@21
export JAVA_HOME=$(/usr/libexec/java_home -v 21)

# 2. Android SDK + platform 36 and build-tools
brew install --cask android-commandlinetools android-studio
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

Verify before building — all four must answer:

```bash
java -version        # 17 or 21 (NOT 25/26)
echo $ANDROID_HOME   # points at the SDK
adb version          # platform-tools installed
sdkmanager --list    # cmdline-tools installed
```

---

## Commands

### Development

```bash
npm install
npm run dev            # web app on :3000
```

To point the app at your local server (live reload on device). `http://` enables cleartext for
that build only — never ship a release this way:

```bash
CAPACITOR_SERVER_URL=http://<your-lan-ip>:3000 npm run cap:sync
npm run cap:open
```

### Sync and open

```bash
npm run cap:sync       # copy config + plugins into android/
npm run cap:open       # open the project in Android Studio
```

In Android Studio: **Run ▶** to install on a connected device or emulator.

### Debug APK

```bash
npm run android:debug
# → android/app/build/outputs/apk/debug/app-debug.apk

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Release AAB for Play Store

1. Create an upload keystore (once, keep it safe and backed up):

   ```bash
   keytool -genkey -v -keystore ~/campusconnect-upload.keystore \
     -alias campusconnect -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create `android/keystore.properties` (already gitignored — never commit it):

   ```properties
   storeFile=/Users/<you>/campusconnect-upload.keystore
   storePassword=<password>
   keyAlias=campusconnect
   keyPassword=<password>
   ```

3. Build:

   ```bash
   npm run android:bundle
   # → android/app/build/outputs/bundle/release/app-release.aab
   ```

4. Upload the `.aab` in Play Console → Production → Create release.

> The release signing config must be wired into `android/app/build.gradle`. It is left as a manual
> step because it needs your keystore; do not commit credentials.

### Play Store checklist

- App name `CampusConnect`, package `com.connecttocampus.app`
- Replace the default icons in `android/app/src/main/res/mipmap-*`
- Provide the splash image referenced by the `SplashScreen` plugin config
- Privacy policy URL — `/privacy` already exists
- Data safety form: app collects account + user content, transmits over HTTPS
- Screenshots from a real device

---

## Required Supabase change (one time)

Google sign-in on Android returns through a custom-scheme deep link, so it must be allow-listed:

**Supabase → Authentication → URL Configuration → Redirect URLs**, add:

```
connecttocampus://auth/callback
```

Keep the existing web URLs (`https://www.connecttocampus.com/auth/callback`, localhost). Without
this entry Supabase rejects the redirect and the login page shows the `oauth_failed` message it
already handles.

The custom scheme is declared in two places that must stay in sync:

- `android/app/src/main/AndroidManifest.xml` — the `VIEW` intent filter
- `src/lib/native/oauth.ts` — `NATIVE_AUTH_CALLBACK`

---

## Native capabilities

Everything lives in `src/lib/native/` and **no-ops on the web**. Plugins are dynamically imported
inside the functions that use them, so the web bundle does not carry them and SSR never evaluates
them.

| Module | Behaviour |
|---|---|
| `platform.ts` | `isNativePlatform()` — reads the global Capacitor injects; dependency-free and SSR-safe |
| `oauth.ts` | Google sign-in via system browser + deep link (Google blocks WebView OAuth) |
| `media.ts` | Camera/gallery → returns a `File` for the existing compress → upload chain |
| `externalLinks.ts` | Opens external links in Custom Tabs; downloads files to cache + share sheet |
| `deeplink.ts` | Deep-link registry; unclaimed links navigate in-app |
| `deeplink-wiring.ts` | Bridges Capacitor `appUrlOpen` into that registry |
| `index.ts` | `initNative()` — status bar, back button, network, app state, links |

`src/components/NativeShell.tsx` boots it from the root layout and hides the splash after the
session is restored.

### Why the native bridges are needed at all

| Web behaviour | Inside an Android WebView |
|---|---|
| `<a target="_blank">` | Silently does nothing — no window manager. Breaks every notes/Drive link. |
| `navigator.onLine` | Unreliable, so `OfflineIndicator` would never fire. |
| Google OAuth consent screen | Rejected with `disallowed_useragent`. |
| `<input type="file">` | Works (Chromium), but opens a bare file picker with no camera option. |
| Downloading a storage URL | WebView cannot hand it to Android's download manager. |

Each is handled by a bridge rather than by editing the ~85 pages that use them.

---

## Testing checklist

Run against a real device. Web and app share the database, so verify both directions.

**Auth**
- [ ] Web signup → app login → same profile
- [ ] App signup → web login → same profile
- [ ] Session survives app kill and relaunch
- [ ] Logout clears the session; protected routes redirect to login
- [ ] Google sign-in opens the system browser and returns signed in
- [ ] Expired session refreshes on resume

**Feed / posts**
- [ ] Feed loads, paginates, pull-to-refresh
- [ ] Create, edit, delete own post
- [ ] Like, comment, save

**Communities / notes / opportunities**
- [ ] Join and leave a community; community feed posts
- [ ] Notes list, filter, search
- [ ] "Open →" downloads the file and shows Android's open/save sheet
- [ ] External and Drive links open in Custom Tabs

**Chat / notifications**
- [ ] Realtime message arrives without a manual refresh
- [ ] Notifications fetch and mark-as-read

**Uploads**
- [ ] Avatar: native sheet offers Take photo / Choose from gallery, upload succeeds
- [ ] Denying camera permission shows the permission message, not a silent failure

**Authorization (must match the web exactly)**
- [ ] Student cannot reach `/admin` (redirected to `/feed`)
- [ ] Admin can reach every admin screen their grants allow
- [ ] Signed-out users cannot perform protected actions
- [ ] Campus/community admin scope limits still apply

**Device / UI**
- [ ] Hardware back walks history, then exits from a root screen
- [ ] Bottom navigation is not hidden by the gesture bar
- [ ] Forms are usable with the keyboard open
- [ ] Airplane mode shows the offline state, then recovers

---

## Limitations

1. **Requires a network connection.** The app loads the deployed site; there is no offline bundle.
   See "Upgrading to an offline bundle later".
2. **Push notifications are not implemented.** The web app uses browser web push, which has no
   Android equivalent under Capacitor. Real push needs FCM (`@capacitor/push-notifications`) plus
   a Firebase project and a server-side sender. Realtime in-app notifications do work — only
   background push is missing.
3. **No Play Store release keystore yet** — see the release steps above.
4. **Default Capacitor icons and splash** must be replaced with brand assets.
5. **The OAuth deep-link flow is not device-tested here** (no Android SDK on the build machine).
   Test it first: it is the highest-risk path.
6. **App Store / iOS not configured** — only `android/` was generated.

---

## Files

**Added**

- `capacitor.config.ts` — app id, name, remote `server.url`, splash config
- `MOBILE.md` — this document
- `capacitor-www/offline.html` — offline fallback shown by `server.errorPath`
- `src/lib/native/{index,platform,deeplink,deeplink-wiring,oauth,media,externalLinks}.ts`
- `src/components/NativeShell.tsx`
- `android/` — generated native project (manifest edited for the deep link)

**Modified**

- `package.json` — Capacitor deps + `cap:*` / `android:*` scripts
- `src/app/layout.tsx` — mounts `NativeShell`, adds the `viewport` export
- `src/components/GoogleSignInButton.tsx` — native OAuth branch, web path unchanged
- `src/app/profile/page.tsx` — avatar picker uses the native sheet on Android
- `src/app/notes/page.tsx` — "Open →" downloads + shares on Android
- `android/app/src/main/AndroidManifest.xml` — deep-link intent filter, optional camera feature
