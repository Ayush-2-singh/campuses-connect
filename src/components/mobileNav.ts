// Shared mobile navigation definitions — used by the app shell (Layout) and
// the standalone pages (profile etc.) so every screen has the same bottom bar
// and the same ☰ menu items. Change items here = changes everywhere.
//
// Live Chat is now the second bottom tab: it is a core surface (global rooms
// for every student, not a college-scoped one), so it belongs in the thumb
// reach of the primary bar rather than behind the ☰ menu.
//
// Classroom gave up that slot and moved into the ☰ menu directly below — it is
// still one tap away, so nothing became unreachable.

export const MOBILE_NAV = [
  { label: 'Home', href: '/feed', icon: 'home' },
  { label: 'Chat', href: '/chat', icon: 'message' },
  { label: 'Library', href: '/notes', icon: 'notebook' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'More', href: '/more', icon: 'more' },
]

export const MOBILE_MENU_NAV = [
  // Discovery is a first-class section, but the bottom bar already spends its
  // five thumbs-reach slots on the core loop, so it sits at the top of the
  // menu — one tap, and directly under the bar that opens it.
  { label: 'Discover', href: '/discover', icon: 'flame' },
  { label: 'Classroom', href: '/college', icon: 'book' },
  { label: 'Global', href: '/global', icon: 'globe' },
  { label: 'Blog', href: '/blog', icon: 'notebook' },
  { label: 'Events', href: '/events', icon: 'calendar' },
  { label: 'Connections', href: '/connections', icon: 'link' },
  { label: 'Talent', href: '/talent', icon: 'star' },
  { label: 'Communities', href: '/communities', icon: 'users' },
  { label: 'Live Voice Chat', href: '/live-voice-chat', icon: 'mic' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]
