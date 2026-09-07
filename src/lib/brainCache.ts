/**
 * AI Brain — shared answer cache.
 * Lives here (not in a route file) so other routes can import the cache
 * invalidation helper without breaking Next.js route export rules.
 */

// ── In-memory answer cache (resets on cold start, good enough for campus scale) ──
const answerCache = new Map<string, { answer: string; sources: any[]; ts: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

/** Drop a user's cached answers — called when they mutate their brain (upload/save/delete). */
export function clearUserBrainCache(userId: string) {
  for (const k of answerCache.keys()) {
    if (k.startsWith(userId + ':')) answerCache.delete(k)
  }
}

export function brainCacheKey(
  userId: string,
  question: string,
  history: { role: string; content: string }[] = []
): string {
  const q = question.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 200)
  const hist = (history || [])
    .slice(-4)
    .map((m) => `${m.role}:${m.content.slice(0, 80)}`)
    .join('|')
  return `${userId}:${q}:${hist}`
}

export function brainCacheGet(key: string): { answer: string; sources: any[]; ts: number } | undefined {
  const entry = answerCache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry
  return undefined
}

export function brainCacheSet(key: string, value: { answer: string; sources: any[] }) {
  answerCache.set(key, { ...value, ts: Date.now() })
  pruneCache()
}

function pruneCache() {
  if (answerCache.size <= 500) return
  const now = Date.now()
  for (const [k, v] of answerCache) {
    if (now - v.ts > CACHE_TTL) answerCache.delete(k)
  }
}
