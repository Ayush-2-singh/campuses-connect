/**
 * Client-side image compression.
 * Reduces file size before upload to save Supabase Storage.
 * Uses Canvas API — no dependencies needed.
 *
 * FAIL-SAFE CONTRACT: this promise ALWAYS settles with a usable File. Every
 * failure path — decode error, missing 2D context, toBlob returning null,
 * a File constructor the WebView lacks, a stalled encode — resolves the
 * ORIGINAL file. An upload screen must never hang on compression, and a
 * blank canvas must never be uploaded as the "compressed" result.
 */

interface CompressOptions {
  maxWidth?: number // max width in pixels (default: 1200)
  maxHeight?: number // max height in pixels (default: 1200)
  quality?: number // JPEG quality 0-1 (default: 0.8)
  outputType?: string // output MIME type (default: 'image/jpeg')
}

/** A stalled encode (corrupt blob, broken WebView) must not freeze an upload. */
const WATCHDOG_MS = 10_000

/**
 * Compress an image file before upload.
 * Returns a new File with reduced size — or the original on ANY failure.
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.8, outputType = 'image/jpeg' } = options

  // Skip compression for non-image files
  if (!file.type.startsWith('image/')) return file

  // Skip if already small enough (< 200KB)
  if (file.size < 200 * 1024) return file

  return new Promise((resolve) => {
    let settled = false
    let objectUrl = ''

    const finish = (result: File) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(result)
    }
    // Watchdog: if neither onload nor onerror ever fires, stop waiting.
    const watchdog = setTimeout(() => finish(file), WATCHDOG_MS)

    try {
      const img = new Image()

      img.onload = () => {
        try {
          // Calculate new dimensions
          let { width, height } = img
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          // Get the context AFTER sizing the canvas, and treat a missing 2D
          // context as "no compression" — never encode an empty canvas.
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            finish(file)
            return
          }
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              try {
                // No blob, or an EMPTY encode → keep the original bytes.
                if (!blob || blob.size === 0) {
                  finish(file)
                  return
                }
                const compressed = new File([blob], file.name, {
                  type: outputType,
                  lastModified: Date.now(),
                })
                // Only use the compressed version when it's genuinely smaller
                // AND non-empty — a blank canvas always "wins" on size alone.
                finish(compressed.size > 0 && compressed.size < file.size ? compressed : file)
              } catch {
                finish(file) // e.g. File constructor missing on old WebViews
              }
            },
            outputType,
            quality
          )
        } catch {
          finish(file)
        }
      }

      img.onerror = () => finish(file) // fallback to original
      objectUrl = URL.createObjectURL(file)
      img.src = objectUrl
    } catch {
      finish(file)
    }
  })
}
