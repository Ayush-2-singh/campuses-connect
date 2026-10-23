import Link from 'next/link'
import BrandName from '@/components/BrandName'

/**
 * PublicFooter — the ONE footer for every unauthenticated page.
 *
 * Pairs with PublicNav: the landing, the college directory and the college
 * pages share one header and one footer, so a visitor never sees a different
 * frame depending on which public page they landed on. Uses the same `hl-*`
 * classes (and therefore the same tokens) as the rest of the public plane.
 */
export default function PublicFooter() {
  return (
    <footer className="hl-footer">
      <div className="hl-wrap hl-footer-grid">
        <div className="hl-footer-brand">
          <BrandName className="hl-brand-name" />
          <p className="hl-footer-tag">Placement information, written by the students who went through it.</p>
        </div>

        {/* The four sections, then the platform pages. Leaderboard, AI coach and
            the blog index are not offered as destinations of their own. */}
        <div className="hl-footer-cols">
          <div className="hl-footer-col">
            <p className="hl-footer-col-title">Sections</p>
            <Link href="/live-voice-chat">Rooms</Link>
            <Link href="/experiences">Experiences</Link>
            <Link href="/compete">Compete</Link>
            <Link href="/profile">Profile</Link>
          </div>
          <div className="hl-footer-col">
            <p className="hl-footer-col-title">Platform</p>
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </div>

      <div className="hl-wrap hl-footer-bottom">
        <p className="hl-footer-legal">© {new Date().getFullYear()} ConnectToCampus</p>
      </div>
    </footer>
  )
}
