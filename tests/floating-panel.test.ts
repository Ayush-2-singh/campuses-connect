/**
 * MOVABLE IN-CALL CHAT — the placement rules behind the draggable panel.
 *
 * A panel the user can drag is a panel the user can LOSE, so the rules matter
 * more than the dragging:
 *   • it can never be dragged off-screen (or remembered off-screen — a spot
 *     saved on a big desktop must not strand it on a phone);
 *   • it can never be dropped on top of the call's control bar, because mic
 *     and leave are the two controls that must always be reachable;
 *   • it is movable without a pointer too, via the arrow keys.
 *
 * These run against the real module — no DOM needed, which is exactly why the
 * maths lives in its own file.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  CALL_CONTROL_BAR_RESERVE,
  PANEL_KEY_STEP,
  PANEL_MARGIN,
  clampPanelPosition,
  defaultPanelPosition,
  movePanelByKey,
  movePanelPosition,
  readPanelPosition,
  savePanelPosition,
  type StorageLike,
} from '@/lib/floatingPanel'

const PANEL = { width: 320, height: 380 }
const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 700 }

/** Seam between the panel's lowest edge and the reserved control bar. */
const CONTROL_BAR_TOP = (viewport: { height: number }) => viewport.height - CALL_CONTROL_BAR_RESERVE

describe('clampPanelPosition — the panel can not be lost', () => {
  it('pulls a panel dragged past the top-left corner back to the margin', () => {
    expect(clampPanelPosition({ x: -400, y: -900 }, PANEL, DESKTOP)).toEqual({
      x: PANEL_MARGIN,
      y: PANEL_MARGIN,
    })
  })

  it('pulls a panel dragged past the right edge back inside', () => {
    const clamped = clampPanelPosition({ x: 99_999, y: 100 }, PANEL, DESKTOP)
    expect(clamped.x).toBe(DESKTOP.width - PANEL.width - PANEL_MARGIN)
  })

  it('never lets the panel rest on the call control bar (mic / leave)', () => {
    const clamped = clampPanelPosition({ x: 100, y: 99_999 }, PANEL, DESKTOP)
    expect(clamped.y + PANEL.height).toBeLessThanOrEqual(CONTROL_BAR_TOP(DESKTOP) + 0.0001)
  })

  it('keeps the whole panel visible on a phone too', () => {
    const clamped = clampPanelPosition({ x: 99_999, y: 99_999 }, PANEL, PHONE)
    expect(clamped.x).toBe(PHONE.width - PANEL.width - PANEL_MARGIN)
    expect(clamped.y + PANEL.height).toBeLessThanOrEqual(CONTROL_BAR_TOP(PHONE) + 0.0001)
  })

  it('falls back to the margin when the panel is bigger than the room left over', () => {
    const tiny = { width: 200, height: 200 }
    const clamped = clampPanelPosition({ x: 50, y: 50 }, PANEL, tiny)
    expect(clamped).toEqual({ x: PANEL_MARGIN, y: PANEL_MARGIN })
  })

  it('leaves an already-valid spot untouched', () => {
    expect(clampPanelPosition({ x: 40, y: 60 }, PANEL, DESKTOP)).toEqual({ x: 40, y: 60 })
  })
})

describe('defaultPanelPosition — where it starts', () => {
  it('docks under the header at the right edge', () => {
    const pos = defaultPanelPosition(PANEL, DESKTOP)
    expect(pos.x).toBe(DESKTOP.width - PANEL.width - PANEL_MARGIN)
    expect(pos.y).toBeGreaterThanOrEqual(PANEL_MARGIN)
  })

  it('is inside the control-bar reserve even on a small screen', () => {
    const pos = defaultPanelPosition(PANEL, PHONE)
    expect(pos.y + PANEL.height).toBeLessThanOrEqual(CONTROL_BAR_TOP(PHONE) + 0.0001)
  })
})

describe('movePanelPosition — dragging', () => {
  it('applies the drag delta', () => {
    expect(movePanelPosition({ x: 100, y: 100 }, { x: 30, y: -20 }, PANEL, DESKTOP)).toEqual({ x: 130, y: 80 })
  })

  it('clamps a delta that would take the panel out of the call', () => {
    const moved = movePanelPosition({ x: 100, y: 100 }, { x: -10_000, y: 10_000 }, PANEL, DESKTOP)
    expect(moved.x).toBe(PANEL_MARGIN)
    expect(moved.y).toBe(CONTROL_BAR_TOP(DESKTOP) - PANEL.height)
  })
})

