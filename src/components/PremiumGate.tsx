'use client'

/**
 * PremiumGate — now a no-op wrapper. All features are free and open to use.
 * Kept for backward compatibility so existing imports don't break.
 */
export default function PremiumGate({ children }: { featureKey?: string; children: React.ReactNode; showPreview?: boolean }) {
  return <>{children}</>
}

/** Simple premium badge — no longer needed, returns null */
export function PremiumBadge(_props?: { size?: 'sm' | 'md' }) {
  return null
}
