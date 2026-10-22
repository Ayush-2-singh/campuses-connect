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
//   Jobs | Rooms | Compete | Profile
// ☰ menu = the full kept-feature index.
//
// `/live-voice-chat` is a KEPT route: the LiveKit study rooms were retired
// with the social plane and then re-enabled, so they appear here.

export const MOBILE_NAV = [
  { label: 'Jobs', href: '/jobs', icon: 'building' },
  { label: 'Rooms', href: '/live-voice-chat', icon: 'mic' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

export const MOBILE_MENU_NAV = [
  // ── Hiring loop ─────────────────────────────────────────────
  { label: 'Colleges', href: '/colleges', icon: 'school' },
  { label: 'Jobs', href: '/jobs', icon: 'building' },
  { label: 'Companies', href: '/companies', icon: 'building' },
  { label: 'Applications', href: '/applications', icon: 'bookmark' },
  { label: 'Interview Experiences', href: '/experiences', icon: 'pencil' },
  // ── Skill & readiness ───────────────────────────────────────
  { label: 'Live Rooms', href: '/live-voice-chat', icon: 'mic' },
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
