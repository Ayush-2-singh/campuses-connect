'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { usePremium } from '@/lib/premium'

const PRO_FEATURES = [
  { icon: '🧠', title: 'AI Brain', desc: 'Upload your notes & ask anything — instant, contextual answers powered by AI. Free users get a preview; Pro unlocks unlimited use.', highlighted: true },
  { icon: '📊', title: 'Advanced Analytics', desc: 'Detailed insights into your activity, growth, and engagement' },
  { icon: '🏅', title: 'Premium Badges', desc: 'Exclusive badges and recognition on your profile' },
  { icon: '⚡', title: '5x Rate Limits', desc: 'Use features 5x more than free users — no throttling' },
  { icon: '🎨', title: 'Custom Themes', desc: 'Personalize your experience with premium themes' },
  { icon: '🚀', title: 'Priority Support', desc: 'Get help faster with priority customer support' },
  { icon: '🔓', title: 'Early Access', desc: 'Try new features before everyone else' },
  { icon: '💬', title: 'Premium Communities', desc: 'Access exclusive study groups and communities' },
]

const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    color: 'var(--text-muted)',
    features: ['Basic feed & posts', 'Campus communities', 'Job listings', 'Leaderboard access', 'AI Brain preview (limited)'],
    cta: 'Current Plan',
    disabled: true,
  },
  {
    name: 'Pro',
    price: '₹99',
    period: '/month',
    color: '#f59e0b',
    features: ['Everything in Free', 'Unlimited AI Brain', 'Advanced analytics', 'Premium badges', '5x rate limits', 'Custom themes', 'Priority support'],
    cta: 'Upgrade to Pro',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '₹499',
    period: '/month',
    color: '#8b5cf6',
    features: ['Everything in Pro', 'Campus-wide analytics', 'Custom integrations', 'Dedicated support', 'SLA guarantee', 'API access'],
    cta: 'Contact Sales',
  },
]

export default function PremiumPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const { isPremium, loading: premiumLoading } = usePremium()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(data)
      }
    }
    load()
  }, [])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(245,158,11,0.3)',
          }}>
            👑
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            CampusConnect Pro
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Unlock the full power of CampusConnect with AI, analytics, and premium features
          </p>
          {isPremium && (
            <div style={{
              marginTop: 12, padding: '8px 16px', borderRadius: 20,
              background: 'var(--success-light)', color: 'var(--success-text)',
              fontSize: 13, fontWeight: 600, display: 'inline-block',
            }}>
              ✅ You are a Pro member!
            </div>
          )}
        </div>

        {/* Features grid */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px', textAlign: 'center' }}>
            What you get with Pro
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {PRO_FEATURES.map(f => (
              <div key={f.title}
                style={{
                  background: (f as any).highlighted ? 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(217,119,6,0.04))' : 'var(--bg)',
                  border: (f as any).highlighted ? '2px solid #f59e0b' : '1px solid var(--border)',
                  borderRadius: 14, padding: '16px', boxShadow: (f as any).highlighted ? '0 4px 16px rgba(245,158,11,0.15)' : 'var(--shadow-sm)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <p style={{ fontSize: 24, margin: 0 }}>{f.icon}</p>
                  {(f as any).highlighted && <span style={{ fontSize: 10, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#fff', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>PRO ONLY</span>}
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{f.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px', textAlign: 'center' }}>
            Choose your plan
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PLANS.map(plan => (
              <div key={plan.name}
                style={{
                  background: 'var(--bg)',
                  border: plan.popular ? `2px solid ${plan.color}` : '1px solid var(--border)',
                  borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)',
                  position: 'relative',
                }}>
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: -10, right: 16,
                    padding: '3px 10px', borderRadius: 10,
                    background: plan.color, color: '#fff',
                    fontSize: 10, fontWeight: 700,
                  }}>
                    🔥 MOST POPULAR
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{plan.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: plan.color }}>{plan.price}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{plan.period}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {plan.features.map(f => (
                    <p key={f} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: plan.color }}>✓</span> {f}
                    </p>
                  ))}
                </div>
                <button
                  disabled={plan.disabled || isPremium}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                    background: plan.disabled ? 'var(--bg-secondary)' : isPremium ? 'var(--success-light)' : plan.popular ? plan.color : 'var(--accent)',
                    color: plan.disabled ? 'var(--text-muted)' : isPremium ? 'var(--success-text)' : '#fff',
                    fontSize: 14, fontWeight: 600, cursor: plan.disabled || isPremium ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}>
                  {isPremium ? '✅ Active' : plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px', textAlign: 'center' }}>
            Frequently Asked Questions
          </h2>
          {[
            { q: 'Can I cancel anytime?', a: 'Yes! Cancel anytime from your profile settings. No questions asked.' },
            { q: 'Is there a free trial?', a: 'Admins can grant you a free trial. Contact your campus admin.' },
            { q: 'What payment methods?', a: 'UPI, Credit/Debit cards, Net Banking — all supported.' },
            { q: 'Can I switch plans?', a: 'Yes! Upgrade or downgrade anytime. Price adjusts automatically.' },
          ].map(faq => (
            <div key={faq.q} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>{faq.q}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
