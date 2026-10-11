import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ID_CARD_BUCKET = 'id-cards'

/**
 * GET /api/admin/id-card?path=<storage path>
 *
 * The `id-cards` bucket is PRIVATE — student ID cards must never sit on a
 * public URL. Rows created before this route store a full public URL in
 * `campus_change_requests.id_card_url`; newer rows store the storage path
 * (`<userId>/<timestamp>.<ext>`), which this endpoint resolves to a
 * short-lived signed URL for admins reviewing a campus-change request.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify admin (platform or campus) — same gate the other admin routes use.
  const { data: grants } = await supabase.rpc('my_admin_grants')
  const g = (grants as any[]) || []
  const isAdmin = g.some((x: any) => x.admin_type === 'platform_admin' || x.admin_type === 'campus_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const path = new URL(req.url).searchParams.get('path') || ''
  // Strict shape check: exactly `<ownerId>/<file>` — no traversal, no URLs.
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(path)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const { data, error } = await supabase.storage.from(ID_CARD_BUCKET).createSignedUrl(path, 60 * 10) // 10 minutes — enough to review, useless if leaked

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'ID card not found' }, { status: 404 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
