/**
 * CAMPUS CONNECT — CENTRAL COLOR SYSTEM
 *
 * Single source of truth for the palette used in JS (CSS variables in
 * `app/globals.css` remain the runtime source for styles). Components that
 * need colors in JS (avatars, gradients) import from here instead of
 * hardcoding hex values.
 */

export const PALETTE = {
  // Surfaces
  bg: '#0F1115',
  panel: '#171A21',
  panelSecondary: '#1E222B',
  border: '#2A2F3A',

  // Text
  text: '#E8E9ED',
  textSecondary: '#8B93A3',
  textMuted: '#697383',

  // Accents (contextual)
  gold: '#E0A83C',
  cyan: '#41C8D8',
  purple: '#A97BF0',
  green: '#4CBF7A',
  blue: '#5B9DFF',
  red: '#E0553E',

  // Text that sits on top of accent-filled surfaces (gold etc. are light,
  // so dark text keeps contrast > 4.5:1).
  onAccent: '#1D1503',
} as const

/** Palette used for avatar initials — one warm, one cool, one per person. */
export const AVATAR_COLORS: string[] = [
  PALETTE.gold,
  PALETTE.cyan,
  PALETTE.purple,
  PALETTE.green,
  PALETTE.blue,
  PALETTE.red,
]

/** Contextual accent names available to sections. */
export type AccentName = 'gold' | 'blue' | 'cyan' | 'purple' | 'green'

/**
 * Route → section accent. The Layout applies this as `data-accent` on its
 * shell so every `var(--accent)` consumer inside a section (buttons, badges,
 * active nav states, glows) follows the section's contextual color.
 *
 * Semantic direction:
 *  - gold    → brand / feed / competition / neutral
 *  - blue    → education / classroom
 *  - cyan    → discovery / opportunities / info
 *  - purple  → knowledge / AI / premium
 *  - green   → networking / talent / success
 */
export const ACCENT_BY_ROUTE: Record<string, AccentName> = {
  '/feed': 'gold',
  '/global': 'cyan',
  '/leaderboard': 'gold',
  '/weekly': 'gold',
  '/more': 'gold',
  '/notifications': 'gold',
  '/profile': 'gold',

  '/college': 'blue',
  '/meetings': 'blue',
  '/events': 'blue',

  '/compete': 'green',
  '/opportunities': 'cyan',
  '/polls': 'cyan',
  '/lost-found': 'cyan',
  '/travel': 'cyan',

  '/notes': 'purple',
  '/brain': 'purple',
  '/ask': 'purple',
  '/saved': 'purple',
  '/communities': 'purple',

  '/talent': 'green',
  '/teams': 'green',
}

/** Resolve the accent for a path (falls back to the brand gold). */
export function accentForPath(pathname: string): AccentName {
  const match = Object.keys(ACCENT_BY_ROUTE).find(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )
  return match ? ACCENT_BY_ROUTE[match] : 'gold'
}
