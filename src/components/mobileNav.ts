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
//   Rooms | Experiences | Compete | Profile
// ☰ menu = the full kept-feature index.
//
// `/live-voice-chat` is a KEPT route: the LiveKit study rooms were retired
// with the social plane and then re-enabled, so they appear here.
// `/messages` is also KEPT: the student network (requests + 1:1 DMs) came
// back on its own, without the feed/communities. It lives in the ☰ menu so
// the four primary destinations keep their space on a phone.

export const MOBILE_NAV = [
  { label: 'Rooms', href: '/live-voice-chat', icon: 'mic' },
  { label: 'Experiences', href: '/experiences', icon: 'pencil' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

export const MOBILE_MENU_NAV = [
  // ── The four sections ───────────────────────────────────────
  { label: 'Live Rooms', href: '/live-voice-chat', icon: 'mic' },
  { label: 'Experiences', href: '/experiences', icon: 'pencil' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
  // ── Account ─────────────────────────────────────────────────
  { label: 'Messages', href: '/messages', icon: 'message' },
  { label: 'Notifications', href: '/notifications', icon: 'bell' },
]
