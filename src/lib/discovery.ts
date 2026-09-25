'use client'

/**
 * Discovery client layer — types + RPC wrappers for the swipe/match loop.
 *
 * All mutations go through SECURITY DEFINER RPCs (record_discovery_action,
 * accept_discovery_interest) that derive identity from auth.uid(), so the
 * client can never forge interests, matches, or author actions. Reads of the
 * queue go through discovery_feed (cursor-paginated, summary-only); full
 * content is fetched from the table only on the detail page (RLS-guarded).
 */

import { createClient } from '@/lib/supabase/client'

export type DiscoveryCategory = 'startup' | 'project' | 'hackathon' | 'collab'
export type DiscoveryStage = 'idea' | 'prototype' | 'mvp' | 'building' | 'launched'

export const DISCOVERY_CATEGORIES: DiscoveryCategory[] = ['startup', 'project', 'hackathon', 'collab']
export const DISCOVERY_STAGES: DiscoveryStage[] = ['idea', 'prototype', 'mvp', 'building', 'launched']
export const LOOKING_FOR_OPTIONS = [
  'Developer',
  'Designer',
  'AI/ML',
  'Marketing',
  'Co-founder',
  'Research',
  'Other',
] as const

export const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  startup: '🚀 Startup',
  project: '🛠 Project',
  hackathon: '⚡ Hackathon',
  collab: '🤝 Collaboration',
}
export const STAGE_LABELS: Record<DiscoveryStage, string> = {
  idea: 'Idea',
  prototype: 'Prototype',
  mvp: 'MVP',
  building: 'Building',
  launched: 'Launched',
}

export interface DiscoveryFeedCard {
  id: string
  title: string
  short_desc: string
  category: DiscoveryCategory
  stage: DiscoveryStage
  tags: string[]
  looking_for: string[]
  interested_count: number
  created_at: string
  author_id: string
  author_name: string | null
  author_username: string | null
  author_avatar: string | null
  my_action: string | null
}

export interface DiscoveryPost extends DiscoveryFeedCard {
  content: string | null
  updated_at: string
}

export interface DiscoveryAction {
  ok: boolean
  error?: string
  matched?: boolean
  connection_id?: string | null
  status?: string | null
}

/** One cursor-paginated batch of the swipe queue. */
export async function fetchDiscoveryFeed(opts: {
  cursorCreated?: string | null
  cursorId?: string | null
  category?: DiscoveryCategory | 'all'
  limit?: number
}): Promise<{ cards: DiscoveryFeedCard[]; error?: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('discovery_feed', {
    p_cursor_created: opts.cursorCreated ?? null,
    p_cursor_id: opts.cursorId ?? null,
    p_category: opts.category && opts.category !== 'all' ? opts.category : null,
    p_limit: opts.limit ?? 10,
  })
  if (error) return { cards: [], error: error.message }
  return { cards: (data as unknown as DiscoveryFeedCard[]) || [] }
}

export interface CreateDiscoveryInput {
  title: string
  short_desc: string
  content?: string
  category: DiscoveryCategory
  stage: DiscoveryStage
  tags?: string[]
  looking_for?: string[]
}

/** Create a post; campus/college context is denormalized server-side via RLS insert policy. */
export async function createDiscoveryPost(input: CreateDiscoveryInput): Promise<{
  ok: boolean
  error?: string
  id?: string
}> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Please sign in first.' }

  // college_id/campus_id are pulled from the caller's profile row-by-row in
  // the page component (client cannot be trusted) — see postIdea below.
  const { data: profile } = await supabase
    .from('profiles')
    .select('college_id, campus_id')
    .eq('id', auth.user.id)
    .single()

  const { data, error } = await supabase
    .from('discovery_posts')
    .insert({
      author_id: auth.user.id,
      title: input.title,
      short_desc: input.short_desc,
      content: input.content ?? null,
      category: input.category,
      stage: input.stage,
      tags: (input.tags || [])
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      looking_for: (input.looking_for || []).slice(0, 7),
      college_id: profile?.college_id ?? null,
      campus_id: profile?.campus_id ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as { id: string }).id }
}

