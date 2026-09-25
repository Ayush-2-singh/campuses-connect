// Shared mobile navigation definitions — used by the app shell (Layout) and
// the standalone pages (profile etc.) so every screen has the same bottom bar
// and the same ☰ menu items. Change items here = changes everywhere.
//
// FINAL IA (spec): exactly five primary destinations in the bottom bar —
//   Home | Discovery | Community | Library | Profile
// Everything else (Chat, Compete, Leaderboard, Blogs, Events, Connections,
// Talent, Live Voice) is secondary and lives inside these five sections:
// Chat/Connections inside Profile, Compete/Leaderboard/Live Voice/Confessions
// inside Community, Blogs inside Discovery, Classroom/Global inside Home & menu.

export const MOBILE_NAV = [
  { label: 'Home', href: '/feed', icon: 'home' },
  { label: 'Discovery', href: '/discover', icon: 'flame' },
  { label: 'Community', href: '/community', icon: 'users' },
  { label: 'Library', href: '/notes', icon: 'notebook' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

export const MOBILE_MENU_NAV = [
  // Secondary destinations — one ☰ tap away from any of the five tabs.
  { label: 'Chat', href: '/chat', icon: 'message' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'Leaderboard', href: '/leaderboard', icon: 'star' },
  { label: 'Blogs', href: '/blog', icon: 'book' },
  { label: 'Connections', href: '/connections', icon: 'link' },
  { label: 'Communities', href: '/communities', icon: 'users' },
  { label: 'Live Voice Chat', href: '/live-voice-chat', icon: 'mic' },
  { label: 'Classroom', href: '/college', icon: 'grad' },
  { label: 'Global', href: '/global', icon: 'globe' },
  { label: 'Events', href: '/events', icon: 'calendar' },
]

/** Guard: the bottom bar is exactly the five primary destinations. */
export const PRIMARY_TAB_HREFS = MOBILE_NAV.map((i) => i.href)
