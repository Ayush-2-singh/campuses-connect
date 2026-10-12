import Link from 'next/link'

/**
 * LegalPage — the shared frame for every policy document.
 *
 * The policy pages previously re-declared the same five inline `style` objects
 * and the same header/footer markup. This owns the chrome (back link, title,
 * "last updated", prose wrapper and the cross-link footer) so each policy is
 * just its content — and every policy links to the others.
 *
 * Styling lives in src/app/legal.css (§ Legal pages).
 */

const DOCS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/cookies', label: 'Cookie Policy' },
  { href: '/refund', label: 'Refund & Cancellation' },
]

export default function LegalPage({
  title,
  updated,
  lede,
  children,
}: {
  title: string
  /** Human-readable "last updated" date, e.g. "October 13, 2026". */
  updated: string
  /** Optional one-paragraph summary shown under the title. */
  lede?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="legal-page" data-accent="gold">
      <div className="legal-wrap">
        <Link className="legal-back" href="/">
          ← Back to ConnectToCampus
        </Link>

        <h1 className="legal-h1">{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        {lede && <p className="legal-lede">{lede}</p>}

        <div className="legal-prose">{children}</div>

        <footer className="legal-footer">
          <nav className="legal-footer-links" aria-label="Policies">
            {DOCS.map((d) => (
              <Link key={d.href} href={d.href}>
                {d.label}
              </Link>
            ))}
          </nav>
          <p className="legal-footer-brand">
            <Link href="/">ConnectToCampus</Link> · Connecting campuses and companies
          </p>
        </footer>
      </div>
    </div>
  )
}
