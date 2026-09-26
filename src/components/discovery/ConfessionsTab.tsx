'use client'

/**
 * ConfessionsTab — the anonymous confession feed, relocated out of the old
 * /discover page (which is now the idea/swipe hub). Behaviour and backend are
 * unchanged: confessions_public view (never exposes author_id), create /
 * toggle-reaction / report RPCs, 5-report auto-hide.
 *
 * Audit fixes applied during the relocation (old page.tsx issues):
 *   1. Sort changes reload ONLY the feed — auth/profile are not refetched.
 *   2. Profile fields are selected explicitly, never `*`.
 *   3. confession_reactions is filtered by the signed-in user explicitly
 *      (RLS already scopes it; this makes client correctness not accidental).
 *   4. Range pagination with a Load-more control instead of a bare LIMIT 30.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useHaptic } from '@/hooks/useMobile'

type Confession = {
  id: string
  body: string
  reaction_count: number
  created_at: string
}

const REPORT_REASONS = [
  'Harassment or bullying',
  'Doxxing / personal information',
  'Hate or abuse',
  'Spam or scam',
  'Sexual or explicit content',
  'Threats',
  'Other',
]

const PAGE_SIZE = 30

/** Sticky-note tints — deterministic per card via its id hash. */
const CONFESS_TINTS = [
  { bg: 'rgba(253,143,1,0.10)', border: 'rgba(253,143,1,0.28)', accent: '#fd8f01' }, // amber
  { bg: 'rgba(169,123,240,0.10)', border: 'rgba(169,123,240,0.28)', accent: '#a97bf0' }, // violet
  { bg: 'rgba(75,191,122,0.10)', border: 'rgba(75,191,122,0.28)', accent: '#4cbf7a' }, // green
  { bg: 'rgba(91,157,255,0.10)', border: 'rgba(91,157,255,0.28)', accent: '#5b9dff' }, // blue
  { bg: 'rgba(224,85,62,0.10)', border: 'rgba(224,85,62,0.28)', accent: '#e0553e' }, // coral
]

