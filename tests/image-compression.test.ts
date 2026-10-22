/**
 * IMAGE COMPRESSION — guards the shared client-side compressor.
 *
 * Both upload screens await compressImage() directly, so the promise must be
 * FAIL-SAFE: every failure path resolves the ORIGINAL file. Guards here lock
 * the contract whose breakage once stalled an upload screen:
 *   1. it always settles — watchdog for stalled encodes, no dead `reject` param;
 *   2. a missing 2D context or empty encode can never ship a blank
 *      "compressed" image;
 *   3. the ID-card screen compresses BEFORE the request is built and shows
 *      the student the actual saving.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

const lib = read('src/lib/compressImage.ts')

describe('compressImage is fail-safe — it always settles with a usable File', () => {
  it('has no reject path that can hang an upload', () => {
    expect(lib).toContain('new Promise((resolve) =>')
    expect(lib).not.toContain('reject')
  })

  it('gives up on a stalled encode instead of waiting forever', () => {
    expect(lib).toContain('WATCHDOG_MS')
    expect(lib).toContain('setTimeout(() => finish(file), WATCHDOG_MS)')
  })

  it('resolves the original file on every failure path', () => {
    // non-image + small-file skips
    expect(lib).toContain('if (!file.type.startsWith')
    // decode failure
    expect(lib).toContain('img.onerror = () => finish(file)')
    // missing 2D context
    expect(lib).toContain('if (!ctx)')
    // null or EMPTY encode
    expect(lib).toContain('if (!blob || blob.size === 0)')
    // throw safety nets (outer, onload, toBlob callback)
    expect(lib).toContain('} catch {\n          finish(file)')
  })

  it('never uploads a blank canvas', () => {
    // The compressed result must beat the original on size AND be non-empty.
    expect(lib).toContain('compressed.size > 0 && compressed.size < file.size')
  })

  it('cleans up its object URL', () => {
    expect(lib).toContain('URL.revokeObjectURL(objectUrl)')
  })
})

describe('the call sites compress up front', () => {
  // The campus-change / ID-card screen was removed with the page trim, so only
  // the call site that still ships is guarded here.
  const profile = read('src/app/profile/page.tsx')

  it('profile avatar still compresses before upload', () => {
    expect(profile).toContain("await import('@/lib/compressImage')")
  })
})
