'use client'

/**
 * NOTE TAG CARD — how a Library resource appears when tagged in chat.
 *
 * A message containing [CC-NOTE-XXXX] renders this dark, high-contrast card
 * inline: the note's title, subject, contributor ("shared by Ayush") and a
 * "View in Library" affordance. Tapping anywhere on it deep-links to
 * /notes?uid=CC-NOTE-XXXX, where the Library scrolls to the note and
 * highlights it.
 *
 * Darker than a normal message bubble ON PURPOSE — the user asked for the
 * referenced material to stand out so a tag reads as "this is the thing",
 * not as another line of text. Data is fetched once per code and cached in a
 * module-level map, so the same tag repeated in a room hits the network once.
 *
 * The lookup is public and read-only. Unverified notes resolve ONLY for
 * their contributor or an admin (RLS decides); everyone else sees a neutral
 * "note unavailable" chip instead of an error.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface NoteTagData {
  id: string
  note_uid: string
  title: string
  subject: string | null
  resource_type: string | null
  is_verified: boolean | null
  profiles: { full_name: string | null; username: string | null } | null
}

/** One fetch per code per page session, however many times it was tagged. */
const cache = new Map<string, NoteTagData | null>()
const inflight = new Map<string, Promise<NoteTagData | null>>()

export const NOTE_TAG_SELECT =
  'id, note_uid, title, subject, resource_type, is_verified, profiles!notes_uploaded_by_fkey(full_name, username)'

async function fetchNote(uid: string): Promise<NoteTagData | null> {
  if (cache.has(uid)) return cache.get(uid)!
  if (!inflight.has(uid)) {
    const sb = createClient()
    const query = sb.from('notes').select(NOTE_TAG_SELECT).eq('note_uid', uid).maybeSingle()
    const p = (async () => {
      const res = (await query) as { data: unknown }
      // profiles arrives as an array (embed) even for one row.
      const raw = res.data as
        (Omit<NoteTagData, 'profiles'> & { profiles?: NoteTagData['profiles'] | NoteTagData['profiles'][] }) | null
      const note: NoteTagData | null = raw
        ? { ...raw, profiles: Array.isArray(raw.profiles) ? (raw.profiles[0] ?? null) : (raw.profiles ?? null) }
        : null
      cache.set(uid, note)
      inflight.delete(uid)
      return note
    })()
    inflight.set(uid, p)
  }
  return inflight.get(uid)!
}

const TYPE_ICON: Record<string, string> = {
  notes: '📒',
  pyq: '📋',
  book: '📚',
  link: '🔗',
  discussion: '💬',
}

export default function NoteTagCard({ uid }: { uid: string }) {
  const [note, setNote] = useState<NoteTagData | null | undefined>(cache.get(uid))

  useEffect(() => {
    let alive = true
    if (!cache.has(uid)) {
      fetchNote(uid).then((n) => {
        if (alive) setNote(n)
      })
    }
    return () => {
      alive = false
    }
  }, [uid])

  if (note === undefined) {
    // Resolving — keep the bubble height stable so the thread does not jump.
    return (
      <span
        aria-label={`Loading Library note ${uid}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--text-muted)',
          marginTop: 4,
        }}
      >
        ⏳ {uid}
      </span>
    )
  }

  if (!note) {
    // Not visible to this viewer (unverified + not the contributor), or a
    // mistyped code. Neutral, never an error.
    return (
      <a
        href={`/notes?uid=${encodeURIComponent(uid)}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-secondary)',
          border: '1px dashed var(--border-strong, var(--border))',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--text-muted)',
          textDecoration: 'none',
          marginTop: 4,
        }}
      >
        📎 {uid} — open in Library
      </a>
    )
  }

  const contributor = note.profiles?.full_name || note.profiles?.username || 'Unknown'
  const pending = note.is_verified === false

  return (
    <a
      href={`/notes?uid=${encodeURIComponent(note.note_uid)}`}
      aria-label={`${note.title} by ${contributor} — open in Library`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        // Deliberately darker than any message bubble — the referenced
        // material must read as a distinct object, not as more text.
        background: 'var(--bg-secondary)',
        border: '1px solid var(--accent-border, var(--border))',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 10,
        padding: '9px 12px',
        textDecoration: 'none',
        marginTop: 4,
        maxWidth: 340,
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden="true">
        {TYPE_ICON[note.resource_type || ''] || '📎'}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: 'var(--accent-text)',
          }}
        >
          {note.note_uid}
          {pending && <span style={{ color: 'var(--orange-text)' }}>· ⏳ PENDING</span>}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {note.title}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          shared by <strong style={{ color: 'var(--text-secondary)' }}>{contributor}</strong>
          {note.subject ? ` · ${note.subject}` : ''} · View in Library →
        </span>
      </span>
    </a>
  )
}
