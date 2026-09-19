/**
 * Native image capture for the Android shell.
 *
 * Returns a real `File`, which is the whole point: the existing pipeline
 * (`compressImage()` → `supabase.storage.upload()`) stays untouched and
 * receives exactly the same input it gets from an `<input type="file">` on
 * the web. No upload logic is duplicated.
 *
 * On the web this resolves to `null` so callers keep their existing file-input
 * path — no browser behaviour changes.
 */

import { isNativePlatform } from './platform'

/**
 * True when the user dismissed the native picker.
 * The Camera plugin rejects on cancel rather than resolving with null.
 */
export function isUserCancellation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /cancel/i.test(message)
}

/**
 * Ask the user to take a photo or choose one from the gallery.
 *
 * @returns a `File` ready for the existing upload path, or `null` when the
 *          user cancelled or no image was returned.
 * @throws  when the platform denied camera/gallery access, so the caller can
 *          show a real permission message instead of a silent no-op.
 */
export async function pickImageFile(): Promise<File | null> {
  if (!isNativePlatform()) return null

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')

  let photo: Awaited<ReturnType<typeof Camera.getPhoto>>
  try {
    photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri, // we fetch the bytes ourselves into a File
      source: CameraSource.Prompt, // native sheet: Take photo / Choose from gallery
      promptLabelHeader: 'Add a photo',
      promptLabelPicture: 'Take a photo',
      promptLabelPhoto: 'Choose from gallery',
      promptLabelCancel: 'Cancel',
    })
  } catch (err) {
    if (isUserCancellation(err)) return null
    throw new Error(
      'Camera access was denied. Allow camera/photo permission for CampusConnect in Android settings and try again.'
    )
  }

  if (!photo.webPath) return null

  const response = await fetch(photo.webPath)
  if (!response.ok) throw new Error('Could not read the selected image.')

  const blob = await response.blob()
  const format = photo.format || 'jpeg'
  const type = blob.type || `image/${format}`

  // Chromium's WebView (what Capacitor uses) supports the File constructor.
  return new File([blob], `photo-${Date.now()}.${format}`, {
    type,
    lastModified: Date.now(),
  })
}
