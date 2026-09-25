/**
 * E2E test for confession hearts + blog likes (run from repo root):
 *   node scripts/e2e-reactions-test.mjs
 *
 * Creates a test user, then as that user (JWT against PostgREST):
 *   1. create_confession → toggle_confession_reaction ×2 → counts 0→1→0
 *   2. insert blog post → toggle_blog_like ×2 → like_count 0→1→0
 * Cleans up everything afterwards.
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

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const email = `react-e2e-${Date.now()}@connecttocampus-test.com`
const password = `E2e-${Date.now()}-Pass!`

// ── test user + JWT ──
console.log('1) test user + session…')
const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true, password })
if (createErr) { console.error('   ❌', createErr.message); process.exit(2) }
const grantRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const session = await grantRes.json()
const JWT = session.access_token
console.log('   ✅', created.user.id, '| JWT:', JWT ? 'ok' : 'MISSING')

// REST helper as the user
const rpc = async (fn, args) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

let exitCode = 0
try {
  // ── confession heart ──
  console.log('2) create_confession…')
  const conf = await rpc('create_confession', { p_body: 'E2E reaction probe — please ignore' })
  if (conf.status !== 200) { console.error('   ❌', conf.status, conf.body); process.exit(3) }
  const confessionId = conf.body
  console.log('   ✅ confession:', confessionId)

  console.log('3) toggle heart ON…')
  const on = await rpc('toggle_confession_reaction', { p_confession_id: confessionId })
  console.log('   →', on.status, JSON.stringify(on.body))
  // PostgREST returns SETOF/TABLE functions as an array of rows
  const onRow = Array.isArray(on.body) ? on.body[0] : on.body
  const onOk = on.status === 200 && onRow?.reacted === true && onRow?.reaction_count === 1

  console.log('4) toggle heart OFF…')
  const off = await rpc('toggle_confession_reaction', { p_confession_id: confessionId })
  console.log('   →', off.status, JSON.stringify(off.body))
  const offRow = Array.isArray(off.body) ? off.body[0] : off.body
  const offOk = off.status === 200 && offRow?.reacted === false && offRow?.reaction_count === 0

  console.log(onOk && offOk ? '   ✅ confession heart 0→1→0 works' : '   ❌ confession heart BROKEN')

  // ── blog like ──
  console.log('5) insert blog post…')
  const postRes = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY, Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({
      author_id: created.user.id, title: 'E2E Reaction Probe', slug: `e2e-reaction-probe-${Date.now()}`,
      body: 'probe body', status: 'published', published_at: new Date().toISOString(),
    }),
  })
  const post = await postRes.json()
  if (!postRes.ok) { console.error('   ❌', postRes.status, JSON.stringify(post).slice(0, 300)); process.exit(4) }
  const postId = post[0].id
  console.log('   ✅ post:', postId)

  console.log('6) toggle_blog_like ON…')
  const likeOn = await rpc('toggle_blog_like', { p_post_id: postId })
  console.log('   →', likeOn.status, JSON.stringify(likeOn.body))
  console.log('7) toggle_blog_like OFF…')
  const likeOff = await rpc('toggle_blog_like', { p_post_id: postId })
  console.log('   →', likeOff.status, JSON.stringify(likeOff.body))
  const likeOk = likeOn.status === 200 && likeOn.body === true && likeOff.status === 200 && likeOff.body === false
  console.log(likeOk ? '   ✅ blog like toggle works' : '   ❌ blog like BROKEN')

  // final DB state
  const { data: finalPost } = await admin.from('blog_posts').select('like_count, view_count').eq('id', postId).single()
  console.log('   blog_posts.like_count after 2 toggles:', finalPost?.like_count, '(expect 0)')

  if (!(onOk && offOk && likeOk)) exitCode = 5
} finally {
  console.log('8) cleanup…')
  await admin.from('blog_posts').delete().eq('author_id', created.user.id)
  await admin.from('confessions').delete().eq('author_id', created.user.id)
  const { error: delErr } = await admin.auth.admin.deleteUser(created.user.id)
  console.log('   ', delErr ? `❌ ${delErr.message}` : '✅ cleaned')
}
process.exit(exitCode)
