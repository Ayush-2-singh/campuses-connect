'use client'

// ═══════════════════════════════════════════════════════════════════════════
// /tournaments/join?code=SX7K92 — player self-join flow (spec §8).
//   1. Resolve the code server-side → preview (tournament, team, roster)
//   2. Unauthenticated → login gate with redirect back
//   3. Authenticated → Free Fire identity form (IGN + UID)
//   4. Confirm → join_team_by_code (server re-validates EVERYTHING)
// ═══════════════════════════════════════════════════════════════════════════

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'
import { ListSkeleton } from '@/components/Skeleton'
import { resolveInvite, joinByCode, JOIN_ERROR_COPY, type InvitePreview } from '@/lib/tournaments/rosters'

function JoinInner() {
  const supabase = createClient()
  const router = useRouter()
  const params = useSearchParams()
  const code = (params.get('code') || '').toUpperCase()

  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [user, setUser] = useState<any>(null)
  const [ign, setIgn] = useState('')
  const [uid, setUid] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinErr, setJoinErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [authRes, prev] = await Promise.all([
        supabase.auth.getUser(),
        code ? resolveInvite(supabase, code) : Promise.resolve<InvitePreview>({ ok: false, error: 'invalid_code' }),
      ])
      if (cancelled) return
      setPreview(prev)
      setUser(authRes.data.user)
      if (authRes.data.user) {
        // Prefill IGN from profile full name as a convenience (editable).
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', authRes.data.user.id)
          .single()
        if (prof?.full_name) setIgn(prof.full_name.split(' ')[0])
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [supabase, code])

  const submit = async () => {
    if (!code || joining) return
    if (!ign.trim() || !uid.trim()) {
      setJoinErr('Please enter both your in-game name and UID.')
      return
    }
    if (!/^\d{6,12}$/.test(uid.trim())) {
      setJoinErr('Free Fire UID is 8-12 digits — check and re-enter.')
      return
    }
    setJoining(true)
    setJoinErr(null)
    const res = await joinByCode(supabase, code, ign, uid)
    setJoining(false)
    if (res.ok) setDone(true)
    else setJoinErr(JOIN_ERROR_COPY[res.error || 'error'] || res.error || 'Join failed')
  }

  const input = {
    width: '100%',
    boxSizing: 'border-box' as const,
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '11px 14px',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  }

  return (
    <Layout>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 20px 64px' }}>
        <h1
          style={{
            fontSize: 21,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 4px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--accent-text)' }} aria-hidden="true">
            <Icon name="gamepad" size={21} />
          </span>
          Join Team
        </h1>

        {loading ? (
          <div style={{ marginTop: 16 }}>
            <ListSkeleton count={2} />
          </div>
        ) : !preview?.ok ? (
          /* ── Invalid / expired / locked / full ── */
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '28px 22px',
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            <div
              style={{ margin: '0 auto 12px', color: 'var(--warning-text)', display: 'flex', justifyContent: 'center' }}
            >
              <Icon name="alert" size={34} strokeWidth={1.6} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              {JOIN_ERROR_COPY[preview?.error || 'invalid_code']}
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
              Ask your team captain (IGL) for a fresh invite code.
            </p>
          </div>
        ) : done ? (
          /* ── Success ── */
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--success-border)',
              borderRadius: 14,
              padding: '28px 22px',
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            <div
              style={{ margin: '0 auto 12px', color: 'var(--success-text)', display: 'flex', justifyContent: 'center' }}
            >
              <Icon name="check" size={34} strokeWidth={2.2} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              You are in {preview.team_name}
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Your Free Fire identity is saved. See you on the drop island.
            </p>
            <button
              onClick={() => router.push('/tournaments')}
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                padding: '10px 22px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              View tournament
            </button>
          </div>
        ) : !user ? (
          /* ── Login gate (spec §8) ── */
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '28px 22px',
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Join {preview.team_name}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>{preview.tournament_name}</p>
            <button
              onClick={() => router.push(`/auth/login?redirect=/tournaments/join?code=${code}`)}
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                padding: '11px 24px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Login to ConnectToCampus
            </button>
          </div>
        ) : (
          /* ── Identity + confirm ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
            {/* Where am I joining */}
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '16px 18px',
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  margin: '0 0 8px',
                }}
              >
                You are joining
              </p>
              <Row label="Tournament" value={preview.tournament_name || ''} />
              <Row label="Team" value={`${preview.team_name}${preview.team_tag ? ` [${preview.team_tag}]` : ''}`} />
              <Row label="Roster" value={`${preview.roster} / ${preview.team_size} players`} />
            </div>

            {/* Free Fire identity — separate from CTC identity (spec §9) */}
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '16px 18px',
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  margin: '0 0 10px',
                }}
              >
                Free Fire identity
              </p>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                In-game name (IGN)
              </label>
              <input
                style={{ ...input, marginBottom: 12 }}
                value={ign}
                onChange={(e) => setIgn(e.target.value)}
                placeholder="e.g. AyushOP"
                maxLength={20}
              />
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                Free Fire UID
              </label>
              <input
                style={{ ...input, marginBottom: 6 }}
                value={uid}
                onChange={(e) => setUid(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 123456789"
                inputMode="numeric"
                maxLength={12}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                UID is unique per tournament — double-check it in your in-game profile.
              </p>
            </div>

            {joinErr && (
              <div
                style={{
                  background: 'var(--danger-light)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: 'var(--danger-text)',
                }}
              >
                {joinErr}
              </div>
            )}

            <button
              onClick={submit}
              disabled={joining}
              style={{
                background: joining ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                padding: '13px 22px',
                borderRadius: 12,
                fontSize: 14.5,
                fontWeight: 800,
                cursor: joining ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {joining ? 'Joining…' : 'Confirm & Join Team'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function TournamentJoinPage() {
  return (
    <Suspense
      fallback={
        <Layout>
          <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 20px' }}>
            <ListSkeleton count={2} />
          </div>
        </Layout>
      }
    >
      <JoinInner />
    </Suspense>
  )
}