describe('movePanelByKey — placeable without a pointer', () => {
  const origin = { x: 200, y: 200 }

  it('moves in each arrow direction', () => {
    expect(movePanelByKey(origin, 'ArrowLeft', PANEL, DESKTOP)).toEqual({ x: 200 - PANEL_KEY_STEP, y: 200 })
    expect(movePanelByKey(origin, 'ArrowRight', PANEL, DESKTOP)).toEqual({ x: 200 + PANEL_KEY_STEP, y: 200 })
    expect(movePanelByKey(origin, 'ArrowUp', PANEL, DESKTOP)).toEqual({ x: 200, y: 200 - PANEL_KEY_STEP })
    expect(movePanelByKey(origin, 'ArrowDown', PANEL, DESKTOP)).toEqual({ x: 200, y: 200 + PANEL_KEY_STEP })
  })

  it('ignores every other key, so the caller can leave the event alone', () => {
    for (const key of ['Enter', 'Escape', 'a', 'Tab']) {
      expect(movePanelByKey(origin, key, PANEL, DESKTOP)).toBeNull()
    }
  })

  it('clamps at the edge instead of walking off-screen', () => {
    const pinned = { x: PANEL_MARGIN, y: PANEL_MARGIN }
    expect(movePanelByKey(pinned, 'ArrowLeft', PANEL, DESKTOP)).toEqual(pinned)
    expect(movePanelByKey(pinned, 'ArrowUp', PANEL, DESKTOP)).toEqual(pinned)
  })
})

describe('remembering where the user put it', () => {
  function fakeStorage(initial?: string) {
    const map = new Map<string, string>()
    if (initial !== undefined) map.set('key', initial)
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      raw: map,
    }
  }

  it('round-trips a position', () => {
    const storage = fakeStorage()
    savePanelPosition(storage, 'key', { x: 42, y: 84 })
    expect(readPanelPosition(storage, 'key', PANEL, DESKTOP)).toEqual({ x: 42, y: 84 })
  })

  it('falls back to the default dock when nothing was saved', () => {
    const storage = fakeStorage()
    expect(readPanelPosition(storage, 'key', PANEL, DESKTOP)).toEqual(defaultPanelPosition(PANEL, DESKTOP))
  })

  it('clamps a spot saved on a much bigger screen', () => {
    // Remembered on a 2560×1400 desktop, opened on a phone: without the clamp
    // the panel would be off-screen and look "lost".
    const storage = fakeStorage(JSON.stringify({ x: 2100, y: 900 }))
    const pos = readPanelPosition(storage, 'key', PANEL, PHONE)
    expect(pos.x).toBeLessThanOrEqual(PHONE.width - PANEL.width - PANEL_MARGIN)
    expect(pos.y).toBeLessThanOrEqual(CONTROL_BAR_TOP(PHONE) - PANEL.height)
  })

  it('ignores corrupt or nonsense storage instead of throwing', () => {
    for (const junk of ['{not json', '[]', 'null', '{"x":"12","y":5}', '{"x":null,"y":null}']) {
      const storage = fakeStorage(junk)
      expect(readPanelPosition(storage, 'key', PANEL, DESKTOP)).toEqual(defaultPanelPosition(PANEL, DESKTOP))
    }
  })

  it('survives a storage that throws (private browsing)', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readPanelPosition(throwing, 'key', PANEL, DESKTOP)).toEqual(defaultPanelPosition(PANEL, DESKTOP))
    expect(() => savePanelPosition(throwing, 'key', { x: 1, y: 1 })).not.toThrow()
  })

  it('writes the raw numbers, not a class instance', () => {
    const storage = fakeStorage()
    const spy = vi.spyOn(storage, 'setItem')
    savePanelPosition(storage, 'key', { x: 3, y: 4 })
    expect(spy).toHaveBeenCalledWith('key', '{"x":3,"y":4}')
    expect(storage.getItem('key')).toBe('{"x":3,"y":4}')
  })
})
