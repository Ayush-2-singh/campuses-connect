'use client'

/**
 * DISCOVERY — find ideas worth building and people worth building with.
 *
 * Primary loop: swipe the idea queue → interested → author accepts → MATCH →
 * existing CampusConnect chat (/messages/:id). Blogs / Library / People are
 * small secondary links; those surfaces own themselves. Confessions moved to
 * Community → Confessions (backend untouched).
 *
 * PUBLIC-FIRST (spec): browsing works logged-out; the queue is readable
 * without an account. Sign-in is required at the interaction layer only —
 * swipe/interested, create, inbox.
 *
 * Steps 8/9/12/17 of the spec are enforced by the RPC layer (one action layer,
 * state persistence, cursor pagination, idempotency) — see 20261024 migration.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import ErrorBoundary from '@/components/ErrorBoundary'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useHaptic } from '@/hooks/useMobile'
import {
  fetchDiscoveryFeed,
  createDiscoveryPost,
  recordDiscoveryAction,
  acceptDiscoveryInterest,
  fetchMyIncomingInterests,
  DISCOVERY_CATEGORIES,
  DISCOVERY_STAGES,
  LOOKING_FOR_OPTIONS,
  CATEGORY_LABELS,
  STAGE_LABELS,
  type DiscoveryCategory,
  type DiscoveryStage,
  type DiscoveryFeedCard,
  type IncomingInterest,
} from '@/lib/discovery'
import SwipeDeck from '@/components/discovery/SwipeDeck'

type Tab = 'foryou' | DiscoveryCategory

// Confessions no longer live here — their entry point moved to
// Community → Confessions (the backend, anonymity and RPCs are unchanged).
const TABS: { key: Tab; label: string }[] = [
  { key: 'foryou', label: 'For You' },
  { key: 'startup', label: '🚀 Startups' },
  { key: 'project', label: '🛠 Projects' },
  { key: 'hackathon', label: '⚡ Hackathons' },
  { key: 'collab', label: '🤝 Collab' },
]

const SECONDARY_LINKS = [
  { label: 'Blogs', href: '/blog', icon: '✍️' },
  { label: 'Library', href: '/notes', icon: '📚' },
  { label: 'Top Contributors', href: '/compete?tab=rankings', icon: '🏆' },
  { label: 'People', href: '/talent', icon: '👥' },
]

const PAGE = 10

export default function DiscoverPage() {
  const supabase = createClient()
  const toast = useToast()
  const haptic = useHaptic()
  const router = useRouter()

  // ---- auth/profile: loaded ONCE, independent of tab/sort (audit fix #1) ----
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [profile, setProfile] = useState<{
    id: string
    full_name?: string
    username?: string
    avatar_url?: string
  } | null>(null)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (cancelled) return
      const u = auth.user
      setUser(u ? { id: u.id } : null)
      if (u) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .eq('id', u.id)
          .single()
        if (!cancelled) setProfile(prof)
      }
      if (!cancelled) setBooted(true)
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // ---- queue state ----
  const [tab, setTab] = useState<Tab>('foryou')

  // Deep links: /discover?tab=startup etc. (used by /opportunities redirect,
  // feed pulse cards and the command palette). Read once at boot from the URL.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab')
    const valid = TABS.some((t) => t.key === q)
    if (q && valid) setTab(q as Tab)
  }, [])
  const [cards, setCards] = useState<DiscoveryFeedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const loadingMoreRef = useRef(false)
  const loadedTabsRef = useRef<Set<string>>(new Set())

  const category: DiscoveryCategory | null = tab === 'foryou' ? null : (tab as DiscoveryCategory)

  const loadQueue = useCallback(
    async (opts: { fresh?: boolean; cursorCreated?: string | null; cursorId?: string | null } = {}) => {
      const res = await fetchDiscoveryFeed({
        category: category ?? 'all',
        limit: PAGE,
        cursorCreated: opts.cursorCreated ?? null,
        cursorId: opts.cursorId ?? null,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      setError(null)
      setCards((prev) => (opts.fresh ? res.cards : [...prev, ...res.cards]))
    },
    [category, tab]
  )

  // (Re)load when the tab changes; per-tab caching keeps swipes snappy.
  useEffect(() => {
    if (!booted) return
    if (loadedTabsRef.current.has(tab)) {
      return
    }
    loadedTabsRef.current.add(tab)
    setLoading(true)
    loadQueue({ fresh: true }).finally(() => setLoading(false))
  }, [tab, booted, user, loadQueue])

  // Prefetch the next batch when the user reaches the 7th card (STEP 12).
  useEffect(() => {
    if (cards.length === 0) return
    if (cards.length < 7 || loadingMoreRef.current) return
    const seen = new Set(cards.map((c) => c.id))
    const last = cards[cards.length - 1]
    loadingMoreRef.current = true
    fetchDiscoveryFeed({
      category: category ?? 'all',
      limit: PAGE,
      cursorCreated: last.created_at,
      cursorId: last.id,
    }).then((res) => {
      loadingMoreRef.current = false
      if (res.error) return
      const fresh = res.cards.filter((c) => !seen.has(c.id))
      if (fresh.length > 0) setCards((prev) => [...prev, ...fresh.filter((f) => !prev.some((p) => p.id === f.id))])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length])

  // ---- one action layer: swipe, buttons, keyboard all land here (STEP 8) ----
  const handleAction = useCallback(
    async (postId: string, action: 'interested' | 'passed') => {
      if (!user) {
        // Interaction gate (spec): browsing is public, acting is not — send
        // the user to sign in and return them here afterwards.
        router.push('/auth/login?redirect=' + encodeURIComponent('/discover'))
        return
      }
      if (actingId) return
      setActingId(postId)
      setBusy(true)
      if (action === 'interested') haptic.medium()

      // Optimistic: drop the card from the queue immediately.
      setCards((prev) => prev.filter((c) => c.id !== postId))

      const res = await recordDiscoveryAction(postId, action)
      setBusy(false)
      setActingId(null)
      if (!res.ok) {
        toast.show(res.error || 'Action failed', { tone: 'danger' })
        loadedTabsRef.current.delete(tab) // reload queue on next visit
        loadQueue({ fresh: true })
        return
      }
      if (action === 'interested') {
        toast.show('Interest sent — the builder will see it', { tone: 'success' })
      }
    },
    [user, actingId, toast, haptic, tab, loadQueue]
  )

  // ---- create idea (STEP 11) ----
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    short_desc: '',
    content: '',
    category: 'startup' as DiscoveryCategory,
    stage: 'idea' as DiscoveryStage,
    tagsInput: '',
    looking_for: [] as string[],
  })

  const submitIdea = async () => {
    if (creating) return
    setCreating(true)
    const res = await createDiscoveryPost({
      title: form.title.trim(),
      short_desc: form.short_desc.trim(),
      content: form.content.trim() || undefined,
      category: form.category,
      stage: form.stage,
      tags: form.tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      looking_for: form.looking_for,
    })
    setCreating(false)
    if (!res.ok) {
      toast.show(res.error || 'Could not publish', { tone: 'danger' })
      return
    }
    haptic.tap()
    toast.show('Idea published to Discovery 🎉', { tone: 'success' })
    setShowCreate(false)
    setForm({
      title: '',
      short_desc: '',
      content: '',
      category: 'startup',
      stage: 'idea',
      tagsInput: '',
      looking_for: [],
    })
    loadedTabsRef.current.clear()
    setLoading(true)
    await loadQueue({ fresh: true })
    setLoading(false)
  }

  // ---- incoming interests inbox + accept→match (STEP 10) ----
  const [inbox, setInbox] = useState<IncomingInterest[]>([])
  const [showInbox, setShowInbox] = useState(false)

  const refreshInbox = useCallback(async () => {
    if (!user) return
    const res = await fetchMyIncomingInterests()
    setInbox(res.items)
  }, [user])

  useEffect(() => {
    if (user) refreshInbox()
  }, [user, refreshInbox])

  const [matchInfo, setMatchInfo] = useState<{ conversationId: string | null; postId: string } | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)

  const acceptInterest = async (interest: IncomingInterest) => {
    if (accepting) return
    setAccepting(interest.id)
    const res = await acceptDiscoveryInterest(interest.post_id, interest.user_id)
    setAccepting(null)
    if (!res.ok) {
      toast.show(res.error || 'Could not accept', { tone: 'danger' })
      return
    }
    haptic.medium()
    setInbox((prev) => prev.filter((i) => i.id !== interest.id))
    setMatchInfo({ conversationId: res.conversationId ?? null, postId: interest.post_id })
  }

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="discover">
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 96px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Discover</h2>
            <div style={{ flex: 1 }} />
            {user && (
              <>
                <button
                  onClick={() => setShowInbox(true)}
                  aria-label="Incoming interests"
                  style={{
                    position: 'relative',
                    minHeight: 38,
                    padding: '6px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  📥 Interests
                  {inbox.length > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        minWidth: 18,
                        height: 18,
                        borderRadius: 9,
                        background: 'var(--danger)',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                      }}
                    >
                      {inbox.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  style={{
                    minHeight: 38,
                    padding: '6px 14px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  + Post an Idea
                </button>
              </>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
            Find ideas worth building and people worth building with.
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  minHeight: 36,
                  padding: '6px 13px',
                  borderRadius: 18,
                  border: tab === t.key ? 'none' : '1px solid var(--border)',
                  background: tab === t.key ? 'var(--accent)' : 'var(--bg)',
                  color: tab === t.key ? 'var(--on-accent)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Secondary links — demoted, small (STEP 3) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {SECONDARY_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '4px 10px',
                  textDecoration: 'none',
                }}
              >
                {l.icon} {l.label}
              </a>
            ))}
          </div>

          {/* Content — public-first: the queue is readable logged-out */}
          {!booted ? (
            <ListSkeleton count={2} />
          ) : loading ? (
            <ListSkeleton count={2} />
          ) : error ? (
            <EmptyState
              icon="⚠️"
              title="Could not load ideas"
              body={error}
              cta="Retry"
              onCta={() => {
                setLoading(true)
                loadQueue({ fresh: true }).finally(() => setLoading(false))
              }}
            />
          ) : (
            <>
              <SwipeDeck cards={cards} onAction={handleAction} busy={busy} />
              {cards.length === 0 && (
                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  No ideas in this tab yet — be the first to post one.
                </p>
              )}
            </>
          )}
        </div>

        {/* Create idea sheet (STEP 11) */}
        {showCreate && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Post an idea"
            onClick={() => !creating && setShowCreate(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'flex-end',
              zIndex: 60,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 720,
                margin: '0 auto',
                background: 'var(--bg)',
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
                maxHeight: '88vh',
                overflowY: 'auto',
              }}
            >
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                Post an idea
              </h3>

              <label style={labelStyle}>Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Campus Laundry — reliable laundry booking for colleges"
                maxLength={120}
                style={inputStyle}
              />

              <label style={labelStyle}>Short description</label>
              <textarea
                value={form.short_desc}
                onChange={(e) => setForm({ ...form, short_desc: e.target.value })}
                placeholder="One or two lines that sell the idea"
                rows={2}
                maxLength={280}
                style={{ ...inputStyle, resize: 'vertical' }}
              />

              <label style={labelStyle}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {DISCOVERY_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, category: c })}
                    style={chipStyle(form.category === c)}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>Stage</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {DISCOVERY_STAGES.map((s) => (
                  <button key={s} onClick={() => setForm({ ...form, stage: s })} style={chipStyle(form.stage === s)}>
                    {STAGE_LABELS[s]}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>Looking for</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {LOOKING_FOR_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setForm({
                        ...form,
                        looking_for: form.looking_for.includes(s)
                          ? form.looking_for.filter((x) => x !== s)
                          : [...form.looking_for, s],
                      })
                    }
                    style={chipStyle(form.looking_for.includes(s))}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>Tags (comma separated)</label>
              <input
                value={form.tagsInput}
                onChange={(e) => setForm({ ...form, tagsInput: e.target.value })}
                placeholder="saas, campus, ai"
                style={inputStyle}
              />

              <label style={labelStyle}>Full write-up (optional — problem, solution, target users)</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={6}
                placeholder={'## Problem\n...\n\n## Solution\n...\n\n## Target users\n...'}
                style={{ ...inputStyle, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={submitIdea}
                  disabled={creating || !form.title.trim() || form.title.trim().length < 3 || !form.short_desc.trim()}
                  style={{
                    flex: 2,
                    minHeight: 46,
                    borderRadius: 12,
                    border: 'none',
                    background:
                      creating || !form.title.trim() || form.title.trim().length < 3 || !form.short_desc.trim()
                        ? 'var(--disabled)'
                        : 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {creating ? 'Publishing…' : 'Publish'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Incoming interests inbox (STEP 10) */}
        {showInbox && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Incoming interests"
            onClick={() => setShowInbox(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'flex-end',
              zIndex: 60,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 720,
                margin: '0 auto',
                background: 'var(--bg)',
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
                maxHeight: '80vh',
                overflowY: 'auto',
              }}
            >
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                Interested in your ideas
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
                Accept someone to create a match — chat opens instantly.
              </p>

              {inbox.length === 0 ? (
                <EmptyState
                  icon="📭"
                  title="No interests yet"
                  body="When someone swipes right on your idea, they appear here."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inbox.map((i) => (
                    <div
                      key={i.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                          @{i.user_username || i.user_name || 'student'}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          likes <strong>{i.post_title}</strong>
                        </p>
                      </div>
                      <button
                        onClick={() => acceptInterest(i)}
                        disabled={accepting === i.id}
                        style={{
                          minHeight: 38,
                          padding: '6px 14px',
                          borderRadius: 10,
                          border: 'none',
                          background: accepting === i.id ? 'var(--disabled)' : 'var(--accent)',
                          color: 'var(--on-accent)',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {accepting === i.id ? '…' : '🤝 Accept'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Match modal (STEP 10) */}
        {matchInfo && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="It's a match"
            onClick={() => setMatchInfo(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 70,
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 380,
                background: 'var(--bg)',
                borderRadius: 20,
                padding: 24,
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: 44, margin: 0 }}>🎉</p>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '10px 0 4px' }}>
                It&apos;s a Match!
              </h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 18px' }}>
                You both want to build together. Chat is open.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => {
                    const conv = matchInfo.conversationId
                    const postId = matchInfo.postId
                    setMatchInfo(null)
                    if (conv) router.push(`/messages/${conv}`)
                    else router.push(`/discover/${postId}`)
                  }}
                  style={{
                    minHeight: 46,
                    borderRadius: 12,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Start Chat
                </button>
                <button
                  onClick={() => setMatchInfo(null)}
                  style={{
                    minHeight: 46,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Keep Swiping
                </button>
              </div>
            </div>
          </div>
        )}
      </ErrorBoundary>
    </Layout>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-muted)',
  margin: '12px 0 5px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--bg)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  minHeight: 34,
  padding: '5px 12px',
  borderRadius: 17,
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent-light)' : 'var(--bg)',
  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
})
