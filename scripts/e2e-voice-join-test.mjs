/**
 * Definitive E2E test for the voice-room join flow (run from repo root):
 *   node scripts/e2e-voice-join-test.mjs
 *
 * Simulates the real browser flow exactly, against PRODUCTION:
 *   1. create a test user (service role)
 *   2. password grant → session JWT (what signInWithPassword does)
 *   3. create a global voice room  (create_live_voice_chat_group)
 *   4. join the room               (join_live_voice_chat_group(p_group_id, p_password))
 *      ← this is the call that 404'd with PGRST202 before the 20260929
 *        migration was applied to production
 *   5. start a call                (start_live_voice_chat_call)
 *   6. join the call               (join_live_voice_chat_call)
 *   7. POST /api/live-voice-chat/token on the live site with the JWT
 *      → expects 200 + a LiveKit JWT + a wss:// url (the exact hop that
 *        hands the browser its voice connection)
 *   8. clean up (delete group + user)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

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
const SITE = env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const email = `voice-e2e-${Date.now()}@connecttocampus-test.com`
const password = `E2e-${Date.now()}-Pass!`
let groupId = null

function decodeJwtPayload(jwt) {
  try {
    const part = jwt.split('.')[1]
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

try {
  // 1. Create the test user
  console.log('1) create test user…')
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  })
  if (createErr) {
    console.error('   ❌', createErr.message)
    process.exit(2)
  }
  const userId = created.user.id
  console.log('   ✅', userId)

  // 2. Password grant
  console.log('2) password grant → session…')
  const grantRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const grant = await grantRes.json()
  if (!grantRes.ok || !grant.access_token) {
    console.error('   ❌', JSON.stringify(grant).slice(0, 200))
    throw new Error('password grant failed')
  }
  const jwt = grant.access_token
  console.log('   ✅ session acquired')

  const rpc = (name, args) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    }).then(async (r) => ({ status: r.status, body: await r.text() }))

  // 3. Create a global voice room
  console.log('3) create_live_voice_chat_group…')
  const created3 = await rpc('create_live_voice_chat_group', {
    p_name: `E2E Voice ${Date.now()}`,
    p_description: 'temporary e2e room',
    p_icon: 'mic',
    p_scope: 'global',
  })
  if (created3.status !== 200) throw new Error(`create group: ${created3.status} ${created3.body.slice(0, 200)}`)
  groupId = JSON.parse(created3.body)
  console.log('   ✅ group', groupId)

  // 4. Join the room — the previously-broken 2-arg call
  console.log('4) join_live_voice_chat_group(p_group_id, p_password) ← the PGRST202 call…')
  const joined = await rpc('join_live_voice_chat_group', { p_group_id: groupId, p_password: null })
  if (joined.status !== 200) throw new Error(`join group: ${joined.status} ${joined.body.slice(0, 200)}`)
  if (joined.body !== 'true') throw new Error(`join group returned ${joined.body} (expected true)`)
  console.log('   ✅ joined (was the failing call in production)')

  // 5. Start a call
  console.log('5) start_live_voice_chat_call…')
  const started = await rpc('start_live_voice_chat_call', { p_group_id: groupId })
  if (started.status !== 200) throw new Error(`start call: ${started.status} ${started.body.slice(0, 200)}`)
  const callId = JSON.parse(started.body)
  console.log('   ✅ call', callId)

  // 6. Join the call
  console.log('6) join_live_voice_chat_call…')
  const joinedCall = await rpc('join_live_voice_chat_call', { p_call_id: callId })
  if (joinedCall.status !== 200) throw new Error(`join call: ${joinedCall.status} ${joinedCall.body.slice(0, 200)}`)
  console.log('   ✅ participant row created')

  // 7. Token endpoint on the live site — the hop that connects the browser to LiveKit
  console.log(`7) POST ${SITE}/api/live-voice-chat/token…`)
  const tokenRes = await fetch(`${SITE}/api/live-voice-chat/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ callId }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok) throw new Error(`token endpoint: ${tokenRes.status} ${JSON.stringify(tokenJson).slice(0, 200)}`)
  const claims = decodeJwtPayload(tokenJson.token)
  if (!claims?.video?.room) throw new Error('token response missing a LiveKit JWT with a video.room claim')
  const roomClaim = claims.video.room
  const identity = claims.sub
  console.log('   ✅ token issued — room:', roomClaim, '| identity:', identity.slice(0, 8) + '…')
  console.log('   ✅ wss url:', tokenJson.url || '(missing!)')
  if (!tokenJson.url || !String(tokenJson.url).startsWith('wss://')) {
    throw new Error('LiveKit url missing or not wss:// — browser join would fail here')
  }
  if (roomClaim !== `live-voice-chat-${callId}`) throw new Error(`unexpected room claim: ${roomClaim}`)
  if (identity !== userId) throw new Error('token identity does not match the caller')

  console.log('\n🎉 E2E PASSED — room join, call join and LiveKit token issuance all work in production.')
} catch (err) {
  console.error('\n❌ E2E FAILED:', String(err.message ?? err).slice(0, 400))
  process.exitCode = 3
} finally {
  // 8. Cleanup (service role bypasses RLS; FK cascade removes call/participants/members)
  if (groupId) {
    const del = await admin.from('live_voice_chat_groups').delete().eq('id', groupId)
    console.log(del.error ? 'cleanup group ❌' : 'cleanup group ✅')
  }
  const { data: u } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
  void u
  const { error: delU } = await admin.auth.admin.deleteUser(
    (
      await admin.auth.admin.listUsers()
    ).data.users.find((x) => x.email === email)?.id ??
      (
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        }).then((r) => r.json())
      )?.users?.[0]?.id
  )
  console.log(delU ? `cleanup user ⚠️ ${delU.message}` : 'cleanup user ✅')
}
