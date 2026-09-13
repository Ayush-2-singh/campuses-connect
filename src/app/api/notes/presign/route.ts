import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
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

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'campus-notes'
const PRESIGN_EXPIRY = 3600 // 1 hour

// ── GET /api/notes/presign?file_path=xxx ─────────────────────
export async function GET(request: NextRequest) {
  try {
    // 1. Verify user
    const auth = await requireAuthLite()
    if (!auth.ok) return auth.response

    // 2. Get file path
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('file_path')

    if (!filePath) {
      return NextResponse.json({ error: 'file_path required' }, { status: 400 })
    }

    // 3. Validate path (prevent path traversal)
    if (filePath.includes('..') || !filePath.startsWith('notes/')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }

    // 4. Generate presigned URL
    const r2 = getR2Client()
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
    })

    const presignedUrl = await getSignedUrl(r2, command, {
      expiresIn: PRESIGN_EXPIRY,
    })

    return NextResponse.json({ url: presignedUrl })
  } catch (err: any) {
    console.error('Presign error:', err)
    return NextResponse.json({ error: err.message || 'Failed to generate URL' }, { status: 500 })
  }
}
