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

// Only what the product actually ships: published interview write-ups, live
// study rooms, and server-scored practice. No hiring/shortlist promise — the
// recruiter storefront is not live, so claiming "companies hire from here" was
// a promise the site could not keep.
const DEFAULT_POINTS: Point[] = [
  {
    icon: 'notebook',
    title: 'Real interview rounds',
    body: 'Drives written round by round by the students who cleared them.',
  },
  {
    icon: 'mic',
    title: 'Study rooms',
    body: 'Open a live room and prepare out loud with your batch.',
  },
  {
    icon: 'zap',
    title: 'Timed practice',
    body: 'Compete on the questions those rounds asked, scored on the server.',
  },
]

export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  asideHeadline = 'Read the rounds. Practise them.',
  asideSub = 'Interview experiences from Indian campuses, live study rooms, and timed practice — free for CSE & ECE students.',
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
