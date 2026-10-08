import RoomDiscovery from '@/components/home/RoomDiscovery'

/**
 * `/` — the default landing experience.
 *
 * No marketing homepage, no hero: the first thing a visitor sees is the rooms
 * that are live right now, a search box and the category chips. Everything is
 * driven by the existing live-voice API (see src/lib/rooms.ts and
 * src/components/home/RoomDiscovery.tsx).
 */
export default function Home() {
  return <RoomDiscovery />
}
