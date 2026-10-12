// Shared mobile navigation definitions — used by the app shell (Layout) and
// the standalone pages (profile etc.) so every screen has the same bottom bar
// and the same ☰ menu items. Change items here = changes everywhere.
//
// V4 IA (campus-hiring pivot): the product is the layer that connects
// companies to campuses. The social plane (feed, communities, chat, voice,
// games) is retired — those routes redirect via src/lib/featureGates.ts, so
// nothing here may point at them.
//
// Bottom bar (four primary destinations):
//   Jobs | Talent | Compete | Profile
// ☰ menu = the full kept-feature index.

export const MOBILE_NAV = [
  { label: 'Jobs', href: '/jobs', icon: 'building' },
  { label: 'Talent', href: '/talent', icon: 'star' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

export const MOBILE_MENU_NAV = [
  // ── Hiring loop ─────────────────────────────────────────────
  { label: 'Jobs', href: '/jobs', icon: 'building' },
  { label: 'Companies', href: '/companies', icon: 'building' },
  { label: 'Applications', href: '/applications', icon: 'bookmark' },
  { label: 'Interview Experiences', href: '/experiences', icon: 'pencil' },
  { label: 'Talent', href: '/talent', icon: 'star' },
  // ── Skill & readiness ───────────────────────────────────────
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'Leaderboard', href: '/leaderboard', icon: 'trophy' },
  { label: 'AI Coach', href: '/brain', icon: 'sparkles' },
  { label: 'Integrations', href: '/integrations', icon: 'link' },
  // ── Account ─────────────────────────────────────────────────
  { label: 'Blog', href: '/blog', icon: 'pencil' },
  { label: 'Reminders', href: '/reminders', icon: 'clock' },
  { label: 'Notifications', href: '/notifications', icon: 'bell' },
  { label: 'Premium', href: '/premium', icon: 'sparkles' },
]
