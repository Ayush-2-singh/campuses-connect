'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePremium } from '@/lib/premium'

interface PremiumGateProps {
  featureKey: string
  children: React.ReactNode
  showPreview?: boolean // show blurred preview behind lock
}

export default function PremiumGate({ featureKey, children, showPreview = false }: PremiumGateProps) {
  const { isPremium, loading } = usePremium()
  const router = useRouter()

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8, animation: 'pulse 1s infinite' }}>⏳</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    )
  }

  if (isPremium) {
    return <>{children}</>
  }

  // Not premium — show lock screen
  return (
    <div style={{ position: 'relative' }}>
      {showPreview && (
        <div style={{ filter: 'blur(4px)', opacity: 0.3, pointerEvents: 'none', userSelect: 'none' }}>
          {children}
        </div>
      )}
      <div style={{
        position: showPreview ? 'absolute' : 'relative',
        inset: showPreview ? 0 : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: showPreview ? 'rgba(0,0,0,0.6)' : 'var(--bg)',
        borderRadius: 16,
        border: '2px solid var(--accent)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, marginBottom: 16,
          boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
        }}>
          👑
        </div>
        <h3 style={{
          fontSize: 18, fontWeight: 700, color: showPreview ? '#fff' : 'var(--text-primary)',
          margin: '0 0 8px', textAlign: 'center',
        }}>
          CampusConnect Pro
        </h3>
        <p style={{
          fontSize: 13, color: showPreview ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)',
          margin: '0 0 20px', textAlign: 'center', maxWidth: 300, lineHeight: 1.5,
        }}>
          This feature is available for Pro members only. Upgrade to unlock AI-powered tools, premium badges, and more!
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => router.push('/premium')}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
            }}>
            👑 Upgrade to Pro
          </button>
          <button onClick={() => router.back()}
            style={{
              padding: '10px 20px', borderRadius: 10,
              border: showPreview ? '1px solid rgba(255,255,255,0.3)' : '1px solid var(--border)',
              background: 'transparent',
              color: showPreview ? '#fff' : 'var(--text-secondary)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            Go Back
          </button>
        </div>
        {/* Pro features list */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            '🧠 AI Brain — Ask your notes anything',
            '📊 Advanced Analytics',
            '🏅 Premium Badges',
            '⚡ 5x Rate Limits',
            '🎨 Priority Support',
          ].map(f => (
            <p key={f} style={{
              fontSize: 12, color: showPreview ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
              margin: 0,
            }}>{f}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Simple premium badge for showing on cards */
export function PremiumBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? { fontSize: 10, padding: '1px 6px' } : { fontSize: 12, padding: '2px 8px' }
  return (
    <span style={{
      ...s,
      borderRadius: 8,
      background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
      color: '#fff',
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2,
    }}>
      👑 Pro
    </span>
  )
}
