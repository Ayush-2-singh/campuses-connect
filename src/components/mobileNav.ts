// Shared mobile navigation definitions — used by the app shell (Layout) and
// the standalone pages (profile etc.) so every screen has the same 4-tab
// bottom bar and the same ☰ menu items. Change items here = changes everywhere.

export const MOBILE_NAV = [
  { label: 'Home', href: '/feed', icon: 'home' },
  { label: 'Classroom', href: '/college', icon: 'book' },
  { label: 'Events', href: '/events', icon: 'calendar' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
]

export const MOBILE_MENU_NAV = [
  { label: 'Global', href: '/global', icon: 'globe' },
  { label: 'Connections', href: '/connections', icon: 'link' },
  { label: 'Opportunities', href: '/opportunities', icon: 'briefcase' },
  { label: 'Notes', href: '/notes', icon: 'notebook' },
  { label: 'Talent', href: '/talent', icon: 'star' },
  { label: 'Communities', href: '/communities', icon: 'users' },
  { label: 'More', href: '/more', icon: 'more' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]
