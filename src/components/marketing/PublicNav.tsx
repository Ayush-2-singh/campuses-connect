'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import BrandName from '@/components/BrandName'
import ThemeToggle from '@/components/ThemeToggle'
import { getLogoSrc } from '@/components/LogoToggle'
import { Icon } from '@/components/icons'

/**
 * PublicNav — the ONE header for every unauthenticated page.
 *
 * `/`, `/colleges`, `/college/[slug]`, `/hire` and `/experiences` all sit
 * outside the signed-in app shell. Before this component each one carried its
 * own hand-rolled header, so the link set, the CTA and the mobile menu drifted
 * apart. Adding a destination now means editing one array.
 *
 * The same `hl-*` classes as the landing are used deliberately: the whole public
 * plane shares one stylesheet (hire-landing.css), whose tokens now alias the
 * product palette in globals.css.
 */

export const PUBLIC_NAV = [
  { label: 'Colleges', href: '/colleges', icon: 'school' },
  { label: 'Experiences', href: '/experiences', icon: 'pencil' },
  { label: 'Companies', href: '/companies', icon: 'building' },
  { label: 'Blog', href: '/blog', icon: 'book' },
  { label: 'Rooms', href: '/live-voice-chat', icon: 'mic' },
  { label: 'Practice', href: '/compete', icon: 'zap' },
]

export default function PublicNav() {
  const [logoSrc, setLogoSrc] = useState('/connect-to-campus-logo-dark.png')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setLogoSrc(getLogoSrc())
    const sync = () => setLogoSrc(getLogoSrc())
    window.addEventListener('cc-theme-change', sync)
    return () => window.removeEventListener('cc-theme-change', sync)
  }, [])

  return (
    <header className="hl-nav">
      <div className="hl-wrap hl-nav-inner">
        <Link className="hl-brand" href="/" aria-label="ConnectToCampus home">
          <img className="hl-brand-logo" src={logoSrc} alt="" width={30} height={30} />
          <BrandName className="hl-brand-name" />
        </Link>

        <nav className="hl-nav-links" aria-label="Primary">
          {PUBLIC_NAV.map((item) => (
            <Link className="hl-nav-link" href={item.href} key={item.href}>
              <Icon name={item.icon} size={18} className="hl-nav-ic" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hl-nav-right">
          <ThemeToggle mode="plain" />
          <Link className="hl-nav-signin" href="/auth/login">
            Sign in
          </Link>
          <Link className="hl-btn hl-btn--brand hl-btn--sm" href="/auth/signup">
            Get started
          </Link>
          <button
            className="hl-nav-burger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="public-nav-sheet"
            aria-label="Menu"
          >
            <Icon name={menuOpen ? 'x' : 'menu'} size={20} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="hl-nav-sheet" id="public-nav-sheet">
          <div className="hl-wrap">
            {PUBLIC_NAV.map((item) => (
              <Link className="hl-nav-sheet-link" href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            ))}
            <div className="hl-nav-sheet-cta">
              <Link className="hl-btn hl-btn--ghost" href="/auth/login" onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
              <Link className="hl-btn hl-btn--brand" href="/auth/signup" onClick={() => setMenuOpen(false)}>
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
