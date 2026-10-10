// ═══════════════════════════════════════════════════════════════════════════
// FLOATING PANEL — where a movable panel (the in-call chat box) sits.
//
// No React and no DOM: every function takes plain numbers and returns a plain
// point, so the placement rules are unit-testable without a browser. The
// component owns the pointer events; this module owns the maths.
//
// The rules exist because a panel the user can drag is a panel the user can
// lose: it must never leave the viewport, and it must never be droppable on
// top of the call's control bar (mic / leave).
// ═══════════════════════════════════════════════════════════════════════════

/** Smallest gap kept between the panel and any viewport edge. */
export const PANEL_MARGIN = 12

/**
 * Height reserved at the bottom of a call screen for the sticky control bar
 * (60px controls + 18/16px padding + the home-indicator inset). A panel
 * dropped here would cover mic and leave, which are the two controls a person
 * must always be able to reach.
 */
export const CALL_CONTROL_BAR_RESERVE = 104

/** How far one arrow-key press moves the panel. */
export const PANEL_KEY_STEP = 16

export interface PanelSize {
  width: number
  height: number
}

export interface PanelPoint {
  x: number
  y: number
}

export interface ClampOptions {
  margin?: number
  /** Space to keep clear at the bottom (e.g. the call's control bar). */
  bottomReserve?: number
}

/** Keep a panel of `size` inside `viewport`, honouring the reserved strip. */
export function clampPanelPosition(
  point: PanelPoint,
  size: PanelSize,
  viewport: PanelSize,
  opts: ClampOptions = {}
): PanelPoint {
  const margin = opts.margin ?? PANEL_MARGIN
  const bottomReserve = opts.bottomReserve ?? CALL_CONTROL_BAR_RESERVE
  // max() guards the case where the panel is bigger than the space it has:
  // the lower bound wins instead of producing a negative box.
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - bottomReserve)
  return {
    x: Math.min(Math.max(point.x, margin), maxX),
    y: Math.min(Math.max(point.y, margin), maxY),
  }
}

/** Where the panel sits before the user has moved it: top-right, under the header. */
export function defaultPanelPosition(size: PanelSize, viewport: PanelSize, opts: ClampOptions = {}): PanelPoint {
  const margin = opts.margin ?? PANEL_MARGIN
  return clampPanelPosition({ x: viewport.width - size.width - margin, y: 72 }, size, viewport, opts)
}

/** Apply a drag delta to the panel's origin, clamped. */
export function movePanelPosition(
  origin: PanelPoint,
  delta: PanelPoint,
  size: PanelSize,
  viewport: PanelSize,
  opts: ClampOptions = {}
): PanelPoint {
  return clampPanelPosition({ x: origin.x + delta.x, y: origin.y + delta.y }, size, viewport, opts)
}

/**
 * Keyboard equivalent of a drag, so the panel is movable without a pointer.
 * Returns null for any other key (the caller then leaves the event alone).
 */
export function movePanelByKey(
  origin: PanelPoint,
  key: string,
  size: PanelSize,
  viewport: PanelSize,
  opts: ClampOptions = {},
  step: number = PANEL_KEY_STEP
): PanelPoint | null {
  const delta =
    key === 'ArrowLeft'
      ? { x: -step, y: 0 }
      : key === 'ArrowRight'
        ? { x: step, y: 0 }
        : key === 'ArrowUp'
          ? { x: 0, y: -step }
          : key === 'ArrowDown'
            ? { x: 0, y: step }
            : null
  if (!delta) return null
  return movePanelPosition(origin, delta, size, viewport, opts)
}

/** The slice of `Storage` this needs (`sessionStorage` satisfies it). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Read the remembered position, else the default dock. Anything unusable
 * (corrupt JSON, private-browsing throw, a position from a bigger screen) is
 * clamped, so a remembered spot can never strand the panel off-screen.
 */
export function readPanelPosition(
  storage: StorageLike,
  key: string,
  size: PanelSize,
  viewport: PanelSize,
  opts: ClampOptions = {}
): PanelPoint {
  try {
    const raw = storage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
      if (
        typeof parsed?.x === 'number' &&
        typeof parsed?.y === 'number' &&
        Number.isFinite(parsed.x) &&
        Number.isFinite(parsed.y)
      ) {
        return clampPanelPosition({ x: parsed.x, y: parsed.y }, size, viewport, opts)
      }
    }
  } catch {
    /* private browsing or corrupt JSON — fall through to the default dock */
  }
  return defaultPanelPosition(size, viewport, opts)
}

/** Remember where the user put it. Best-effort: never throws. */
export function savePanelPosition(storage: StorageLike, key: string, point: PanelPoint): void {
  try {
    storage.setItem(key, JSON.stringify({ x: point.x, y: point.y }))
  } catch {
    /* nothing to do — the panel simply won't be remembered */
  }
}
