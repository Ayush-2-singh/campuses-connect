'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons'

export default function SplashScreen() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    // Start fading after 1.2s
    const fadeTimer = setTimeout(() => setFading(true), 1200)
    // Remove from DOM after fade completes
    const hideTimer = setTimeout(() => setVisible(false), 1800)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease-out',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {/* Logo */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: 'linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 40%, var(--accent-purple)) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--on-accent)',
            margin: '0 auto 16px',
            boxShadow: 'var(--accent-glow)',
            animation: 'splashPulse 1.2s ease-in-out',
          }}
        >
          <Icon name="grad" size={36} />
        </div>

        {/* Brand Name */}
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 6px',
            letterSpacing: '-0.02em',
            animation: 'splashSlideUp 0.6s ease-out 0.2s both',
          }}
        >
          Connect<span style={{ color: 'var(--accent)' }}>MyCampus</span>
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-muted)',
            margin: 0,
            animation: 'splashSlideUp 0.6s ease-out 0.4s both',
          }}
        >
          Your campus, connected.
        </p>

        {/* Loading dots */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            marginTop: 24,
            animation: 'splashSlideUp 0.6s ease-out 0.6s both',
          }}
        >
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent)',
                animation: `splashDot 1.2s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes splashPulse {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes splashSlideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes splashDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
