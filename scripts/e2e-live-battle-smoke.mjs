/**
 * Live Battle smoke test (run from repo root):
 *   node scripts/e2e-live-battle-smoke.mjs
 *
 * Creates a throwaway host, player and platform admin, then exercises the
 * live-quiz RPCs end to end against the project the app's env already points at:
 *   create → room code → join → rejoin → host-only controls flag → start →
 *   question without the answer key → answer → duplicate refused → early
 *   reveal refused → finalise → leaderboard → key released after the window.
 *
 * The `is_host` assertions cover migration 20261121 (host controls belong to
 * the account that hosted the competition, not to platform admins).
 * Everything created here is deleted in the `finally` block.
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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

let passed = 0
let failed = 0
const failures = []
function check(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`   ✅ ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`   ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const stamp = Date.now()
const password = `Smoke-${stamp}-Pass!`

async function makeUser(role) {
  const email = `lb-smoke-${role}-${stamp}@connecttocampus-test.com`
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password })
  if (error) throw new Error(`createUser(${role}): ${error.message}`)
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = await res.json()
  if (!session.access_token) throw new Error(`sign-in(${role}) failed: ${JSON.stringify(session).slice(0, 300)}`)
  return { id: data.user.id, email, jwt: session.access_token }
}

/** POST an RPC as a given JWT (PostgREST). */
async function rpc(jwt, fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, ok: res.ok, body }
}

/** A `RETURNS public.competitions` RPC arrives as an array of rows. */
const row = (body) => (Array.isArray(body) ? body[0] : body)

let host
let player
let adminUser
let competitionId = null
let bankQuestionId = null