/** Stable small hash from a uuid string — keeps card colours consistent across renders. */
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export default function ConfessionsTab({ userId }: { userId: string | null }) {
  const supabase = createClient()
  const toast = useToast()
  const haptic = useHaptic()
  const router = useRouter()

  const [confessions, setConfessions] = useState<Confession[]>([])
  const [myReactions, setMyReactions] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<'latest' | 'trending'>('latest')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const [reportTarget, setReportTarget] = useState<Confession | null>(null)
  const [reportBusy, setReportBusy] = useState(false)

  // ---- interactivity state ----
  /** Burst hearts: {key, confessionId, x%, y%} — rendered inside the card. */
  const [bursts, setBursts] = useState<{ key: number; id: string; x: number; y: number }[]>([])
  /** Cards whose ❤️ button just popped (animation trigger). */
  const [popped, setPopped] = useState<Set<string>>(new Set())
  /** Tracks last tap per confession for double-tap detection (<350ms). */
  const lastTapRef = useRef<Record<string, number>>({})
  const burstSeq = useRef(0)

  /** Spawn a floating heart at the tap point inside a card. */
  const spawnBurst = useCallback((confessionId: string, x: number, y: number) => {
    const key = ++burstSeq.current
    setBursts((prev) => [...prev.slice(-6), { key, id: confessionId, x, y }])
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.key !== key))
    }, 1400)
  }, [])

  const markPopped = useCallback((confessionId: string) => {
    setPopped((prev) => new Set(prev).add(confessionId))
    window.setTimeout(() => {
      setPopped((prev) => {
        const next = new Set(prev)
        next.delete(confessionId)
        return next
      })
    }, 450)
  }, [])

  /**
   * Card body interactions: double-tap (or double-click) anywhere on the text
   * reacts + bursts a heart at the exact tap point — Instagram-style.
   */
  const onBodyPointerDown = (e: React.PointerEvent<HTMLParagraphElement>, c: Confession) => {
    if (!userId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    const now = Date.now()
    const last = lastTapRef.current[c.id] || 0
    lastTapRef.current[c.id] = now
    if (now - last < 350) {
      lastTapRef.current[c.id] = 0
      spawnBurst(c.id, x, y)
      if (!myReactions.has(c.id)) {
        markPopped(c.id)
        void react(c)
      }
    }
  }

  const load = useCallback(
    async (offset = 0) => {
      const order =
        sort === 'trending'
          ? { column: 'reaction_count', ascending: false }
          : { column: 'created_at', ascending: false }

      const query = supabase
        .from('confessions_public')
        .select('id, body, reaction_count, created_at')
        .order(order.column, { ascending: order.ascending })
        .range(offset, offset + PAGE_SIZE - 1)

      const { data } = await query
      const rows = (data as Confession[]) || []
      setConfessions((prev) => (offset === 0 ? rows : [...prev, ...rows]))
      setExhausted(rows.length < PAGE_SIZE)

      if (offset === 0) {
        // Explicitly scope to MY reactions — do not depend on RLS accidents.
        const { data: mine } = userId
          ? await supabase.from('confession_reactions').select('confession_id').eq('user_id', userId)
          : { data: [] }
        setMyReactions(new Set(((mine as Array<{ confession_id: string }>) || []).map((r) => r.confession_id)))
      }
    },
    [sort, supabase, userId]
  )

  // Feed loads once per sort; auth/profile are NOT part of this effect (fix #1).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load(0).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const loadMore = async () => {
    if (loadingMore || exhausted) return
    setLoadingMore(true)
    await load(confessions.length)
    setLoadingMore(false)
  }

  const submit = async () => {
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    const { error } = await supabase.rpc('create_confession', { p_body: body })
    setPosting(false)
    if (error) {
      toast.show(error.message || 'Could not post', { tone: 'danger' })
      return
    }
    haptic.tap()
    setDraft('')
    toast.show('Posted anonymously', { tone: 'success' })
    await load(0)
  }

  const requireAuth = () => {
    router.push('/auth/login?redirect=' + encodeURIComponent(window.location.pathname))
  }

  const react = async (c: Confession) => {
    // Interaction gate: reading is public, reacting needs an account.
    if (!userId) {
      requireAuth()
      return
    }
    // Optimistic — the toggle RPC reconciles with the true count.
    const reacted = myReactions.has(c.id)
    setMyReactions((prev) => {
      const next = new Set(prev)
      if (reacted) next.delete(c.id)
      else next.add(c.id)
      return next
    })
    setConfessions((prev) =>
      prev.map((x) =>
        x.id === c.id ? { ...x, reaction_count: Math.max(0, x.reaction_count + (reacted ? -1 : 1)) } : x
      )
    )
    haptic.medium()
    const { error } = await supabase.rpc('toggle_confession_reaction', { p_confession_id: c.id })
    if (error) await load(0)
  }

  const report = async (reason: string) => {
    if (!reportTarget || reportBusy) return
    if (!userId) {
      requireAuth()
      return
    }
    setReportBusy(true)
    const { error } = await supabase.rpc('report_confession', {
      p_confession_id: reportTarget.id,
      p_reason: reason,
    })
    setReportBusy(false)
    setReportTarget(null)
    if (error) {
      toast.show('Could not send report', { tone: 'danger' })
      return
    }
    toast.show('Report sent to moderators', { tone: 'success' })
    await load(0)
  }

  return (
    <div>
      {/* Composer — or, logged out, a sign-in CTA (read is still public) */}
      {!userId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 16,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            🕵️ Reading is public — <strong>sign in to confess or react.</strong>
          </p>
          <button
            onClick={requireAuth}
            style={{
              minHeight: 38,
              padding: '7px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            Sign in
          </button>
        </div>
      )}
      {userId && (
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 15 }}>🕵️</span>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>
              Confess anonymously
            </p>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something real — nobody will know it's you."
            rows={3}
            maxLength={2000}
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              background: 'var(--bg)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
            <span
              style={{
                fontSize: 11,
                color: draft.length > 1800 ? 'var(--danger)' : 'var(--text-muted)',
              }}
              aria-live="polite"
            >
              {draft.length}/2000
            </span>
            <span style={{ flex: 1 }} />
            <button
              onClick={submit}
              disabled={!draft.trim() || posting}
              style={{
                minHeight: 40,
                padding: '8px 18px',
                borderRadius: 10,
                border: 'none',
                background: !draft.trim() || posting ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--on-accent)',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {posting ? 'Posting…' : 'Post anonymously'}
            </button>
          </div>
        </div>
      )}

      {/* Sort */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['latest', 'trending'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            style={{
              minHeight: 36,
              padding: '6px 14px',
              borderRadius: 20,
              border: sort === s ? 'none' : '1px solid var(--border)',
              background: sort === s ? 'var(--accent)' : 'var(--bg)',
              color: sort === s ? 'var(--on-accent)' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {s === 'latest' ? '🕐 Latest' : '🔥 Trending'}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <ListSkeleton count={4} />
      ) : confessions.length === 0 ? (
        <EmptyState icon="🕵️" title="No confessions yet" body="Be the first to share something anonymously." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {confessions.map((c, i) => {
            const reacted = myReactions.has(c.id)
            const cardBursts = bursts.filter((b) => b.id === c.id)
            // Sticky-note palette: each card gets a hue from its id so the
            // feed reads as a wall of different coloured secrets.
            const tint = CONFESS_TINTS[hashId(c.id) % CONFESS_TINTS.length]
            return (
              <div
                key={c.id}
                className="confess-card"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  background: `linear-gradient(155deg, ${tint.bg}, var(--bg) 78%)`,
                  border: `1px solid ${tint.border}`,
                  borderLeft: `3px solid ${tint.accent}`,
                  borderRadius: 14,
                  padding: '16px 16px 13px',
                  animation: `ccConfessIn 0.3s ease ${Math.min(i, 8) * 0.04}s backwards`,
                }}
              >
                {/* decorative “secret note” SVG — quote watermark + seal */}
                <svg
                  aria-hidden
                  viewBox="0 0 400 120"
                  preserveAspectRatio="xMidYMid slice"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0.16,
                    pointerEvents: 'none',
                  }}
                >
                  {/* big opening quote */}
                  <text x="330" y="86" fill={tint.accent} fontSize="110" fontFamily="Georgia, serif" fontWeight="700">
                    &ldquo;
                  </text>
                  {/* wax-seal circle */}
                  <circle cx="34" cy="94" r="17" fill="none" stroke={tint.accent} strokeWidth="1.4" />
                  <circle cx="34" cy="94" r="11" fill="none" stroke={tint.accent} strokeWidth="0.9" opacity="0.7" />
                  <text x="34" y="98" textAnchor="middle" fill={tint.accent} fontSize="11">
                    ?
                  </text>
                  {/* faint diagonal hatching, like a paper grain */}
                  <g stroke={tint.accent} strokeWidth="0.5" opacity="0.5">
                    <line x1="120" y1="0" x2="60" y2="120" />
                    <line x1="170" y1="0" x2="110" y2="120" />
                    <line x1="220" y1="0" x2="160" y2="120" />
                  </g>
                </svg>

                {/* washi-tape strip pinned across the top edge */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: -7,
                    left: '50%',
                    transform: `translateX(-50%) rotate(${(hashId(c.id) % 5) - 2}deg)`,
                    width: 92,
                    height: 15,
                    background: tint.accent,
                    opacity: 0.5,
                    borderRadius: 2,
                  }}
                />

                {/* masked badge — whisper-tone identity strip */}
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 9,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: tint.accent,
                      background: 'var(--bg)',
                      border: `1px solid ${tint.border}`,
                      borderRadius: 7,
                      padding: '2px 8px',
                    }}
                  >
                    🕵️ Confession #{hashId(c.id).toString(36).slice(0, 4).toUpperCase()}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(c.created_at)}</span>
                </div>

                <p
                  onPointerDown={(e) => onBodyPointerDown(e, c)}
                  style={{
                    position: 'relative',
                    fontSize: 16,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    margin: '0 0 12px',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    cursor: userId ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                >
                  {c.body}
                </p>

                {/* floating double-tap hearts */}
                {cardBursts.map((b) => (
                  <span
                    key={b.key}
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: `${b.x}%`,
                      top: `${b.y}%`,
                      fontSize: 34,
                      pointerEvents: 'none',
                      animation: 'ccHeartBurst 1.4s ease-out forwards',
                      filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))',
                    }}
                  >
                    ❤️
                  </span>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => react(c)}
                    aria-pressed={reacted}
                    aria-label={reacted ? 'Remove reaction' : 'React — sign in required'}
                    style={{
                      minHeight: 36,
                      minWidth: 62,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: reacted ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: reacted ? 'var(--accent-light)' : 'var(--bg)',
                      color: reacted ? 'var(--accent-text)' : 'var(--text-secondary)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      animation: popped.has(c.id) ? 'ccReactionPop 0.45s ease' : undefined,
                    }}
                  >
                    <span aria-hidden="true" style={{ display: 'inline-block' }}>
                      {reacted ? '❤️' : '🤍'}
                    </span>
                    {c.reaction_count}
                  </button>

                  {!reacted && userId && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.75 }}>double-tap ❤️</span>
                  )}

                  <span style={{ flex: 1 }} />

                  {
                    <button
                      onClick={() => (userId ? setReportTarget(c) : requireAuth())}
                      aria-label="Report confession"
                      style={{
                        minHeight: 36,
                        minWidth: 36,
                        borderRadius: 20,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                        color: 'var(--text-muted)',
                        fontSize: 14,
                        cursor: 'pointer',
                      }}
                    >
                      🚩
                    </button>
                  }
                </div>
              </div>
            )
          })}

          {!exhausted && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              style={{
                minHeight: 44,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-secondary)',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {/* Report bottom sheet — unchanged behaviour */}
      {reportTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report confession"
          onClick={() => !reportBusy && setReportTarget(null)}
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
              padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Report this confession
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Five reports from different students hide it automatically for review.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => report(r)}
                  disabled={reportBusy}
                  style={{
                    minHeight: 46,
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={() => setReportTarget(null)}
              disabled={reportBusy}
              style={{
                width: '100%',
                minHeight: 46,
                marginTop: 12,
                borderRadius: 10,
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
          </div>
        </div>
      )}
    </div>
  )
}
