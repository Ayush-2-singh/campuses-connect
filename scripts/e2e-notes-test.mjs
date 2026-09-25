/**
 * Definitive E2E test for the notes upload flow (run from repo root):
 *   node scripts/e2e-notes-test.mjs
 *
 * Simulates the real browser flow exactly:
 *   1. create a test user (service role)
 *   2. POST /auth/v1/token?grant_type=password  (what signInWithPassword does)
 *   3. build the @supabase/ssr session cookie (base64-<base64url JSON>)
 *   4. POST /api/notes/upload with that cookie against the live site
 *   5. verify the row in the DB, then clean up (delete note + user)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// ── load env from .env.local (never pasted anywhere) ──
const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const ref = SUPABASE_URL.replace(/^https:\/\//, '').split('.')[0]
const SITE = 'https://www.connecttocampus.com'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const email = `notes-e2e-${Date.now()}@connecttocampus-test.com`
const password = `E2e-${Date.now()}-Pass!`

// 1. Create the test user
console.log('1) create test user…')
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
  password,
})
if (createErr) { console.error('   ❌', createErr.message); process.exit(2) }
console.log('   ✅', created.user.id)

try {
  // 2. Password grant — exactly what the login page's signInWithPassword does
  console.log('2) password grant → session…')
  const grantRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!grantRes.ok) {
    console.error('   ❌ grant failed:', grantRes.status, (await grantRes.text()).slice(0, 300))
    process.exit(3)
  }
  const session = await grantRes.json()
  console.log('   ✅ got session, user:', session.user?.id)

  // 3. Build the @supabase/ssr session cookie (base64url of the session JSON)
  const json = JSON.stringify(session)
  const b64 = Buffer.from(json, 'utf8').toString('base64url')
  const cookieName = `sb-${ref}-auth-token`
  const cookieValue = `base64-${b64}`
  const cookieHeader = `${cookieName}=${cookieValue}`
  console.log(`   cookie: ${cookieName} (value length ${cookieValue.length})`)

  // 4. POST the note through the live API with the session cookie
  console.log('4) POST /api/notes/upload…')
  const postOut = execSync(
    `curl -s -w '\\nHTTP:%{http_code}' -X POST ${SITE}/api/notes/upload ` +
      `-H 'Cookie: ${cookieHeader}' ` +
      `-F 'title=E2E Test Note' -F 'subject=testing' -F 'resource_type=notes' ` +
      `-F 'description=e2e probe' -F 'drive_link=https://example.com/e2e-doc' ` +
      `-F 'external_link=' -F 'visibility=campus'`,
    { encoding: 'utf8' }
  )
  console.log('   →', postOut)

  // 5. Verify the row landed
  console.log('5) check row in DB…')
  const { data: row } = await admin.from('notes').select('id, title, is_verified, uploaded_by').eq('title', 'E2E Test Note').maybeSingle()
  console.log('   →', row ? `✅ row exists: ${row.id}` : '❌ row NOT found')
  if (!row) process.exit(4)

  // 6. Also verify the notes list query the page runs returns it
  console.log('6) page list query (select with profiles join)…')
  const { data: listed, error: listErr } = await admin
    .from('notes')
    .select('*, profiles!notes_uploaded_by_fkey(full_name, username)')
    .order('created_at', { ascending: false })
    .limit(5)
  console.log('   →', listErr ? `❌ ${listErr.message}` : `✅ list OK (${listed?.length} rows, newest: ${listed?.[0]?.title})`)
} finally {
  // 7. Cleanup
  console.log('7) cleanup…')
  await admin.from('notes').delete().eq('title', 'E2E Test Note')
  const { error: delErr } = await admin.auth.admin.deleteUser(created.user.id)
  console.log('   ', delErr ? `❌ ${delErr.message}` : '✅ test user deleted, test note removed')
}
