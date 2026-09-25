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
import Image from 'next/image'
import { createClient, getBootUser } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import ErrorBoundary from '@/components/ErrorBoundary'
import EmptyState from '@/components/EmptyState'
import { Icon } from '@/components/icons'
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
import DiscoverBoard from '@/components/discovery/DiscoverBoard'
import DiscoveryBlogs from '@/components/discovery/DiscoveryBlogs'
import DiscoveryPeople from '@/components/discovery/DiscoveryPeople'

type Tab = 'foryou' | DiscoveryCategory | 'blogs' | 'people'

// Blogs and People surface the EXISTING blog/talent systems inside Discovery
// (spec §6/§9/§17). Confessions moved to Community → Confessions (backend
// unchanged). Category tabs filter the swipe queue; blogs/people render
// their own linked surfaces.
const TABS: { key: Tab; label: string }[] = [
  { key: 'foryou', label: 'For You' },
  { key: 'startup', label: '🚀 Startups' },
  { key: 'project', label: '🛠 Projects' },
  { key: 'hackathon', label: '⚡ Hackathons' },
  { key: 'collab', label: '🤝 Collab' },
  { key: 'blogs', label: '✍️ Blogs' },
  { key: 'people', label: '👥 People' },
]

const PAGE = 10

/* Card token shared with the homepage design system */
const CARD = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
} as const

// HUB — the Discovery landing cards (spec): every card leads to a real,
// existing feature. No placeholders, no duplicates. Cards mirror the
// Community hub: colored icon tile + title + desc + chevron.
const HUB_ITEMS: {
  key: Tab
  title: string
  desc: string
  icon: string
  accent: string
  accentText: string
}[] = [
  {
    key: 'foryou',
    title: 'For You',
    desc: 'Personalized ideas, projects and builders worth discovering',
    icon: '🚀',
    accent: 'var(--accent-light)',
    accentText: 'var(--accent-text)',
  },
  {
    key: 'startup',
    title: 'Startups & Ideas',
    desc: 'Discover startup ideas and concepts worth building',
    icon: '💡',
    accent: 'var(--orange-light)',
    accentText: 'var(--orange-text)',
  },
  {
    key: 'project',
    title: 'Projects',
    desc: 'Discover projects and the people building them',
    icon: '🛠',
    accent: 'var(--blue-light)',
    accentText: 'var(--blue-text)',
  },
  {
    key: 'hackathon',
    title: 'Hackathons',
    desc: 'Discover hackathons, competitions and upcoming opportunities',
    icon: '⚡',
    accent: 'var(--success-light)',
    accentText: 'var(--success-text)',
  },
  {
    key: 'collab',
    title: 'Collaboration',
    desc: 'Find builders and projects looking for collaborators',
    icon: '🤝',
    accent: 'var(--purple-light)',
    accentText: 'var(--purple-text)',
  },
  {
    key: 'blogs',
    title: 'Developer Blogs',
    desc: 'Read what students are building, learning and sharing',
    icon: '✍️',
    accent: 'var(--yellow-light)',
    accentText: 'var(--yellow-text)',
  },
  {
    key: 'people',
    title: 'People & Builders',
    desc: 'Discover students, developers and builders',
    icon: '👥',
    accent: 'var(--cyan-light)',
    accentText: 'var(--cyan-text)',
  },
]

