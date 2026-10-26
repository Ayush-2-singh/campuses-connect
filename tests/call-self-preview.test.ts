/**
 * SELF-VIEW PREVIEW — your own camera as a small floating window, Meet-style.
 *
 * The ask: "self-view floating preview, drag karke kahin bhi" — and it must
 * never be droppable somewhere the person cannot get it back from: inside
 * the viewport, clear of the control bar, movable with a keyboard too.
 *
 * The maths belongs to lib/floatingPanel.ts (unit-tested there); this file
 * pins down that the preview actually uses it, mirrors like Meet, and stays
 * out of the way until the camera is on.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const surface = read('src/components/voice/CallSurface.tsx')

describe('the floating self-view preview', () => {
  it('only exists while the camera is on, and can be dismissed until then', () => {
    expect(surface).toMatch(/\{isCameraEnabled && !selfPreviewHidden && <SelfPreview/)
    expect(surface).toMatch(/if \(!isCameraEnabled\) setSelfPreviewHidden\(false\)/)
    expect(surface).toMatch(/aria-label="Hide your camera preview"/)
  })

  it('rides the screen instead of taking a tile from the stage', () => {
    expect(surface).toMatch(/function SelfPreview\(/)
    expect(surface).toMatch(/aria-label="Your camera preview"/)
    expect(surface).toMatch(/aria-label="Move your camera preview"/)
  })

  it('is placed and dragged with the tested panel maths, not by hand', () => {
    expect(surface).toMatch(/from '@\/lib\/floatingPanel'/)
    expect(surface).toMatch(/clampPanelPosition\(/)
    expect(surface).toMatch(/movePanelPosition\(d\.origin/)
    expect(surface).toMatch(/movePanelByKey\(point, e\.key/)
    expect(surface).toMatch(/readPanelPosition\(window\.sessionStorage, storageKey/)
    expect(surface).toMatch(/savePanelPosition\(window\.sessionStorage, storageKey/)
    // Clamped again when the window shrinks under it (rotate, half-screen).
    expect(surface).toMatch(/window\.addEventListener\('resize', onResize\)/)
  })

  it('mirrors your own camera, Meet-style, and hides what it is showing', () => {
    expect(surface).toMatch(/\/\/ Meet-style: your own camera is a mirror\./)
    expect(surface).toMatch(/transform: 'scaleX\(-1\)'/)
  })

  it('dragging happens on the grip, so the video itself stays put', () => {
    expect(surface).toMatch(/touchAction: 'none'/)
    expect(surface).toMatch(/The grip is the drag surface/)
  })
})
