import BrandName from '@/components/BrandName'
import ThemeToggle from '@/components/ThemeToggle'
import { Icon } from '@/components/icons'

/**
 * AuthShell — the shared premium frame for every auth page.
 *
 * Before this, login / signup / forgot / reset each re-declared the same
 * centered card inline (and repeated a tagline from the retired social era).
 * One shell now owns the layout: a brand panel that sells the product on the
 * left, the form on the right, collapsing to a compact brand header on phones.
 *
 * Presentation only — each page keeps its own state and Supabase calls.
 */

type Point = { icon: string; title: string; body: string }

const DEFAULT_POINTS: Point[] = [
  {
    icon: 'zap',
    title: 'Prove your skill',
    body: 'Compete in timed assessments that score you objectively.',
  },
  {
    icon: 'shield',
    title: 'Verified signals',
    body: 'Connect GitHub and LeetCode so your profile shows real proof.',
  },
  {
    icon: 'briefcase',
    title: 'Get hired on campus',
    body: 'Companies hiring tier-2/3 engineers shortlist from here.',
  },
]

export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  asideHeadline = 'Build proof of skill. Get hired.',
  asideSub = 'ConnectToCampus is where Indian CS students show verified ability — and where companies hire from.',
  points = DEFAULT_POINTS,
  disclaimer = 'ConnectToCampus is an independent student platform, not affiliated with any institution.',
  children,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  asideHeadline?: string
  asideSub?: string
  points?: Point[]
  disclaimer?: string
  children: React.ReactNode
}) {
  return (
    <div className="au-page" data-accent="gold">
      {/* ── Brand panel ── */}
      <aside className="au-aside">
        <div className="au-brand">
          <BrandName />
        </div>

        <div>
          <h1 className="au-aside-h">{asideHeadline}</h1>
          <p className="au-aside-sub">{asideSub}</p>
          <ul className="au-points">
            {points.map((p) => (
              <li className="au-point" key={p.title}>
                <span className="au-point-ic">
                  <Icon name={p.icon} size={17} />
                </span>
                <span className="au-point-body">
                  <strong>{p.title}</strong>
                  <span>{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="au-aside-foot">© {new Date().getFullYear()} ConnectToCampus</p>
      </aside>

      {/* ── Form column ── */}
      <main className="au-main">
        <div className="au-stack">
          <div className="au-card au-rise">
            {eyebrow && <span className="au-eyebrow">{eyebrow}</span>}
            <h2 className="au-title">{title}</h2>
            {subtitle && <p className="au-subtitle">{subtitle}</p>}
            {children}
          </div>
          <p className="au-below" style={{ marginTop: 20 }}>
            {disclaimer}
          </p>
        </div>
        <div className="au-theme">
          <ThemeToggle mode="floating" />
        </div>
      </main>
    </div>
  )
}
