// ═══════════════════════════════════════════════════════════════════════════
// ROOMS — the taxonomy behind the room-discovery landing experience.
//
// The product hierarchy is ROOMS → CATEGORY → ROOM TYPE → LIVE ROOM → VOICE.
//
//   Categories (Games / Learn / Language / Discuss / Build) are the only
//   top-level filter. Every ROOM TYPE lives inside a category, and every LIVE
//   room is a real `live_voice_chat_groups` row filed under one of the five
//   `section` values the database accepts. Adding a category, a room type or
//   a whole new activity is a DATA change here — the homepage never needs a
//   redesign, and the server never needs a schema change.
//
// Nothing in this module talks to the network: it is pure mapping + selection
// so the homepage can be tested without a database.
// ═══════════════════════════════════════════════════════════════════════════

export type RoomCategoryId = 'games' | 'learn' | 'language' | 'discuss' | 'build'

/** 'all' is the default filter — chosen without any extra state. */
export type RoomFilter = RoomCategoryId | 'all'

export interface RoomType {
  id: string
  label: string
  /** Name from the shared SVG Icon set — the UI never renders an emoji. */
  icon: string
  description: string
}

export interface RoomCategory {
  id: RoomCategoryId
  label: string
  icon: string
  blurb: string
  types: RoomType[]
}

/**
 * The catalog. Order matters: it is the order of the filter chips and the
 * order category counts are reported in. Each category's `types` are the
 * activities we can offer today and the ones we will add tomorrow.
 */
