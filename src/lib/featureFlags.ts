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

// ── localStorage cache for feature flags ──────────────────────────────
const CACHE_KEY = 'cc_feature_flags'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface CachedFlags {
  ts: number
  flags: Record<string, FeatureFlag>
}

function readCache(): Record<string, FeatureFlag> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed: CachedFlags = JSON.parse(raw)
    if (Date.now() - parsed.ts < CACHE_TTL) return parsed.flags
  } catch {}
  return null
}

function writeCache(flags: Record<string, FeatureFlag>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), flags }))
  } catch {}
}

/** Hook: fetches all feature flags, cached in localStorage for 5 min. */
export function useFeatureFlags() {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Load from cache instantly (no DB hit)
    const cached = readCache()
    if (cached) {
      setFlags(cached)
      setLoading(false)
      return
    }

    // 2. Cache miss — fetch from Supabase
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
      writeCache(map)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const isEnabled = (key: string) => flags[key]?.enabled ?? true

  return { flags, loading, isEnabled }
}

/** One-shot check: returns true if feature is enabled (client-side). */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  // Try cache first
  const cached = readCache()
  if (cached && cached[key]) return cached[key].enabled !== false

  const supabase = createClient()
  const { data } = await supabase.rpc('is_feature_enabled', { p_key: key })
  return data !== false
}
