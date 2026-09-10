'use client'

export default function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: 20,
        color: 'var(--text-muted)',
        width: 44,
        height: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        margin: '-10px 0 -10px -12px',
        flexShrink: 0,
        fontFamily: 'inherit',
      }}
    >
      ←
    </button>
  )
}