export const ROOM_CATEGORIES: RoomCategory[] = [
  {
    id: 'games',
    label: 'Games',
    icon: 'gamepad',
    blurb: 'Play together in voice',
    types: [
      { id: 'truth-dare', label: 'Truth & Dare', icon: 'mask', description: 'Casual voice game for students' },
      { id: 'quiz', label: 'Quiz Night', icon: 'target', description: 'Rapid-fire trivia with friends' },
      { id: 'multiplayer', label: 'Multiplayer Games', icon: 'gamepad', description: 'Squad up and play in voice' },
      { id: 'quick-games', label: 'Quick Games', icon: 'zap', description: 'Short rounds — drop in anytime' },
      { id: 'social-games', label: 'Social Games', icon: 'users', description: 'Icebreakers and party games' },
    ],
  },
  {
    id: 'learn',
    label: 'Learn',
    icon: 'book',
    blurb: 'Study out loud',
    types: [
      { id: 'dsa', label: 'DSA Problem Solving', icon: 'layers', description: 'Solve and discuss DSA problems' },
      { id: 'web-dev', label: 'Web Development', icon: 'code', description: 'Frontend and backend talk' },
      { id: 'interview', label: 'Interview Preparation', icon: 'target', description: 'Mock interviews and prep' },
      { id: 'study', label: 'Study Rooms', icon: 'book', description: 'Co-study with voice check-ins' },
      { id: 'problem-solving', label: 'Problem Solving', icon: 'sparkles', description: 'Bring a hard problem' },
    ],
  },
  {
    id: 'language',
    label: 'Language',
    icon: 'type',
    blurb: 'Practise speaking',
    types: [
      { id: 'english', label: 'English Practice', icon: 'type', description: 'Speak English with peers' },
      { id: 'hindi', label: 'Hindi', icon: 'message', description: 'Hindi conversation practice' },
      { id: 'spanish', label: 'Spanish', icon: 'globe', description: 'Beginner Spanish speaking' },
      { id: 'speaking', label: 'Speaking Practice', icon: 'mic', description: 'Build fluency and confidence' },
    ],
  },
  {
    id: 'discuss',
    label: 'Discuss',
    icon: 'message',
    blurb: 'Talk it out',
    types: [
      {
        id: 'tech-discussion',
        label: 'Tech Discussions',
        icon: 'code',
        description: 'Talk about what you are building',
      },
      {
        id: 'college-discussion',
        label: 'College Discussions',
        icon: 'school',
        description: 'Campus life, courses, exams',
      },
      {
        id: 'startup-discussion',
        label: 'Startup Discussions',
        icon: 'rocket',
        description: 'Ideas, founders, funding',
      },
      { id: 'open-discussion', label: 'Open Discussions', icon: 'message', description: 'Anything on your mind' },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    icon: 'rocket',
    blurb: 'Ship something together',
    types: [
      { id: 'project-rooms', label: 'Project Rooms', icon: 'wrench', description: 'Find collaborators for a project' },
      { id: 'hackathon', label: 'Hackathon Teams', icon: 'zap', description: 'Assemble a hackathon squad' },
      { id: 'find-teammates', label: 'Find Teammates', icon: 'users', description: 'Match with builders' },
      { id: 'startup', label: 'Startup Rooms', icon: 'rocket', description: 'Work a startup idea in voice' },
    ],
  },
]

export const ROOM_CATEGORY_IDS: RoomCategoryId[] = ROOM_CATEGORIES.map((c) => c.id)

/**
 * Which `live_voice_chat_groups.section` values feed each category. Kept in
 * sync with the CHECK constraint in 20260920_live_voice_chat.sql; a section
 * may feed more than one category (web-dev is both Learn and Build), so the
 * FIRST category in catalog order wins when labelling a single card.
 */
export const CATEGORY_SECTIONS: Record<RoomCategoryId, string[]> = {
  games: ['random'],
  learn: ['dsa', 'web-dev'],
  language: ['english'],
  discuss: ['discussion'],
  build: ['web-dev'],
}

/** Human labels for the DB sections (used when a group has no description). */
export const SECTION_LABEL: Record<string, string> = {
  dsa: 'DSA',
  discussion: 'Discussion',
  'web-dev': 'Web Dev',
  english: 'English',
  random: 'Random',
}

/**
 * Voice rooms have no hard cap in the database, so capacity is a documented
 * product default rather than invented real-time state. If the API grows a
 * real `max_participants`, `roomsFromGroups` should read it and this constant
 * becomes the fallback.
 */
export const DEFAULT_ROOM_CAPACITY = 8

/** The subset of a `live_voice_chat_groups` row the homepage depends on. */
export interface VoiceGroupRow {
  id: string
  name: string
  description?: string | null
  icon?: string | null
  section?: string | null
  scope?: string | null
  is_private?: boolean | null
}

export type RoomStatus = 'live' | 'open' | 'seed'

export interface DiscoverRoom {
  /** `groupId` for real rooms, `seed:<typeId>` for catalog suggestions. */
  id: string
  name: string
  categoryId: RoomCategoryId
  categoryLabel: string
  icon: string
  description: string
  status: RoomStatus
  participantCount: number
  capacity: number
  isPrivate: boolean
  scope: string | null
  section: string | null
  /** Where the Join button goes. */
  href: string
}

export interface DiscoveryView {
  /** Real rooms with people inside right now, busiest first. */
  active: DiscoverRoom[]
  /** Real rooms that exist but have nobody in the call yet. */
  open: DiscoverRoom[]
  /** Catalog room types offered when nothing matches — never claimed LIVE. */
  seeds: DiscoverRoom[]
  /** Total participants across every live room (unfiltered). */
  onlineNow: number
  /** Busiest live rooms, for the right rail. */
  popular: DiscoverRoom[]
  /** Rooms matching the current search, per filter — powers the chip counts. */
  counts: Record<RoomFilter, number>
}

export function categoryMeta(id: RoomCategoryId): RoomCategory {
  return ROOM_CATEGORIES.find((c) => c.id === id) || ROOM_CATEGORIES[0]
}

export function categoryLabel(id: RoomCategoryId): string {
  return categoryMeta(id).label
}

/** The category a room's DB section belongs to (catalog order wins). */
export function categoryForSection(section?: string | null): RoomCategoryId {
  const s = (section || 'random').trim()
  const hit = ROOM_CATEGORIES.find((c) => CATEGORY_SECTIONS[c.id].includes(s))
  return hit ? hit.id : 'games'
}

/** All room types across the catalog — the flat "what can exist" list. */
export function allRoomTypes(): (RoomType & { categoryId: RoomCategoryId })[] {
  return ROOM_CATEGORIES.flatMap((c) => c.types.map((t) => ({ ...t, categoryId: c.id })))
}

/**
 * Real rooms from the DB. A room is LIVE only when the shared live-voice read
 * path reports at least one participant inside it right now — we never infer
 * liveness from the mere existence of a group.
 */
export function roomsFromGroups(groups: VoiceGroupRow[], liveByGroup: Record<string, number>): DiscoverRoom[] {
  return groups.map((g) => {
    const participants = Math.max(0, Number(liveByGroup[g.id] || 0))
    const categoryId = categoryForSection(g.section)
    return {
      id: g.id,
      name: g.name,
      categoryId,
      categoryLabel: categoryLabel(categoryId),
      icon: g.icon || 'mic',
      description: g.description?.trim() || SECTION_LABEL[(g.section || '').trim()] || 'Voice room',
      status: participants > 0 ? 'live' : 'open',
      participantCount: participants,
      capacity: DEFAULT_ROOM_CAPACITY,
      isPrivate: !!g.is_private,
      scope: g.scope ?? null,
      section: g.section ?? null,
      href: `/live-voice-chat/${g.id}`,
    }
  })
}

/** Catalog room types as startable suggestions — never marked live. */
export function catalogSeedRooms(categories: RoomCategoryId[] = ROOM_CATEGORY_IDS): DiscoverRoom[] {
  return ROOM_CATEGORIES.filter((c) => categories.includes(c.id)).flatMap((c) =>
    c.types.map((t) => ({
      id: `seed:${t.id}`,
      name: t.label,
      categoryId: c.id,
      categoryLabel: c.label,
      icon: t.icon,
      description: t.description,
      status: 'seed' as const,
      participantCount: 0,
      capacity: DEFAULT_ROOM_CAPACITY,
      isPrivate: false,
      scope: null,
      section: null,
      href: '/live-voice-chat',
    }))
  )
}

export function matchesSearch(room: DiscoverRoom, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    room.name.toLowerCase().includes(q) ||
    room.description.toLowerCase().includes(q) ||
    room.categoryLabel.toLowerCase().includes(q)
  )
}

