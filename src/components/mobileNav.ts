// Shared mobile navigation definitions — used by the app shell (Layout) and
// the standalone pages (profile etc.) so every screen has the same bottom bar
// and the same ☰ menu items. Change items here = changes everywhere.
//
// FINAL IA: exactly four primary destinations in the bottom bar —
//   Global | Community | Games | Profile
// (The Home feed, Discovery and Library sections were removed.) Everything
// else (Chat, Compete, Leaderboard, Blogs, Connections, Talent) is secondary
// and lives inside these sections: Chat/Connections inside Profile,
// Compete/Leaderboard/Confessions inside Community, and Live Voice under
// Global (it is NOT part of Community). Games is its own top-level tab and
// hub (/games) — Typing Battle and Quick Math.

export const MOBILE_NAV = [
  { label: 'Global', href: '/global', icon: 'globe' },
  { label: 'Community', href: '/community', icon: 'users' },
  { label: 'Games', href: '/games', icon: 'gamepad' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

export const MOBILE_MENU_NAV = [
  // Compete — rankings, daily challenge and the Campus Clash contest.
  { label: 'Compete', href: '/compete', icon: 'zap' },
  // Games also lives in the bottom bar; it stays here so the ☰ menu is a
  // complete feature index for anyone who reaches it from a secondary page.
  { label: 'Games', href: '/games', icon: 'gamepad' },
  // Watch — the Netflix-style video wall (official YouTube embeds, free to stream).
  { label: 'Videos', href: '/watch', icon: 'video' },
  // Secondary destinations — one ☰ tap away from any of the primary tabs.
  { label: 'Leaderboard', href: '/leaderboard', icon: 'star' },
  { label: 'Chat', href: '/chat', icon: 'message' },
  { label: 'Confessions', href: '/community?view=confessions', icon: 'eyeOff' },
  { label: 'Blogs', href: '/blog', icon: 'book' },
  { label: 'Connections', href: '/connections', icon: 'link' },
  { label: 'Communities', href: '/communities', icon: 'users' },
  // Live Voice sits with Global — it is a platform-wide surface, not Community.
  { label: 'Global', href: '/global', icon: 'globe' },
  { label: 'Live Voice Chat', href: '/live-voice-chat', icon: 'mic' },
]
