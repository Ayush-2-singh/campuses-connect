/**
 * ICON BANNER — a lightweight, theme-aware SVG "illustration" for cards.
 *
 * Replaces the heavy raster banners (webp, ~1.2 MB total) that used to sit on
 * the homepage feature/announcement/spotlight cards. Everything here is pure
 * SVG painted from the design system's own CSS variables, so it:
 *   - costs ~0 bytes (no network request at all),
 *   - recolors itself with the theme and per-card accent automatically,
 *   - never pixelates or shifts layout (aspect-ratio preserved by the parent).
 *
 * Each `variant` composes the card's existing Lucide icon into a simple
 * geometric pattern, so the artwork stays consistent with the icon system.
 */

import { Icon } from '@/components/icons'

export type IconBannerVariant =
  | 'community'
  | 'voice'
  | 'compete'
  | 'library'
  | 'opportunities'
  | 'talent'
  | 'ideas'
  | 'confession'
  | 'leaderboard'
  | 'hero'
  | 'startup'
  | 'dsa'

const VARIANTS: Record<
  IconBannerVariant,
  { icon: string; deco: 'circles' | 'waves' | 'grid' | 'spark' | 'rings' | 'nodes' }
> = {
  community: { icon: 'users', deco: 'nodes' },
  voice: { icon: 'mic', deco: 'waves' },
  compete: { icon: 'zap', deco: 'spark' },
  library: { icon: 'notebook', deco: 'grid' },
  opportunities: { icon: 'briefcase', deco: 'grid' },
  talent: { icon: 'star', deco: 'spark' },
  ideas: { icon: 'flame', deco: 'spark' },
  confession: { icon: 'eyeOff', deco: 'circles' },
  leaderboard: { icon: 'star', deco: 'rings' },
  hero: { icon: 'grad', deco: 'circles' },
  startup: { icon: 'flame', deco: 'nodes' },
  dsa: { icon: 'zap', deco: 'grid' },
}

/** Deterministic pseudo-random scatter so SSR and client render identically. */
function scatter(seed: number, count: number) {
  const out: { x: number; y: number; r: number }[] = []
  let s = seed
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280
    const x = (s / 233280) * 100
    s = (s * 9301 + 49297) % 233280
    const y = (s / 233280) * 100
    s = (s * 9301 + 49297) % 233280
    const r = 1.2 + (s / 233280) * 2.4
    out.push({ x, y, r })
  }
  return out
}

export default function IconBanner({
  variant,
  height = 170,
  iconSize = 44,
}: {
  variant: IconBannerVariant
  /** Rendered height in px — parent usually constrains width. */
  height?: number
  /** Size of the central icon glyph. */
  iconSize?: number
}) {
  const { icon, deco } = VARIANTS[variant] ?? VARIANTS.hero
  const dots = scatter(variant.length * 7919, 14)

  return (
    <svg
      width="100%"
      height={height}
      viewBox="0 0 400 170"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`ib-bg-${variant}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent-light)" />
          <stop offset="100%" stopColor="var(--bg-secondary)" />
        </linearGradient>
      </defs>

      {/* Background wash */}
      <rect width="400" height="170" fill={`url(#ib-bg-${variant})`} />

      {/* Decorative pattern, stroked with the section accent */}
      <g stroke="var(--accent)" strokeWidth="1.1" opacity="0.28" fill="none">
        {deco === 'circles' && (
          <>
            <circle cx="330" cy="40" r="46" />
            <circle cx="330" cy="40" r="28" />
            <circle cx="60" cy="140" r="34" />
          </>
        )}
        {deco === 'waves' && (
          <>
            <path d="M-10 120 Q 60 90 130 120 T 270 120 T 410 120" />
            <path d="M-10 140 Q 60 110 130 140 T 270 140 T 410 140" />
            <path d="M-10 100 Q 60 70 130 100 T 270 100 T 410 100" />
          </>
        )}
        {deco === 'grid' && (
          <>
            {[40, 90, 140, 190, 240, 290, 340, 390].map((x) => (
              <line key={`v${x}`} x1={x} y1="0" x2={x} y2="170" />
            ))}
            {[30, 80, 130].map((y) => (
              <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} />
            ))}
          </>
        )}
        {deco === 'spark' && (
          <>
            <path d="M340 30 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6z" />
            <path d="M60 130 l4 11 11 4 -11 4 -4 11 -4 -11 -11 -4 11 -4z" />
          </>
        )}
        {deco === 'rings' && (
          <>
            <ellipse cx="200" cy="185" rx="150" ry="60" />
            <ellipse cx="200" cy="185" rx="105" ry="42" />
            <ellipse cx="200" cy="185" rx="60" ry="24" />
          </>
        )}
        {deco === 'nodes' && (
          <>
            <path d="M40 130 L 140 50 L 260 110 L 360 40" />
            <circle cx="140" cy="50" r="5" fill="var(--accent)" stroke="none" />
            <circle cx="260" cy="110" r="5" fill="var(--accent)" stroke="none" />
            <circle cx="40" cy="130" r="5" fill="var(--accent)" stroke="none" />
            <circle cx="360" cy="40" r="5" fill="var(--accent)" stroke="none" />
          </>
        )}
      </g>

      {/* Ambient dots */}
      <g fill="var(--accent)" opacity="0.22">
        {dots.map((d, i) => (
          <circle key={i} cx={(d.x / 100) * 400} cy={(d.y / 100) * 170} r={d.r} />
        ))}
      </g>

      {/* Central icon medallion */}
      <g>
        <circle cx="200" cy="85" r="40" fill="var(--bg)" opacity="0.92" />
        <circle cx="200" cy="85" r="40" fill="none" stroke="var(--accent)" strokeWidth="1.4" opacity="0.6" />
        <circle cx="200" cy="85" r="30" fill="var(--accent-light)" opacity="0.9" />
        <foreignObject x="176" y="61" width="48" height="48">
          <div
            style={{
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
            }}
          >
            <Icon name={icon} size={iconSize} strokeWidth={1.8} />
          </div>
        </foreignObject>
      </g>
    </svg>
  )
}