/** Read one post (full content). RLS allows public reads of active rows. */
export async function fetchDiscoveryPost(id: string): Promise<{
  post: DiscoveryPost | null
  error?: string
}> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('discovery_posts')
    .select(
      `id, title, short_desc, content, category, stage, tags, looking_for,
       interested_count, created_at, updated_at, author_id,
       profiles!discovery_posts_author_id_fkey(full_name, username, avatar_url)`
    )
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return { post: null, error: error.message }
  if (!data) return { post: null }
  // supabase-js types the embedded profile as an array; the runtime returns an
  // object for a many-to-one embed. Normalize defensively.
  const row = data as unknown as Record<string, unknown> & {
    profiles: { full_name: string | null; username: string | null; avatar_url: string | null } | null
  }
  const prof = Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles
  return {
    post: {
      id: row.id as string,
      title: row.title as string,
      short_desc: row.short_desc as string,
      content: (row.content as string | null) ?? null,
      category: row.category as DiscoveryCategory,
      stage: row.stage as DiscoveryStage,
      tags: (row.tags as string[] | null) || [],
      looking_for: (row.looking_for as string[] | null) || [],
      interested_count: row.interested_count as number,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      author_id: row.author_id as string,
      author_name: prof?.full_name ?? null,
      author_username: prof?.username ?? null,
      author_avatar: prof?.avatar_url ?? null,
      my_action: null,
    },
  }
}

/** Owner-scoped edit (RLS enforces author_id = auth.uid()). */
export async function updateDiscoveryPost(
  id: string,
  patch: Partial<CreateDiscoveryInput>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Please sign in first.' }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) update.title = patch.title
  if (patch.short_desc !== undefined) update.short_desc = patch.short_desc
  if (patch.content !== undefined) update.content = patch.content
  if (patch.category !== undefined) update.category = patch.category
  if (patch.stage !== undefined) update.stage = patch.stage
  if (patch.tags !== undefined)
    update.tags = patch.tags
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8)
  if (patch.looking_for !== undefined) update.looking_for = patch.looking_for.slice(0, 7)

  const { error } = await supabase.from('discovery_posts').update(update).eq('id', id).eq('author_id', auth.user.id)

  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Owner-scoped soft delete (RLS enforces author_id = auth.uid()). */
export async function deleteDiscoveryPost(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Please sign in first.' }

  const { error } = await supabase
    .from('discovery_posts')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('author_id', auth.user.id)

  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Pass / Interested — the ONE action layer used by swipe, buttons and
 * keyboard (STEP 8). Idempotent server-side: repeats collapse into one row.
 */
export async function recordDiscoveryAction(postId: string, action: 'interested' | 'passed'): Promise<DiscoveryAction> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('record_discovery_action', {
    p_post_id: postId,
    p_action: action,
  })
  if (error) return { ok: false, error: error.message }
  const row = (Array.isArray(data) ? data[0] : data) as {
    matched: boolean
    connection_id: string | null
    status: string
  } | null
  return {
    ok: true,
    matched: row?.matched ?? false,
    connection_id: row?.connection_id ?? null,
    status: row?.status ?? null,
  }
}

/**
 * Author accepts an incoming interest → MATCH → accepted connection +
 * conversation via the existing chat RPC. Author-only, server-verified.
 */
export async function acceptDiscoveryInterest(
  postId: string,
  userId: string
): Promise<{ ok: boolean; error?: string; conversationId?: string | null }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('accept_discovery_interest', {
    p_post_id: postId,
    p_user_id: userId,
  })
  if (error) return { ok: false, error: error.message }
  const row = (Array.isArray(data) ? data[0] : data) as {
    matched: boolean
    connection_id: string | null
    conversation_id: string | null
  } | null
  return { ok: true, conversationId: row?.conversation_id ?? null }
}

export interface IncomingInterest {
  id: string
  post_id: string
  user_id: string
  created_at: string
  post_title: string
  user_name: string | null
  user_username: string | null
  user_avatar: string | null
}

/** Author's incoming interests (pending first) — powers the inbox + accept button. */
export async function fetchMyIncomingInterests(): Promise<{ items: IncomingInterest[]; error?: string }> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { items: [] }

  const { data, error } = await supabase
    .from('discovery_interests')
    .select(
      `id, post_id, user_id, created_at, status,
       discovery_posts!inner(title, author_id),
       profiles!discovery_interests_user_id_fkey(full_name, username, avatar_url)`
    )
    .eq('discovery_posts.author_id', auth.user.id)
    .eq('action', 'interested')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) return { items: [], error: error.message }
  return {
    items: ((data as unknown as Array<Record<string, unknown>>) || []).map((r) => {
      const post = r.discovery_posts as { title: string } | null
      const user = r.profiles as { full_name: string | null; username: string | null; avatar_url: string | null } | null
      return {
        id: r.id as string,
        post_id: r.post_id as string,
        user_id: r.user_id as string,
        created_at: r.created_at as string,
        post_title: post?.title ?? '',
        user_name: user?.full_name ?? null,
        user_username: user?.username ?? null,
        user_avatar: user?.avatar_url ?? null,
      }
    }),
  }
}