export function inCategory(room: DiscoverRoom, filter: RoomFilter): boolean {
  return filter === 'all' || room.categoryId === filter
}

/**
 * The single selection function the homepage renders from: real rooms split
 * into live / open, a filtered seed list, plus the rail totals and chip counts.
 * Search applies to everything; the category filter applies to the room lists.
 */
export function buildDiscovery(opts: {
  groups: VoiceGroupRow[]
  liveByGroup: Record<string, number>
  filter: RoomFilter
  query: string
}): DiscoveryView {
  const { groups, liveByGroup, filter, query } = opts
  const rooms = roomsFromGroups(groups, liveByGroup)

  const searched = rooms.filter((r) => matchesSearch(r, query))
  const visible = searched.filter((r) => inCategory(r, filter))

  const byParticipants = (a: DiscoverRoom, b: DiscoverRoom) =>
    b.participantCount - a.participantCount || a.name.localeCompare(b.name)

  const active = visible.filter((r) => r.status === 'live').sort(byParticipants)
  const open = visible.filter((r) => r.status === 'open').sort((a, b) => a.name.localeCompare(b.name))

  // A room type is not suggested when a real room in that category already
  // carries its name — suggestions are for what does NOT exist yet.
  const existingNames = new Set(visible.map((r) => r.name.trim().toLowerCase()))
  const seedCategories: RoomCategoryId[] = filter === 'all' ? ROOM_CATEGORY_IDS : [filter]
  const seeds = catalogSeedRooms(seedCategories).filter((s) => !existingNames.has(s.name.trim().toLowerCase()))

  const counts = {} as Record<RoomFilter, number>
  counts.all = searched.length
  for (const id of ROOM_CATEGORY_IDS) counts[id] = searched.filter((r) => r.categoryId === id).length

  return {
    active,
    open: filter === 'all' ? open : open,
    seeds,
    onlineNow: rooms.reduce((sum, r) => sum + r.participantCount, 0),
    popular: rooms
      .filter((r) => r.status === 'live')
      .sort(byParticipants)
      .slice(0, 4),
    counts,
  }
}
