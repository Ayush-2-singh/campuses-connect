'use client'

/**
 * CALL CODE PAD — the shared surface a study room was missing.
 *
 * Two people talking about a DSA problem cannot point at the same thing unless
 * they can both see it. This panel is a single shared editor: whoever types,
 * everyone reads. It is deliberately ephemeral — the buffer lives on the call's
 * data channel and dies with the room, because a study session is a moment,
 * not a document.
 *
 * The editor is the same CodeMirror component the Compete editor uses, loaded
 * lazily so entering a call never pays for it until the pad is opened.
 */

import dynamic from 'next/dynamic'
import { Icon } from '@/components/icons'

const CodeEditor = dynamic(() => import('@/components/games/CodeEditor'), { ssr: false })

export const PAD_LANGUAGES = [
  { key: 'python', label: 'Python' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'cpp', label: 'C++' },
  { key: 'java', label: 'Java' },
] as const

export default function CallCodePad({
  value,
  language,
  connected,
  onCode,
  onLanguage,
  onClose,
}: {
  value: string
  language: string
  /** How many other people are on the call — the pad is only useful shared. */
  connected: number
  onCode: (next: string) => void
  onLanguage: (next: string) => void
  onClose: () => void
}) {
  return (
    <div
      style={{
        maxWidth: 820,
        margin: '0 auto',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ display: 'inline-flex', color: 'var(--accent-text)' }} aria-hidden="true">
          <Icon name="code" size={16} strokeWidth={2.2} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Shared code pad</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {connected > 1
              ? `Everyone in the room sees this — ${connected} here`
              : 'You are alone with the pad right now'}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}
        >
          <span className="sr-only">Language</span>
          <select
            value={language}
            onChange={(e) => onLanguage(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '5px 8px',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            {PAD_LANGUAGES.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={onClose}
          aria-label="Close the shared code pad"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-secondary)',
            width: 30,
            height: 30,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <CodeEditor value={value} onChange={onCode} language={language} minHeight={300} />
    </div>
  )
}
