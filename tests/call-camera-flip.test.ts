/**
 * CAMERA FLIP — the one camera move a phone has.
 *
 * The ask: room wale section me camera rotate karne ka option, mobile ke liye.
 *
 * What has to stay true: the button only exists when there is genuinely
 * something to flip to (camera live AND a second camera), it moves the
 * RUNNING track rather than opening a second one, and the device list stays
 * honest when a camera comes or goes. A laptop with one webcam must never
 * see the control.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const surface = read('src/components/voice/CallSurface.tsx')
const icons = read('src/components/icons.tsx')

describe('flipping between the front and back camera', () => {
  it('is offered only while the camera is on and a second one exists', () => {
    expect(surface).toMatch(/\{isCameraEnabled && cameras\.length > 1 && \(/)
    expect(surface).toMatch(/aria-label="Switch between the front and back camera"/)
  })

  it('switches the running track instead of opening a second one', () => {
    expect(surface).toMatch(/await room\.switchActiveDevice\('videoinput', next\.deviceId\)/)
    // The current camera is read off the live track, never guessed.
    expect(surface).toMatch(/camera\?\.videoTrack\?\.mediaStreamTrack\.getSettings\(\)\.deviceId/)
  })

  it('keeps the device list honest as cameras come and go', () => {
    expect(surface).toMatch(/media\.addEventListener\('devicechange', refresh\)/)
    expect(surface).toMatch(/list\.filter\(\(d\) => d\.kind === 'videoinput'\)/)
    // Re-read after the camera turns on — that is when ids and labels arrive.
    expect(surface).toMatch(/\}, \[isCameraEnabled\]\)/)
  })

  it('fails quietly, so a phone that refuses leaves the view where it was', () => {
    const flip = surface.slice(
      surface.indexOf('async function flipCamera'),
      surface.indexOf('return (\n    <div className="lvc-controls"')
    )
    expect(flip).toMatch(/if \(cameras\.length < 2\) return/)
    expect(flip).toMatch(/catch \{\s*\n\s*\/\* the camera refused to switch/)
  })

  it('draws a switch-camera glyph rather than falling back to the dots', () => {
    expect(icons).toMatch(/'camera-flip': \(/)
    expect(icons).toMatch(/<path d="m18 22-3-3 3-3" \/>/)
    expect(surface).toMatch(/<Icon name="camera-flip" size=\{23\} \/>/)
  })
})
