'use client'

import { AVATAR_COLORS } from '@/theme/colors'

/**
 * Shared avatar — renders the profile photo when `avatarUrl` is set (either a
 * full URL or a storage path under `avatars/`), otherwise deterministic
 * initials on a stable accent color. Used across the app shell, feeds,
 * profiles and leaderboards so a photo update shows up everywhere at once.
 */
export default function Avatar({
  name,
  avatarUrl,
  size = 38,
  fontSize,
  border,
  ring,
  style,
  onClick,
}: {
  name?: string
  avatarUrl?: string | null
  size?: number
  fontSize?: number
  border?: boolean
  ring?: boolean
  style?: React.CSSProperties
  onClick?: () => void
}) {
  const src = resolveAvatarSrc(avatarUrl)
  const color = AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  const initial = (name?.trim()?.[0] || '?').toUpperCase()

  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    ...(onClick ? { cursor: 'pointer' as const } : {}),
    ...style,
  }

  if (src) {
    return (
      <img
        src={src}
        alt={`${name || 'User'}'s avatar`}
        loading="lazy"
        onClick={onClick}
        className="avatar-img"
        style={{
          ...base,
          objectFit: 'cover',
          display: 'block',
          border: border ? '1px solid var(--border-strong)' : 'none',
          boxShadow: ring ? `0 0 0 2px var(--bg), 0 0 0 4px color-mix(in srgb, ${color} 55%, transparent)` : undefined,
        }}
      />
    )
  }

  return (
    <div
      onClick={onClick}
      aria-hidden="true"
      style={{
        ...base,
        background: color,
        color: 'var(--on-accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fontSize ?? Math.round(size * 0.42),
        fontWeight: 700,
        border: border ? '1px solid var(--border-strong)' : 'none',
        boxShadow: ring ? `0 0 0 2px var(--bg), 0 0 0 4px color-mix(in srgb, ${color} 55%, transparent)` : undefined,
      }}
    >
      {initial}
    </div>
  )
}

/** Normalize an avatar value (storage path or absolute URL) into a displayable src. */
export function resolveAvatarSrc(avatarUrl?: string | null): string | null {
  if (!avatarUrl) return null
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('data:')) {
    return avatarUrl
  }
  // Storage path like "avatars/<uid>/avatar.png"
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url && avatarUrl.startsWith('avatars/')) {
    return `${url}/storage/v1/object/public/${avatarUrl}`
  }
  return null
}
