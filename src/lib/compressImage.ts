/**
 * Client-side image compression.
 * Reduces file size before upload to save Supabase Storage.
 * Uses Canvas API — no dependencies needed.
 */

interface CompressOptions {
  maxWidth?: number    // max width in pixels (default: 1200)
  maxHeight?: number   // max height in pixels (default: 1200)
  quality?: number     // JPEG quality 0-1 (default: 0.8)
  outputType?: string  // output MIME type (default: 'image/jpeg')
}

/**
 * Compress an image file before upload.
 * Returns a new File with reduced size.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.8,
    outputType = 'image/jpeg',
  } = options

  // Skip compression for non-image files
  if (!file.type.startsWith('image/')) return file

  // Skip if already small enough (< 200KB)
  if (file.size < 200 * 1024) return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    img.onload = () => {
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

      canvas.width = width
      canvas.height = height
      ctx?.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const compressed = new File([blob], file.name, {
            type: outputType,
            lastModified: Date.now(),
          })
          // Only use compressed version if it's actually smaller
          resolve(compressed.size < file.size ? compressed : file)
        },
        outputType,
        quality
      )
    }

    img.onerror = () => resolve(file) // fallback to original
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Get human-readable file size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
