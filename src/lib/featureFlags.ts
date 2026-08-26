'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface FeatureFlag {
  key: string
  enabled: boolean
  label: string
  description: string | null
  category: string
}

/** Hook: fetches all feature flags and returns a map + helper. */
export function useFeatureFlags() {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const supabase = createClient()
    supabase.rpc('get_feature_flags').then(({ data, error }) => {
      if (!alive) return
      if (error) { setLoading(false); return }
      const map: Record<string, FeatureFlag> = {}
      for (const row of (data || []) as any[]) {
        map[row.key] = { key: row.key, enabled: row.enabled, label: row.label, description: row.description, category: row.category }
      }
      setFlags(map)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const isEnabled = (key: string) => flags[key]?.enabled ?? true

  return { flags, loading, isEnabled }
}

/** One-shot check: returns true if feature is enabled (client-side). */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const supabase = createClient()
  const { data } = await supabase.rpc('is_feature_enabled', { p_key: key })
  return data !== false
}
