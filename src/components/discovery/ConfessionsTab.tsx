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

import { useCallback, useEffect, useState } from 'react'
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

  const react = async (c: Confession) => {
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
      {/* Composer */}
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
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
              {posting ? 'Posting…' : 'Post'}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {confessions.map((c) => {
            const reacted = myReactions.has(c.id)
            return (
              <div
                key={c.id}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <p
                  style={{
                    fontSize: 14.5,
                    color: 'var(--text-primary)',
                    margin: '0 0 10px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {c.body}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => react(c)}
                    aria-pressed={reacted}
                    aria-label={reacted ? 'Remove reaction' : 'React'}
                    disabled={!userId}
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
                      cursor: userId ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span aria-hidden="true">{reacted ? '❤️' : '🤍'}</span>
                    {c.reaction_count}
                  </button>

                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{timeAgo(c.created_at)}</span>

                  <div style={{ flex: 1 }} />

                  {userId && (
                    <button
                      onClick={() => setReportTarget(c)}
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
                  )}
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
