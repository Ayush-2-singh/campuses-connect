import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ID_CARD_BUCKET = 'id-cards'

/** GET /api/campus-change — get user's requests + cooldown status */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check cooldown
  const { data: cooldown } = await supabase.rpc('can_request_campus_change', { p_user_id: user.id })

  // Get user's requests
  const { data: requests } = await supabase
    .from('campus_change_requests')
    .select('*, campuses!current_campus_id(name, slug), campuses!requested_campus_id(name, slug)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Get all campuses for the dropdown
  const { data: campuses } = await supabase
    .from('campuses')
    .select('id, name, slug, city, college_id')
    .eq('is_active', true)
    .order('name')

  // Get user's current campus
  const { data: profile } = await supabase
    .from('profiles')
    .select('campus_id, campuses(name, slug)')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    cooldown: cooldown?.[0] || { can_request: true, reason: '', cooldown_days_left: 0, changes_this_year: 0 },
    requests: requests || [],
    campuses: campuses || [],
    current_campus: profile?.campuses || null,
    current_campus_id: profile?.campus_id,
  })
}

/** POST /api/campus-change — submit a new campus change request */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check cooldown first
  const { data: cooldown } = await supabase.rpc('can_request_campus_change', { p_user_id: user.id })
  const cd = cooldown?.[0]
  if (cd && !cd.can_request) {
    return NextResponse.json({ error: cd.reason }, { status: 403 })
  }

  // Get form data (multipart for file upload)
  let requested_campus_id: string
  let roll_number: string | undefined
  let college_email: string | undefined
  let reason: string | undefined
  let idCardFile: File | null = null

  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    requested_campus_id = formData.get('requested_campus_id') as string
    roll_number = formData.get('roll_number') as string || undefined
    college_email = formData.get('college_email') as string || undefined
    reason = formData.get('reason') as string || undefined
    idCardFile = formData.get('id_card') as File | null
  } else {
    const body = await req.json()
    requested_campus_id = body.requested_campus_id
    roll_number = body.roll_number
    college_email = body.college_email
    reason = body.reason
  }

  if (!requested_campus_id) {
    return NextResponse.json({ error: 'Please select a campus' }, { status: 400 })
  }

  // Get user's current campus
  const { data: profile } = await supabase
    .from('profiles')
    .select('campus_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (profile.campus_id === requested_campus_id) {
    return NextResponse.json({ error: 'You are already in this campus' }, { status: 400 })
  }

  // Upload ID card
  let id_card_url = ''
  let id_card_filename = ''

  if (idCardFile && idCardFile.size > 0) {
    // Validate file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(idCardFile.type)) {
      return NextResponse.json({ error: 'ID card must be JPEG, PNG, WebP, or PDF' }, { status: 400 })
    }
    if (idCardFile.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'ID card must be under 5MB' }, { status: 400 })
    }

    const ext = idCardFile.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from(ID_CARD_BUCKET)
      .upload(path, idCardFile, { contentType: idCardFile.type })

    if (uploadErr) {
      console.error('Upload error:', uploadErr)
      return NextResponse.json({ error: `Failed to upload ID card: ${uploadErr.message}` }, { status: 500 })
    }

    const { data: pub } = supabase.storage.from(ID_CARD_BUCKET).getPublicUrl(path)
    id_card_url = pub?.publicUrl || ''
    id_card_filename = idCardFile.name
  }

  if (!id_card_url) {
    return NextResponse.json({ error: 'Please upload your college ID card' }, { status: 400 })
  }

  // AI Verification Score (basic checks)
  let ai_score = 50 // default neutral
  let ai_notes = 'Pending AI verification'

  // Basic checks: file type, size, filename patterns
  if (idCardFile) {
    let score = 50
    const notes: string[] = []

    // Check file type (official formats score higher)
    if (idCardFile.type === 'application/pdf') {
      score += 10
      notes.push('PDF format (official document type)')
    } else if (idCardFile.type === 'image/jpeg') {
      score += 5
      notes.push('JPEG format')
    }

    // Check file size (larger = more likely real scan)
    if (idCardFile.size > 500000) {
      score += 10
      notes.push('High resolution image')
    } else if (idCardFile.size > 100000) {
      score += 5
      notes.push('Medium resolution')
    } else {
      score -= 10
      notes.push('Low resolution — may be screenshot')
    }

    // Check filename for college-related keywords
    const fname = idCardFile.name.toLowerCase()
    const collegeKeywords = ['college', 'university', 'institute', 'student', 'id', 'card', 'identity']
    const hasKeyword = collegeKeywords.some(k => fname.includes(k))
    if (hasKeyword) {
      score += 10
      notes.push('Filename suggests college ID')
    }

    ai_score = Math.min(100, Math.max(0, score))
    ai_notes = notes.join('; ')
  }

  // Insert request
  const { data: request, error: insertErr } = await supabase
    .from('campus_change_requests')
    .insert({
      user_id: user.id,
      current_campus_id: profile.campus_id,
      requested_campus_id,
      id_card_url,
      id_card_filename,
      roll_number,
      college_email,
      reason,
      ai_verification_score: ai_score,
      ai_verification_notes: ai_notes,
      status: 'pending',
    })
    .select()
    .single()

  if (insertErr) {
    console.error('Insert error:', insertErr)
    return NextResponse.json({ error: `Database error: ${insertErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, request })
}

/** PATCH /api/campus-change — cancel a pending request */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { request_id, action } = body

  if (!request_id) {
    return NextResponse.json({ error: 'request_id required' }, { status: 400 })
  }

  if (action === 'cancel') {
    const { error } = await supabase
      .from('campus_change_requests')
      .update({ status: 'cancelled' })
      .eq('id', request_id)
      .eq('user_id', user.id)
      .eq('status', 'pending')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
