'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface PremiumStatus {
  isPremium: boolean
  premiumType: string | null
  expiresAt: string | null
  loading: boolean
}

/** Hook: check if current user is premium */
export function usePremium(): PremiumStatus & { refresh: () => void } {
  const [status, setStatus] = useState<PremiumStatus>({
    isPremium: false,
    premiumType: null,
    expiresAt: null,
    loading: true,
  })
  const supabase = createClient()

  const check = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus(s => ({ ...s, loading: false })); return }

      const { data } = await supabase.rpc('is_user_premium', { p_user_id: user.id })
      setStatus({
        isPremium: data === true,
        premiumType: null,
        expiresAt: null,
        loading: false,
      })
    } catch {
      setStatus(s => ({ ...s, loading: false }))
    }
  }, [])

  useEffect(() => { check() }, [])

  return { ...status, refresh: check }
}

/** Check if a specific feature requires premium */
export async function isFeaturePremium(key: string): Promise<boolean> {
  const supabase = createClient()
  const { data } = await supabase.rpc('is_feature_premium', { p_key: key })
  return data === true
}

/** Check if user can use a specific feature */
export async function canUseFeature(featureKey: string): Promise<{ canUse: boolean; reason: string; isPremiumRequired: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { canUse: false, reason: 'Not logged in', isPremiumRequired: false }

  const { data } = await supabase.rpc('can_use_feature', { p_user_id: user.id, p_feature_key: featureKey })
  if (data && data[0]) {
    return {
      canUse: data[0].can_use,
      reason: data[0].reason || '',
      isPremiumRequired: data[0].is_premium_required || false,
    }
  }
  return { canUse: true, reason: '', isPremiumRequired: false }
}

/** Premium gate component props */
export interface PremiumGateProps {
  featureKey: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

/** Check rate limit */
export async function checkRateLimit(endpoint: string, limit: number = 10, windowMinutes: number = 60): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase.rpc('check_rate_limit', {
    p_user_id: user.id,
    p_endpoint: endpoint,
    p_limit: limit,
    p_window_minutes: windowMinutes,
  })
  return data === true
}
