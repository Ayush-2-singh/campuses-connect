'use client'

import { useState } from 'react'
import { Icon } from '@/components/icons'

const inputStyle = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const,
}

export default function PasswordField({
  label = 'Password',
  value,
  onChange,
  placeholder,
  autoComplete,
  onKeyDown,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          style={{ ...inputStyle, paddingRight: 46 }}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
    </div>
  )
}