export default function DiscoverPage() {
  const supabase = createClient()
  const toast = useToast()
  const haptic = useHaptic()
  const router = useRouter()

  // ---- auth/profile: loaded ONCE, independent of tab/sort (audit fix #1) ----
  // SPEED: getBootUser() serves the local session instantly (no network
  // round-trip before first render); validation continues in the background.
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
      const u = await getBootUser(supabase)
      if (cancelled) return
      setUser(u ? { id: u.id } : null)
      setBooted(true)
      if (u) {
        // Profile is not needed for the first paint — fetch it after the
        // user is set so the header/actions render immediately.
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .eq('id', u.id)
          .single()
        if (!cancelled) setProfile(prof)
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // ---- queue state ----
  const [tab, setTab] = useState<Tab>('foryou')
  // Discovery opens as a HUB first (like Community); ?tab= deep links land
  // straight in the deck experience.
  const [view, setView] = useState<'hub' | 'deck'>('hub')

  const [cards, setCards] = useState<DiscoveryFeedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const loadingMoreRef = useRef(false)
  const loadedTabsRef = useRef<Set<string>>(new Set())
  // Last-request-wins guard: parallel prefetches (mount, hub card preload,
  // tab switch) may resolve out of order — only the most recent one may
  // write into the cards queue.
  const reqTabRef = useRef<string>('foryou')

  // Deep links: /discover?tab=startup etc. (used by /opportunities redirect,
  // feed pulse cards and the command palette). Reactive: clicking a sidebar
  // Discovery child while ALREADY on /discover only changes the query (no
  // remount), so also listen for the shell's soft-navigate event.
  useEffect(() => {
    const applyFromUrl = () => {
      const q = new URLSearchParams(window.location.search).get('tab')
      const valid = TABS.some((t) => t.key === q)
      if (q && valid) {
        setTab(q as Tab)
        setView('deck')
      }
    }
    const onSoft = (e: Event) => {
      const href = (e as CustomEvent<{ href: string }>).detail?.href || ''
      const q = new URLSearchParams(href.split('?')[1] || '').get('tab')
      const valid = TABS.some((t) => t.key === q)
      if (q && valid) {
        setTab(q as Tab)
        setView('deck')
        window.scrollTo({ top: 0 })
      }
    }
    applyFromUrl()
    window.addEventListener('popstate', applyFromUrl)
    window.addEventListener('cc-soft-navigate', onSoft)
    return () => {
      window.removeEventListener('popstate', applyFromUrl)
      window.removeEventListener('cc-soft-navigate', onSoft)
    }
  }, [])

  // SPEED: fire the For You fetch IMMEDIATELY on mount, in parallel with
  // auth — previously it waited for the auth round-trip to finish first.
  useEffect(() => {
    loadedTabsRef.current.add('foryou')
    reqTabRef.current = 'foryou'
    fetchDiscoveryFeed({ category: 'all', limit: PAGE, cursorCreated: null, cursorId: null })
      .then((res) => {
        if (reqTabRef.current !== 'foryou') return
        if (res.error) {
          setError(res.error)
          return
        }
        setError(null)
        setCards(res.cards)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Blogs/People tabs are linked surfaces, not swipe-queue filters.
  const isQueueTab = tab !== 'blogs' && tab !== 'people'
  const category: DiscoveryCategory | null = !isQueueTab || tab === 'foryou' ? null : (tab as DiscoveryCategory)

  const loadQueue = useCallback(
    async (opts: { fresh?: boolean; cursorCreated?: string | null; cursorId?: string | null } = {}) => {
      const key = category ?? 'foryou'
      reqTabRef.current = key
      const res = await fetchDiscoveryFeed({
        category: category ?? 'all',
        limit: PAGE,
        cursorCreated: opts.cursorCreated ?? null,
        cursorId: opts.cursorId ?? null,
      })
      // A newer request (another tab/prefetch) superseded this one.
      if (reqTabRef.current !== key) return
      if (res.error) {
        setError(res.error)
        return
      }
      setError(null)
      setCards((prev) => (opts.fresh ? res.cards : [...prev, ...res.cards]))
    },
    [category]
  )

  // (Re)load when the tab changes; per-tab caching keeps swipes snappy.
  useEffect(() => {
    if (!booted || !isQueueTab) return
    if (loadedTabsRef.current.has(tab)) {
      return
    }
    loadedTabsRef.current.add(tab)
    setLoading(true)
    loadQueue({ fresh: true }).finally(() => setLoading(false))
  }, [tab, booted, loadQueue, isQueueTab])

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
    [user, actingId, toast, haptic, router, tab, loadQueue]
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
        <div className="ambient" style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 24px 96px' }}>
          {/* Header strip — homepage SectionShell pattern, full width */}
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-sm)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="flame" size={20} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                Discover
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Find ideas worth building and people worth building with.
              </p>
            </div>
            <span style={{ flex: 1 }} />
            {user && inbox.length > 0 && (
              <span style={{ textAlign: 'center' }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--danger-text)',
                    lineHeight: 1.15,
                  }}
                >
                  {inbox.length}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Interests</span>
              </span>
            )}
            {user && (
              <>
                <button
                  onClick={() => setShowInbox(true)}
                  aria-label="Incoming interests"
                  style={{
                    position: 'relative',
                    minHeight: 38,
                    padding: '0 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    fontSize: 12.5,
                    fontWeight: 700,
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
                    padding: '0 16px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontSize: 12.5,
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
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {/* HUB — swap-first: the swipe deck of startup ideas & projects
                IS the front door (user request). Everything else (blogs,
                people, hackathons, collab) hides behind a More ▾ dropdown
                until clicked. */}
            {view === 'hub' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* SWAP FRONT DOOR — big image banner straight into the deck */}
                <button
                  onClick={() => {
                    setTab('foryou')
                    setView('deck')
                    window.scrollTo({ top: 0 })
                  }}
                  className="feature-card"
                  style={{
                    ...CARD,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      position: 'relative',
                      display: 'block',
                      width: '100%',
                      aspectRatio: '836 / 300',
                      overflow: 'hidden',
                    }}
                  >
                    <Image
                      src="/images/ideas.webp"
                      alt=""
                      width={836}
                      height={300}
                      sizes="(max-width: 900px) 100vw, 900px"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: 20,
                        background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.72))',
                      }}
                    >
                      <span
                        style={{
                          alignSelf: 'flex-start',
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          padding: '3px 10px',
                          borderRadius: 7,
                          background: 'var(--accent)',
                          color: 'var(--on-accent)',
                          marginBottom: 8,
                        }}
                      >
                        🔥 Swipe • Match • Build
                      </span>
                      <span style={{ fontSize: 21, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                        Swap Startup Ideas &amp; Projects
                      </span>
                      <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 3 }}>
                        Swipe right on ideas you&apos;d build — find who&apos;s in. Blogs, people &amp; more below.
                      </span>
                    </span>
                  </span>
                </button>

                {/* MORE ▾ — collapsed secondary surfaces (blogs, people,
                    hackathons, collab) — expands on click */}
                <details
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow-sm)',
                    overflow: 'hidden',
                  }}
                >
                  <summary
                    style={{
                      padding: '13px 16px',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      listStyle: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ fontSize: 15, color: 'var(--accent)' }}>More ways to discover ▾</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Blogs · People · Hackathons · Collab
                    </span>
                  </summary>
                  <div
                    style={{
                      padding: '0 12px 12px',
                      display: 'grid',
                      gap: 8,
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    }}
                  >
                    {HUB_ITEMS.filter((it) => it.key !== 'foryou' && it.key !== 'startup' && it.key !== 'project').map(
                      (item) => {
                        const open = () => {
                          // Preload the deck payload the instant a card is tapped —
                          // the deck view then renders with data already in hand.
                          if (item.key !== 'blogs' && item.key !== 'people' && !loadedTabsRef.current.has(item.key)) {
                            loadedTabsRef.current.add(item.key)
                            reqTabRef.current = item.key
                            setLoading(true)
                            fetchDiscoveryFeed({
                              category: item.key === 'foryou' ? 'all' : item.key,
                              limit: PAGE,
                              cursorCreated: null,
                              cursorId: null,
                            })
                              .then((res) => {
                                if (reqTabRef.current !== item.key) return
                                if (res.error) {
                                  setError(res.error)
                                  return
                                }
                                setError(null)
                                setCards(res.cards)
                              })
                              .finally(() => {
                                if (reqTabRef.current === item.key) setLoading(false)
                              })
                          }
                          setTab(item.key)
                          setView('deck')
                          window.scrollTo({ top: 0 })
                        }
                        return (
                          <button
                            key={item.key}
                            onClick={open}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: 14,
                              padding: 14,
                              cursor: 'pointer',
                              width: '100%',
                              textAlign: 'left',
                              fontFamily: 'inherit',
                              boxShadow: 'var(--shadow-sm)',
                            }}
                          >
                            <span
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: 12,
                                background: item.accent,
                                color: item.accentText,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 19,
                                flexShrink: 0,
                              }}
                            >
                              {item.icon}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span
                                style={{
                                  display: 'block',
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {item.title}
                              </span>
                              <span
                                style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}
                              >
                                {item.desc}
                              </span>
                            </span>
                            <Icon name="chevron" size={16} />
                          </button>
                        )
                      }
                    )}
                  </div>
                </details>
              </div>
            ) : (
              <>
                {/* Tabs (deck view) — with a way back to the hub */}
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
                  <button
                    onClick={() => {
                      setView('hub')
                      window.scrollTo({ top: 0 })
                    }}
                    style={{
                      minHeight: 36,
                      padding: '6px 13px',
                      borderRadius: 18,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    ← All Discovery
                  </button>
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

                {/* (Shortcut pills removed — spec: Discovery shows discoverable
              content, not a links dashboard. Blogs/People are tabs above;
              Confessions live in Community; Library and Leaderboard have
              their own pillars.) */}

                {/* Content — public-first: the queue is readable logged-out.
                  Queue tabs render the BLUEPRINT BOARD (featured banner +
                  orange pills + idea grid); Blogs/People keep their surfaces.
                  The classic SwipeDeck stays one toggle away inside the board. */}
                {tab === 'blogs' ? (
                  <DiscoveryBlogs />
                ) : tab === 'people' ? (
                  <DiscoveryPeople />
                ) : !booted || loading ? (
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
                  <DiscoverBoard
                    tab={tab === 'foryou' ? 'startup' : (tab as 'startup' | 'project' | 'hackathon' | 'collab')}
                    onTabChange={(t) => setTab(t)}
                    cards={cards}
                    loading={loading}
                    error={error}
                    busy={busy}
                    onAction={handleAction}
                    onRetry={() => {
                      setLoading(true)
                      loadQueue({ fresh: true }).finally(() => setLoading(false))
                    }}
                    signedIn={!!user}
                    onCreate={() => (user ? setShowCreate(true) : router.push('/auth/login?redirect=/discover'))}
                  />
                )}
              </>
            )}
          </div>
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
