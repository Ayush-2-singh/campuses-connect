import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireAuthLite } from '@/lib/api/middleware'

// ── Lazy init clients ───────────────────────────────────────
let _supabaseAdmin: SupabaseClient | null = null
let _r2Client: S3Client | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin
}

function getR2Client(): S3Client {
  if (!_r2Client) {
    _r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _r2Client
}

// ── Constants ───────────────────────────────────────────────
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
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'campus-notes'

// ── Generate unique filename ─────────────────────────────────
function generateFileName(originalName: string, userId: string): string {
  const ext = originalName.split('.').pop() || 'bin'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `notes/${userId}/${timestamp}-${random}.${ext}`
}

// ── POST /api/notes/upload ───────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Verify user
    const auth = await requireAuthLite()
    if (!auth.ok) return auth.response
    const user = { id: auth.auth.userId } as any

    // 2. Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const title = formData.get('title') as string
    const subject = formData.get('subject') as string
    const resourceType = (formData.get('resource_type') as string) || 'notes'
    const description = (formData.get('description') as string) || ''
    const driveLink = (formData.get('drive_link') as string) || null
    const externalLink = (formData.get('external_link') as string) || null
    const visibility = (formData.get('visibility') as string) || 'campus'

    // 3. Validate required fields
    if (!title?.trim() || !subject?.trim()) {
      return NextResponse.json({ error: 'Title and subject are required' }, { status: 400 })
    }

    // 4. Handle file upload OR link-only submission
    let storageProvider = 'link'
    let externalFileUrl = driveLink || externalLink || null
    let externalFileId = null
    let fileSize = null
    let mimeType = null

    if (file && file.size > 0) {
      // Validate file
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 400 })
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: 'File type not allowed. Please upload PDF, DOC, DOCX, PPT, PPTX, JPEG, PNG, WebP, or TXT.' },
          { status: 400 }
        )
      }

      // Upload to R2
      const fileName = generateFileName(file.name, user.id)
      const fileBuffer = await file.arrayBuffer()

      const r2 = getR2Client()
      await r2.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: fileName,
          Body: Buffer.from(fileBuffer),
          ContentType: file.type,
          Metadata: {
            user_id: user.id,
            title: title.trim(),
          },
        })
      )

      // Generate public URL
      storageProvider = 'r2'
      externalFileUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`
      externalFileId = fileName
      fileSize = file.size
      mimeType = file.type
    }

    // 5. Get user profile
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('campus_id, college_id, department_id')
      .eq('id', user.id)
      .single()

    // 6. Check admin status
    const { data: grants } = await getSupabaseAdmin().rpc('my_admin_grants')
    const grantsArr = (grants as any[]) || []
    const isAdmin = grantsArr.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin')

    // 7. Insert metadata
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
        // New fields for external storage
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
      // If file was uploaded but DB insert failed, try to clean up
      if (storageProvider === 'r2' && externalFileId) {
        try {
          const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
          const r2 = getR2Client()
          await r2.send(
            new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: externalFileId,
            })
          )
        } catch {
          // Best effort cleanup
        }
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // 8. Reward upload
    try {
      await getSupabaseAdmin().rpc('reward_note_upload', { p_note_id: noteRow?.id })
    } catch {
      // Ignore - reward is optional
    }

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
