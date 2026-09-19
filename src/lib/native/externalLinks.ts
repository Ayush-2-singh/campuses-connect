/**
 * External links and file downloads for the Android shell.
 *
 * WHY THIS EXISTS — two things that silently do nothing inside an Android
 * WebView, both of which the web app relies on:
 *
 *   1. `<a target="_blank">`. Capacitor's WebView has no window manager, so a
 *      new-window request can be dropped. The notes page, for example, opens
 *      every resource through `target="_blank"` (Drive links, external URLs),
 *      which would be a dead button in the app.
 *
 *   2. Downloading a file by navigation. The WebView cannot hand a storage URL
 *      to Android's download manager, so "Open →" on a note would show nothing.
 *
 * Rather than edit the ~85 route files that contain such links, one delegated
 * click listener installed by the native shell routes them all: same-origin
 * links navigate in-app, everything external opens in Chrome Custom Tabs.
 * Pages stay completely untouched, and on the web this module is never used.
 */

import { isNativePlatform } from './platform'

/** Open a URL outside the WebView, in the system browser. */
export async function openExternalUrl(url: string): Promise<void> {
  if (!isNativePlatform()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url })
}

/** Strip anything that would be unsafe or awkward as an Android file name. */
function safeFileName(name: string, fallback = 'download'): string {
  const cleaned = name
    .replace(/[^\w.\- ]+/g, '_') // no path separators or reserved characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-80) // keep the tail, so the extension survives truncation
  return cleaned || fallback
}

/**
 * Download a file to the app cache and hand it to Android's share/open sheet.
 *
 * The user gets the standard "open with / save" chooser, which is how a native
 * app is expected to deliver a download. Falls back to the system browser if
 * anything fails, so the button never becomes a dead end.
 */
export async function openOrDownloadFile(url: string, fileName?: string): Promise<void> {
  if (!isNativePlatform()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ])

    // Derive a name from the URL when the caller has none (Supabase storage
    // URLs end in the object name).
    const fromUrl = url.split('?')[0].split('/').pop() ?? ''
    const name = safeFileName(fileName || decodeURIComponent(fromUrl))

    // The cache directory needs no runtime permission and is already exposed to
    // Android's FileProvider in android/app/src/main/res/xml/file_paths.xml,
    // which is what makes the file shareable.
    await Filesystem.downloadFile({
      url,
      path: name,
      directory: Directory.Cache,
    })

    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache })

    await Share.share({
      title: name,
      url: uri,
      dialogTitle: 'Open or save this file',
    })
  } catch (err) {
    console.error('[native] file download failed, falling back to browser:', err)
    await openExternalUrl(url)
  }
}

/** `http(s)` links only — `mailto:`/`tel:` are left to the WebView's own intents. */
function isHttpUrl(url: URL): boolean {
  return url.protocol === 'https:' || url.protocol === 'http:'
}

/**
 * Install the delegated click interceptor.
 *
 * Capture phase, so it runs before any React `onClick` and before the WebView's
 * default navigation. Returns the cleanup function.
 */
export function installExternalLinkInterceptor(): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return
    // Honour modifier-clicks (they mean "open elsewhere" on desktop).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    const target = event.target as Element | null
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!anchor) return

    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#')) return

    let url: URL
    try {
      url = new URL(href, window.location.href)
    } catch {
      return
    }

    if (!isHttpUrl(url)) return // mailto:, tel:, blob:, data: — leave alone

    const isSameOrigin = url.origin === window.location.origin

    if (isSameOrigin) {
      // A new-tab link to our own app: there is no tab to open, so navigate
      // in place instead of letting the tap do nothing.
      if (anchor.target === '_blank') {
        event.preventDefault()
        window.location.assign(`${url.pathname}${url.search}${url.hash}`)
      }
      return
    }

    // External link — hand it to the system browser.
    event.preventDefault()
    void openExternalUrl(url.toString())
  }

  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
