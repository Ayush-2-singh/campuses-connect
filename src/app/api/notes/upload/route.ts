import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAuthLite } from '@/lib/api/middleware'

let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]
const BUCKET_NAME = 'campus-notes'

function generateFileName(originalName: string, userId: string): string {
  const ext = originalName.split('.').pop() || 'bin'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${userId}/${timestamp}-${random}.${ext}`
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthLite(request)
    if (!auth.ok) return auth.response
    const user = { id: auth.auth.userId } as any

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const title = formData.get('title') as string
    const subject = formData.get('subject') as string
    const resourceType = (formData.get('resource_type') as string) || 'notes'
    const description = (formData.get('description') as string) || ''
    const driveLink = (formData.get('drive_link') as string) || null
    const externalLink = (formData.get('external_link') as string) || null
    const visibility = (formData.get('visibility') as string) || 'campus'

    if (!title?.trim() || !subject?.trim()) {
      return NextResponse.json({ error: 'Title and subject are required' }, { status: 400 })
    }

    let storageProvider = 'link'
    let externalFileUrl = driveLink || externalLink || null
    let externalFileId = null
    let fileSize = null
    let mimeType = null

    if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 400 })
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: 'File type not allowed. Please upload PDF, DOC, DOCX, PPT, PPTX, JPEG, PNG, WebP, or TXT.' },
          { status: 400 }
        )
      }

      const fileName = generateFileName(file.name, user.id)
      const fileBuffer = await file.arrayBuffer()
      const admin = getSupabaseAdmin()

      // Ensure bucket exists (best effort)
      await admin.storage.createBucket(BUCKET_NAME, { public: true }).catch(() => {})

      const { data, error } = await admin.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
          contentType: file.type,
          upsert: true
        })

      if (error) {
        throw new Error('Supabase Storage Upload failed: ' + error.message)
      }

      const { data: publicUrlData } = admin.storage.from(BUCKET_NAME).getPublicUrl(fileName)

      storageProvider = 'supabase'
      externalFileUrl = publicUrlData.publicUrl
      externalFileId = fileName
      fileSize = file.size
      mimeType = file.type
    }

    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('campus_id, college_id, department_id')
      .eq('id', user.id)
      .single()

    const { data: grants } = await getSupabaseAdmin().rpc('my_admin_grants')
    const grantsArr = (grants as any[]) || []
    const isAdmin = grantsArr.length > 0

    const { data: noteRow, error: insertError } = await getSupabaseAdmin()
      .from('notes')
      .insert({
        uploaded_by: user.id,
        campus_id: profile?.campus_id || null,
        college_id: profile?.college_id || null,
        department_id: profile?.department_id || null,
        title: title.trim(),
        subject: subject.trim(),
        resource_type: resourceType,
        description: description || null,
        drive_link: storageProvider === 'link' ? driveLink || null : null,
        external_link: storageProvider === 'link' ? externalLink || null : null,
        storage_provider: storageProvider,
        external_file_url: externalFileUrl,
        external_file_id: externalFileId,
        file_size: fileSize,
        mime_type: mimeType,
        visibility: profile?.campus_id ? visibility : 'global',
        is_verified: isAdmin,
      })
      .select('id')
      .single()

    if (insertError) {
      if (storageProvider === 'supabase' && externalFileId) {
        await getSupabaseAdmin().storage.from(BUCKET_NAME).remove([externalFileId]).catch(() => {})
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    try {
      await getSupabaseAdmin().rpc('reward_note_upload', { p_note_id: noteRow?.id })
    } catch {}

    return NextResponse.json({
      success: true,
      note_id: noteRow?.id,
      storage_provider: storageProvider,
      is_verified: isAdmin,
      message: isAdmin ? 'Note uploaded and auto-verified!' : 'Note submitted! It will be visible after admin review.',
    })
  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}
