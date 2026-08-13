'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icons'

interface CmdItem {
  icon: string
  label: string
  hint?: string
  href: string
  group: 'Navigate' | 'Ask Campus Connect'
}

const COMMANDS: CmdItem[] = [
  // AI-style quick actions — every one lands on a real page with a real feature.
  { icon: 'briefcase', label: 'Find internships for me', hint: 'Opportunities', href: '/opportunities?type=internship', group: 'Ask Campus Connect' },
  { icon: 'zap', label: 'Find hackathons closing soon', hint: 'Opportunities', href: '/opportunities?type=hackathon', group: 'Ask Campus Connect' },
  { icon: 'notebook', label: 'Find notes about a subject', hint: 'Notes library', href: '/notes', group: 'Ask Campus Connect' },
  { icon: 'users', label: 'Find DSA students', hint: 'Talent', href: '/talent', group: 'Ask Campus Connect' },
  { icon: 'calendar', label: 'What is due this week?', hint: 'Classroom', href: '/college', group: 'Ask Campus Connect' },
  { icon: 'grad', label: 'Talk to your AI Brain', hint: 'AI Brain', href: '/brain', group: 'Ask Campus Connect' },
  // Navigation
  { icon: 'home', label: 'Home — Campus Pulse', href: '/feed', group: 'Navigate' },
  { icon: 'globe', label: 'Global — connect everywhere', href: '/global', group: 'Navigate' },
  { icon: 'book', label: 'Classroom', href: '/college', group: 'Navigate' },
  { icon: 'briefcase', label: 'Opportunities', href: '/opportunities', group: 'Navigate' },
  { icon: 'notebook', label: 'Notes', href: '/notes', group: 'Navigate' },
  { icon: 'users', label: 'Communities', href: '/communities', group: 'Navigate' },
  { icon: 'star', label: 'Talent', href: '/talent', group: 'Navigate' },
  { icon: 'bell', label: 'Notifications', href: '/notifications', group: 'Navigate' },
  { icon: 'user', label: 'Profile', href: '/profile', group: 'Navigate' },
  { icon: 'more', label: 'More', href: '/more', group: 'Navigate' },
]

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(c => c.label.toLowerCase().includes(q) || (c.hint || '').toLowerCase().includes(q))
  }, [query])

  const groups = useMemo(() => {
    const g: { name: string; items: CmdItem[] }[] = []
    for (const item of filtered) {
      const last = g[g.length - 1]
      if (last && last.name === item.group) last.items.push(item)
      else g.push({ name: item.group, items: [item] })
    }
    return g
  }, [filtered])

  const flatItems = filtered

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  const select = (item: CmdItem) => {
    onClose()
    router.push(item.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (i + 1) % Math.max(flatItems.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (i - 1 + Math.max(flatItems.length, 1)) % Math.max(flatItems.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatItems[activeIndex]
      if (item) select(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="cmd-backdrop" onClick={onClose} role="presentation">
      <div
        className="cmd-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Ask Campus Connect"
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-muted)', display: 'flex' }}>
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask Campus Connect..."
            aria-label="Ask Campus Connect"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'none',
              fontSize: 15,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ESC
          </button>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
          {flatItems.length === 0 && (
            <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              No results for “{query}” — try a page name or a campus question.
            </p>
          )}
          {groups.map(g => (
            <div key={g.name}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 16px 4px' }}>
                {g.name}
              </p>
              {g.items.map(item => {
                const idx = flatItems.indexOf(item)
                return (
                  <button
                    key={`${g.name}-${item.label}`}
                    type="button"
                    className="cmd-item"
                    data-active={idx === activeIndex}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onPointerDown={() => setActiveIndex(idx)}
                    onClick={() => select(item)}
                  >
                    <span style={{ display: 'flex', color: idx === activeIndex ? 'var(--accent-text)' : 'var(--text-muted)', width: 18 }}>
                      <Icon name={item.icon} size={17} />
                    </span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.hint}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
