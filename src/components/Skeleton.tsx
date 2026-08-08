export function Skeleton({
  width,
  height,
  radius = 'var(--radius-sm)',
  style,
}: {
  width?: number | string
  height?: number | string
  radius?: number | string
  style?: React.CSSProperties
}) {
  return (
    <div
      className="skeleton"
      style={{ width: width ?? '100%', height: height ?? 14, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}

/** A card-shaped skeleton matching the app's card layout. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Skeleton width={38} height={38} radius="50%" />
        <div style={{ flex: 1 }}>
          <Skeleton width="40%" height={12} style={{ marginBottom: 6 }} />
          <Skeleton width="25%" height={10} />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={i === rows - 1 ? '65%' : '100%'} height={12} style={{ marginBottom: 8 }} />
      ))}
    </div>
  )
}

/** List skeleton for feeds and listings. */
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} rows={3} />
      ))}
    </div>
  )
}