try {
  console.log('1) throwaway users…')
  host = await makeUser('host')
  player = await makeUser('player')
  adminUser = await makeUser('admin')
  const grant = await admin
    .from('admin_grants')
    .insert({ user_id: adminUser.id, admin_type: 'platform_admin' })
  if (grant.error) throw new Error(`grant admin: ${grant.error.message}`)
  console.log('   ✅ host / player / platform admin ready')

  console.log('2) one-question bank row…')
  const bank = await admin
    .from('question_bank')
    .insert({
      created_by: host.id,
      subject: 'Smoke',
      difficulty: 'easy',
      question_type: 'single',
      question_text: 'Live Battle smoke: what is 2 + 2?',
      marks: 100,
      time_limit_seconds: 20,
    })
    .select('id')
    .single()
  if (bank.error) throw new Error(`question_bank: ${bank.error.message}`)
  bankQuestionId = bank.data.id
  const options = await admin.from('question_bank_options').insert([
    { question_id: bankQuestionId, position: 0, option_text: '4', is_correct: true },
    { question_id: bankQuestionId, position: 1, option_text: '5', is_correct: false },
  ])
  if (options.error) throw new Error(`question_bank_options: ${options.error.message}`)
  console.log('   ✅ bank question + 2 options')

  console.log('3) host creates the room…')
  const created = await rpc(host.jwt, 'live_quiz_create', {
    p_title: 'Smoke Live Battle',
    p_question_ids: [bankQuestionId],
    p_category: 'Smoke',
    p_timer_seconds: 20,
    p_points_correct: 100,
    p_max_speed_bonus: 20,
    p_max_participants: 50,
    p_allow_late_join: true,
    p_visibility: 'code_only',
  })
  const comp = row(created.body)
  if (!comp?.id) throw new Error(`live_quiz_create failed: ${created.status} ${JSON.stringify(created.body).slice(0, 400)}`)
  competitionId = comp.id
  check('create succeeds', created.status === 200)
  check('room code is six digits', /^\d{6}$/.test(comp.room_code ?? ''), comp.room_code)
  check('question snapshot copied', comp.question_count === 1, String(comp.question_count))

  console.log('4) room view + join…')
  const hostRoom = row((await rpc(host.jwt, 'live_quiz_room', { p_competition_id: competitionId })).body)
  check('host sees is_host = true', hostRoom?.ok === true && hostRoom?.is_host === true, JSON.stringify(hostRoom))

  const joined = (await rpc(player.jwt, 'live_quiz_join', { p_room_code: comp.room_code })).body
  check('player joins', joined?.ok === true && joined?.rejoined === false, JSON.stringify(joined))

  const rejoined = (await rpc(player.jwt, 'live_quiz_join', { p_room_code: comp.room_code })).body
  check(
    'rejoin reuses the same participant',
    rejoined?.ok === true && rejoined?.rejoined === true && rejoined?.participant_id === joined?.participant_id,
    JSON.stringify(rejoined)
  )

  const playerRoom = row((await rpc(player.jwt, 'live_quiz_room', { p_competition_id: competitionId })).body)
  check('player does not get host controls', playerRoom?.ok === true && playerRoom?.is_host === false)

  const adminRoom = row((await rpc(adminUser.jwt, 'live_quiz_room', { p_competition_id: competitionId })).body)
  check(
    'platform admin can watch but is NOT host (20261121)',
    adminRoom?.ok === true && adminRoom?.is_host === false,
    JSON.stringify(adminRoom)
  )

  console.log('5) host-only advance…')
  const playerStart = await rpc(player.jwt, 'live_quiz_advance', {
    p_competition_id: competitionId,
    p_action: 'start',
  })
  check('non-host cannot start', !playerStart.ok, `${playerStart.status} ${JSON.stringify(playerStart.body)}`)

  const started = (await rpc(host.jwt, 'live_quiz_advance', { p_competition_id: competitionId, p_action: 'start' })).body
  check('host starts the room', started?.ok === true && started?.status === 'live', JSON.stringify(started))

  console.log('6) question without the answer key…')
  const q = (await rpc(player.jwt, 'live_quiz_question', { p_competition_id: competitionId })).body
  check('question served', q?.ok === true && Boolean(q?.question?.text), JSON.stringify(q).slice(0, 300))
  check('options carry no answer key', (q?.options ?? []).every((o) => !('is_correct' in o) && !('correct' in o)))
  check('deadline from the server', Boolean(q?.deadline))

  console.log('7) RLS on the snapshot…')
  const optionProbe = await fetch(
    `${SUPABASE_URL}/rest/v1/competition_question_options?select=id,is_correct&limit=5`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${player.jwt}` } }
  )
  const optionRows = await optionProbe.json()
  check('player cannot read competition_question_options', optionProbe.ok && Array.isArray(optionRows) && optionRows.length === 0)

  console.log('8) answer, duplicate, early reveal…')
  const snap = await admin
    .from('competition_questions')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('position', 0)
    .single()
  if (snap.error) throw new Error(`snapshot lookup: ${snap.error.message}`)
  const correct = await admin
    .from('competition_question_options')
    .select('position')
    .eq('competition_question_id', snap.data.id)
    .eq('is_correct', true)
  const correctPositions = (correct.data ?? []).map((o) => o.position)
  check('service role can read the key', correctPositions.length === 1, JSON.stringify(correctPositions))

  // Valid ids, so a rejection is RLS and not a foreign-key error.
  const answerProbe = await fetch(`${SUPABASE_URL}/rest/v1/competition_answers`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${player.jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      competition_id: competitionId,
      competition_question_id: snap.data.id,
      participant_id: joined.participant_id,
      selected_positions: correctPositions,
    }),
  })
  check('player cannot insert competition_answers', !answerProbe.ok, `${answerProbe.status}`)

  const answered = (await rpc(player.jwt, 'live_quiz_answer', {
    p_competition_id: competitionId,
    p_positions: correctPositions,
  })).body
  check('correct answer accepted', answered?.ok === true, JSON.stringify(answered))

  const duplicate = (await rpc(player.jwt, 'live_quiz_answer', {
    p_competition_id: competitionId,
    p_positions: correctPositions,
  })).body
  check('duplicate answer refused', duplicate?.ok === false && duplicate?.error === 'already_answered', JSON.stringify(duplicate))

  const earlyReveal = (await rpc(player.jwt, 'live_quiz_reveal', { p_competition_id: competitionId })).body
  check('early reveal refused', earlyReveal?.ok === false && earlyReveal?.error === 'window_still_open', JSON.stringify(earlyReveal))

  console.log('9) finalise + leaderboard…')
  const next = (await rpc(host.jwt, 'live_quiz_advance', { p_competition_id: competitionId, p_action: 'next' })).body
  check('next on the last question finalises', next?.ok === true && next?.status === 'completed', JSON.stringify(next))

  const board = (await rpc(player.jwt, 'live_quiz_leaderboard', { p_competition_id: competitionId, p_limit: 10 })).body
  const top = board?.top?.[0]
  check('leaderboard rank 1', board?.ok === true && top?.rank === 1, JSON.stringify(top))
  check('score = marks + speed bonus', top?.score >= 100, String(top?.score))
  check('accuracy 100%', board?.me?.accuracy === 100, JSON.stringify(board?.me))

  const reveal = (await rpc(player.jwt, 'live_quiz_reveal', { p_competition_id: competitionId })).body
  check(
    'key released after the window',
    reveal?.ok === true && correctPositions.every((p) => (reveal.correct_positions ?? []).includes(p)),
    JSON.stringify(reveal)
  )

  const finalPlayerRoom = row((await rpc(player.jwt, 'live_quiz_room', { p_competition_id: competitionId })).body)
  check('completed room still hides host controls from players', finalPlayerRoom?.status === 'completed' && finalPlayerRoom?.is_host === false)
  const finalHostRoom = row((await rpc(host.jwt, 'live_quiz_room', { p_competition_id: competitionId })).body)
  check('host keeps is_host after the room ends', finalHostRoom?.is_host === true)
} catch (err) {
  failed++
  failures.push(String(err?.message ?? err))
  console.error('\n💥', String(err?.message ?? err))
} finally {
  console.log('\ncleanup…')
  if (competitionId) await admin.from('competitions').delete().eq('id', competitionId)
  if (bankQuestionId) await admin.from('question_bank').delete().eq('id', bankQuestionId)
  for (const u of [host, player, adminUser]) {
    if (!u) continue
    await admin.from('admin_grants').delete().eq('user_id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
  console.log('   ✅ removed test room, bank row and users')
}

console.log(`\n${passed}/${passed + failed} checks passed`)
if (failed > 0) {
  console.error(`Failed: ${failures.join(' | ')}`)
  process.exit(2)
}
console.log('✅ live battle smoke test passed')
