// Shared mobile navigation definitions — used by the app shell (Layout) and
// the standalone pages (profile etc.) so every screen has the same bottom bar
// and the same ☰ menu items. Change items here = changes everywhere.
//
// FINAL IA: exactly three primary destinations in the bottom bar —
//   Global | Community | Profile
// (The Home feed, Discovery and Library sections were removed.) Everything
// else (Chat, Compete, Leaderboard, Blogs, Events, Connections, Talent) is
// secondary and lives inside these three sections: Chat/Connections inside
// Profile, Compete/Leaderboard/Confessions inside Community, and Live Voice
// under Global (it is NOT part of Community). Esports and Games are their own
// sections.

export const MOBILE_NAV = [
  { label: 'Global', href: '/global', icon: 'globe' },
  { label: 'Community', href: '/community', icon: 'users' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

export const MOBILE_MENU_NAV = [
  // Compete — rankings, daily challenge and the Campus Clash contest.
  { label: 'Compete', href: '/compete', icon: 'zap' },
  // Esports — the Free Fire tournament board (team join by code lives there).
  { label: 'Esports', href: '/tournaments', icon: 'trophy' },
  // Games — Typing Battle & Quick Math only (pulled out of Community).
  { label: 'Games', href: '/games', icon: 'gamepad' },
  // Secondary destinations — one ☰ tap away from any of the five tabs.
  { label: 'Leaderboard', href: '/leaderboard', icon: 'star' },
  { label: 'Chat', href: '/chat', icon: 'message' },
  { label: 'Confessions', href: '/community?view=confessions', icon: 'eyeOff' },
  { label: 'Blogs', href: '/blog', icon: 'book' },
  { label: 'Connections', href: '/connections', icon: 'link' },
  { label: 'Communities', href: '/communities', icon: 'users' },
  // Live Voice sits with Global — it is a platform-wide surface, not Community.
  { label: 'Global', href: '/global', icon: 'globe' },
  { label: 'Live Voice Chat', href: '/live-voice-chat', icon: 'mic' },
  { label: 'Events', href: '/events', icon: 'calendar' },
]

/** Guard: the bottom bar is exactly the five primary destinations. */
export const PRIMARY_TAB_HREFS = MOBILE_NAV.map((i) => i.href)
