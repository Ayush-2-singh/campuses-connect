'use client'

import { Icon } from '@/components/icons'

export default function EmptyState({
  icon = 'sparkles',
  title,
  body,
  cta,
  onCta,
  compact,
}: {
  icon?: string
  title: string
  body?: string
  cta?: string
  onCta?: () => void
  compact?: boolean
}) {
  return (
    <div style={{ textAlign: 'center', padding: compact ? '28px 16px' : '56px 24px' }}>
      <div
        style={{
          width: 56,
          height: 56,
          margin: '0 auto 16px',
          borderRadius: 16,
          background: 'var(--accent-light)',
          color: 'var(--accent-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={26} />
      </div>
      <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', margin: '0 0 6px' }}>{title}</p>
      {body && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 auto 18px', maxWidth: 360, lineHeight: 1.6 }}>{body}</p>}
      {cta && (
        <button
          onClick={onCta}
          disabled={!onCta}
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            cursor: onCta ? 'pointer' : 'default',
            opacity: onCta ? 1 : 0.7,
            fontFamily: 'inherit',
          }}
        >
          {cta}
        </button>
      )}
    </div>
  )
}
