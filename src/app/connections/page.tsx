import { redirect } from 'next/navigation'

/**
 * `/connections` — old bookmark, new home.
 *
 * The network lives at `/messages` now: chats, requests and connections share
 * one screen, so a second page would only split the same three lists. Old
 * links from notifications and the changelog still use `?tab=received`, which
 * maps onto the hub's Requests tab instead of dead-ending.
 */

const TAB_MAP: Record<string, string> = {
  chats: 'chats',
  messages: 'chats',
  connections: 'connections',
  received: 'requests',
  requests: 'requests',
  sent: 'sent',
  find: 'find',
  people: 'find',
  discover: 'find',
}

export default async function ConnectionsRedirect({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  redirect(`/messages?tab=${TAB_MAP[tab || ''] || 'chats'}`)
}
