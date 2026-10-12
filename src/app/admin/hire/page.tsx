'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * /admin/hire — the operator console for the concierge MVP.
 *
 * Work the inbound recruiter leads, assemble a batch of students, and copy the
 * shareable shortlist link. Admin-only (the APIs behind it enforce it).
 */

interface Lead {
  id: string
  company: string
  contact_name: string
  email: string
  role_title: string
  positions: number | null
  notes: string | null
  status: string
  created_at: string
}

interface Student {
  id: string
  full_name: string | null
  username: string | null
  department: string | null
  github_contributions: number
  leetcode_solved: number
  combined_score: number
}

const STATUSES = ['new', 'contacted', 'batch_sent', 'hired', 'closed']

const card: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 18,
}

const btn: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

export default function AdminHirePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadLeads = useCallback(async () => {
    const res = await fetch('/api/hire/leads')
    if (res.ok) {
      const json = await res.json()
      setLeads(json.leads || [])
    }
  }, [])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  const searchStudents = useCallback(async (term: string) => {
    const res = await fetch(`/api/admin/students?q=${encodeURIComponent(term)}`)
    if (res.ok) {
      const json = await res.json()
      setStudents(json.students || [])
    }
  }, [])

  async function openBatchBuilder(lead: Lead) {
    setActiveLead(lead)
    setSelected(new Set())
    setLink('')
    setError('')
    await searchStudents('')
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch('/api/hire/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (res.ok) {
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)))
    }
  }

  async function createBatch() {
    if (!activeLead || selected.size === 0) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: activeLead.id,
          title: `${activeLead.company} — ${activeLead.role_title}`,
          user_ids: [...selected],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || 'Could not create the batch.')
        return
      }
      setLink(`${window.location.origin}/hire/b/${json.token}`)
      await updateStatus(activeLead.id, 'batch_sent')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 72px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Hire pipeline</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 24px' }}>
        Recruiter requests → build a batch → send the shortlist link.
      </p>

      {/* Leads */}
      <section style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
        {leads.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No leads yet.</p>}
        {leads.map((lead) => (
          <article key={lead.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {lead.company} · {lead.role_title}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  {lead.contact_name} · {lead.email}
                  {lead.positions ? ` · ${lead.positions} openings` : ''}
                </p>
                {lead.notes && (
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>{lead.notes}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <select
                  value={lead.status}
                  onChange={(e) => updateStatus(lead.id, e.target.value)}
                  style={{ ...btn, cursor: 'pointer' }}
                  aria-label="Lead status"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  style={{ ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }}
                  onClick={() => openBatchBuilder(lead)}
                >
                  Build batch
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Batch builder */}
      {activeLead && (
        <section style={{ ...card, marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Build batch for {activeLead.company}</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>{selected.size} selected</p>

          <input
            placeholder="Search students by name…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              searchStudents(e.target.value)
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-primary)',
              fontSize: 14,
              marginBottom: 14,
              fontFamily: 'inherit',
            }}
          />

          <div style={{ display: 'grid', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
            {students.map((s) => (
              <label
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selected.has(s.id) ? 'var(--accent-light)' : 'var(--bg)',
                }}
              >
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>
                  {s.full_name || s.username || s.id}
                  {s.department ? ` · ${s.department}` : ''}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  GH {s.github_contributions} · LC {s.leetcode_solved}
                </span>
              </label>
            ))}
            {students.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No students found.</p>}
          </div>

          {error && <p style={{ color: 'var(--danger, #e5484d)', fontSize: 13, marginTop: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              style={{ ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }}
              disabled={busy || selected.size === 0}
              onClick={createBatch}
            >
              {busy ? 'Creating…' : 'Create batch & get link'}
            </button>
            <button style={btn} onClick={() => setActiveLead(null)}>
              Cancel
            </button>
          </div>

          {link && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                Share this link with the recruiter:
              </p>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent-text)', wordBreak: 'break-all' }}
              >
                {link}
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
