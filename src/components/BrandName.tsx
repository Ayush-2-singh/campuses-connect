import React from 'react'

/**
 * BrandName — the "ConnectToCampus" wordmark, drawn in the LOGO's own colors.
 *
 * The logo (public/connect-to-campus-logo-*.png) is a single brand ORANGE
 * (#FC9000) mark; the wordmark beside it reads "Connect" in the theme text
 * colour and "ToCampus" in that same orange.
 *
 * Why this component exists: those two colours must NOT follow the section
 * accent. `accentForPath()` recolours `--accent-text` per route (Community →
 * purple, Global → cyan, Compete → green), so the old
 * `Connect<span style={{ color: 'var(--accent-text)' }}>ToCampus</span>`
 * tinted the brand text differently on every page — and the auth pages
 * hardcoded a slightly different orange. One component keeps the wordmark
 * identical everywhere, and matches the logo.
 */
export const BRAND_ORANGE = '#FC9000'

export default function BrandName({ style, className }: { style?: React.CSSProperties; className?: string }) {
  return (
    <span style={style} className={className}>
      Connect<span style={{ color: BRAND_ORANGE }}>ToCampus</span>
    </span>
  )
}
