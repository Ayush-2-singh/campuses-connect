/**
 * Quiz platform smoke test (run from repo root):
 *   node scripts/e2e-quiz-platform-smoke.mjs
 *
 * DB/RPC layer for the quiz work: the checks that cannot be made from unit
 * tests because they depend on RLS, triggers, advisory locks and concurrency.
 *
 *   A. anonymous surface      — room_code is unreachable; the public view has no secrets
 *   B. room caps (S5)         — a host cannot open unlimited rooms
 *   C. join throttle (S2)     — one identical failure shape, then a throttle
 *   D. capacity race (S4)     — concurrent joins never exceed max_participants
 *   E. answer race (S3)       — a double submit is `already_answered`, never 23505
 *   F. quiz library + practice — publish validation, no answer key, idempotent answers
 *   G. fork                   — a fork owns its own copy of the questions
 *   H. AI review              — invalid drafts are dropped; nothing publishes itself
 *
 * Creates throwaway users/questions/rooms and deletes them in `finally`.
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

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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
const createdUsers = []
const createdRooms = []
const createdQuizzes = []
const createdJobs = []

async function makeUser(role) {
  const email = `quiz-smoke-${role}-${stamp}@connecttocampus-test.com`
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password })
  if (error) throw new Error(`createUser(${role}): ${error.message}`)
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = await res.json()
  if (!session.access_token) throw new Error(`sign-in(${role}) failed: ${JSON.stringify(session).slice(0, 300)}`)
  createdUsers.push(data.user.id)
  return { id: data.user.id, email, jwt: session.access_token }
}

async function rpc(jwt, fn, args = {}) {
  const headers = { apikey: ANON_KEY, 'Content-Type': 'application/json' }
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
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

async function rest(jwt, path, init = {}) {
  const headers = { apikey: ANON_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) }
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, ok: res.ok, body }
}

const row = (body) => (Array.isArray(body) ? body[0] : body)

/** Insert a bank question with two options; option 0 is correct. */
async function makeQuestion(user) {
  const inserted = await rest(user.jwt, 'question_bank', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      created_by: user.id,
      subject: 'Smoke',
      question_type: 'single',
      question_text: `Smoke question ${stamp} ${Math.random().toString(36).slice(2, 8)}?`,
      marks: 100,
      time_limit_seconds: 20,
    }),
  })
  const question = row(inserted.body)
  if (!question?.id) throw new Error(`question insert failed: ${inserted.status} ${JSON.stringify(inserted.body)}`)

  const options = await rest(user.jwt, 'question_bank_options', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([
      { question_id: question.id, position: 0, option_text: 'Correct', is_correct: true },
      { question_id: question.id, position: 1, option_text: 'Wrong', is_correct: false },
    ]),
  })
  if (!options.ok) throw new Error(`option insert failed: ${options.status} ${JSON.stringify(options.body)}`)
  return question
}

async function main() {
  console.log('\n=== A. anonymous surface (S1)')
  {
    const roomCodes = await rest(null, 'competitions?select=room_code')
    check('anon cannot select room_code from competitions', Array.isArray(roomCodes.body) && roomCodes.body.length === 0, JSON.stringify(roomCodes.body).slice(0, 120))

    const viewRoomCode = await rest(null, 'competitions_public?select=room_code')
    check('competitions_public has no room_code column', !viewRoomCode.ok, `HTTP ${viewRoomCode.status}`)

    const viewHost = await rest(null, 'competitions_public?select=host_id')
    check('competitions_public has no host_id column', !viewHost.ok, `HTTP ${viewHost.status}`)

    const viewSafe = await rest(null, 'competitions_public?select=id,title,status')
    check('competitions_public is readable by anon', viewSafe.ok, `HTTP ${viewSafe.status}`)

    const anonJoin = await rpc(null, 'live_quiz_join', { p_room_code: '000000' })
    // 28000 surfaces as 403 through PostgREST; 401/404 would also be a refusal.
    check('anon cannot execute live_quiz_join', [401, 403, 404].includes(anonJoin.status), `HTTP ${anonJoin.status}`)
  }

  const host = await makeUser('host')
  const bankQuestion = await makeQuestion(host)

  console.log('\n=== B. host room caps (S5)')
  let room = null
  {
    const first = await rpc(host.jwt, 'live_quiz_create', {
      p_title: `Smoke room ${stamp}`,
      p_question_ids: [bankQuestion.id],
      p_max_participants: 3,
      p_timer_seconds: 20,
    })
    room = row(first.body)
    check('first room is created', Boolean(room?.room_code), `HTTP ${first.status} ${JSON.stringify(first.body).slice(0, 160)}`)
    if (room?.id) createdRooms.push(room.id)

    const second = await rpc(host.jwt, 'live_quiz_create', {
      p_title: `Smoke room b ${stamp}`,
      p_question_ids: [bankQuestion.id],
    })
    if (row(second.body)?.id) createdRooms.push(row(second.body).id)

    const third = await rpc(host.jwt, 'live_quiz_create', {
      p_title: `Smoke room c ${stamp}`,
      p_question_ids: [bankQuestion.id],
    })
    if (row(third.body)?.id) createdRooms.push(row(third.body).id)

    const fourth = await rpc(host.jwt, 'live_quiz_create', {
      p_title: `Smoke room d ${stamp}`,
      p_question_ids: [bankQuestion.id],
    })
    check(
      'fourth concurrent room is refused by the cap',
      fourth.status >= 400 && /room limit reached/i.test(JSON.stringify(fourth.body)),
      `HTTP ${fourth.status} ${JSON.stringify(fourth.body).slice(0, 160)}`
    )
  }

  const players = []
  for (let i = 0; i < 5; i++) players.push(await makeUser(`player${i}`))

  console.log('\n=== C. join throttle (S2)')
  {
    // a separate account, so the brute-force run cannot skew the capacity test
    const probe = await makeUser('bruteforcer')
    const missing = await rpc(probe.jwt, 'live_quiz_join', { p_room_code: '000000' })
    check(
      'missing room answers with the generic shape',
      missing.body?.ok === false && missing.body?.error === 'invalid_or_unavailable',
      JSON.stringify(missing.body).slice(0, 160)
    )

    // The reply no longer carries a `throttled` flag, so prove the throttle
    // behaviourally: once the window is full, even the CORRECT code is refused.
    for (let i = 0; i < 14; i++) {
      await rpc(probe.jwt, 'live_quiz_join', { p_room_code: '999999' })
    }

    const legitimate = await rpc(probe.jwt, 'live_quiz_join', { p_room_code: room.room_code })
    check(
      'repeat failures block even a valid room code',
      legitimate.body?.ok === false && legitimate.body?.error === 'invalid_or_unavailable',
      JSON.stringify(legitimate.body).slice(0, 160)
    )

    const missingKeys = Object.keys(missing.body ?? {}).sort().join(',')
    const blockedKeys = Object.keys(legitimate.body ?? {}).sort().join(',')
    check('a throttled reply has the same shape as a missing room', missingKeys === blockedKeys, `${missingKeys} vs ${blockedKeys}`)
    check('the reply carries a retry hint', legitimate.body?.retry_after_s > 0, JSON.stringify(legitimate.body).slice(0, 120))

    const stillOpen = await rpc(players[0].jwt, 'live_quiz_join', { p_room_code: room.room_code })
    check('another student behind the same IP can still join', stillOpen.body?.ok === true, JSON.stringify(stillOpen.body).slice(0, 160))

    // free the slot again so the capacity test below starts from an empty room
    await admin.from('competition_participants').delete().eq('competition_id', room.id)
  }

  console.log('\n=== D. capacity race (S4)')
  let joinedPlayerIndex = 1
  const joinedEmails = new Set()
  {
    const results = await Promise.all(
      players.map((player) =>
        rpc(player.jwt, 'live_quiz_join', { p_room_code: room.room_code, p_display_name: `P ${player.email.slice(0, 6)}` })
      )
    )
    const firstJoined = results.findIndex((r) => r.body?.ok === true)
    if (firstJoined >= 0) joinedPlayerIndex = firstJoined
    results.forEach((r, i) => {
      if (r.body?.ok === true) joinedEmails.add(players[i].email)
    })
    const joined = results.filter((r) => r.body?.ok === true)
    const refused = results.filter((r) => r.body?.ok === false)
    check('exactly max_participants joins succeed under concurrency', joined.length === 3, `joined=${joined.length}`)
    check('the rest fail with the generic shape', refused.length === 5 - 3 && refused.every((r) => r.body?.error === 'invalid_or_unavailable'))

    // anon has no read policy here, so count as service role
    const rowCount = await admin.from('competition_participants').select('id').eq('competition_id', room.id)
    check('database holds exactly 3 participants', (rowCount.data ?? []).length === 3, `rows=${(rowCount.data ?? []).length}${rowCount.error ? ` ${rowCount.error.message}` : ''}`)
  }

  console.log('\n=== E. answer race (S3)')
  {
    const started = await rpc(host.jwt, 'live_quiz_advance', { p_competition_id: room.id, p_action: 'start' })
    check('host starts the room', started.body?.ok === true, JSON.stringify(started.body).slice(0, 160))

    const player = players[joinedPlayerIndex]
    const question = await rpc(player.jwt, 'live_quiz_question', { p_competition_id: room.id })
    check('a participant reads the question', question.body?.ok !== false, JSON.stringify(question.body).slice(0, 160))
    check('the question payload carries no answer key', !JSON.stringify(question.body ?? {}).includes('is_correct'))

    const [a, b] = await Promise.all([
      rpc(player.jwt, 'live_quiz_answer', { p_competition_id: room.id, p_positions: [0] }),
      rpc(player.jwt, 'live_quiz_answer', { p_competition_id: room.id, p_positions: [0] }),
    ])
    const accepted = [a, b].filter((r) => r.body?.ok === true)
    const duplicate = [a, b].filter((r) => r.body?.error === 'already_answered')
    check('one of two concurrent answers is accepted', accepted.length === 1, JSON.stringify([a.body, b.body]).slice(0, 220))
    check('the other is already_answered, not a constraint error', duplicate.length === 1, JSON.stringify([a.body, b.body]).slice(0, 220))
    check('no 5xx from the race', [a, b].every((r) => r.status < 500), `${a.status}/${b.status}`)

    const answers = await admin.from('competition_answers').select('id').eq('competition_id', room.id)
    check('exactly one answer row exists', (answers.data ?? []).length === 1, `rows=${(answers.data ?? []).length}${answers.error ? ` ${answers.error.message}` : ''}`)
  }

  console.log('\n=== E2. rejoin after the room ends (20261120 guarantee)')
  {
    const insider = players[joinedPlayerIndex]
    const ended = await rpc(host.jwt, 'live_quiz_advance', { p_competition_id: room.id, p_action: 'end' })
    check('host ends the room', ended.status < 500, `HTTP ${ended.status} ${JSON.stringify(ended.body ?? {}).slice(0, 160)}`)

    // A participant reloading the results page must never be turned away.
    const back = await rpc(insider.jwt, 'live_quiz_join', { p_room_code: room.room_code })
    check(
      'an existing participant can rejoin a finished room',
      back.body?.ok === true && back.body?.rejoined === true && back.body?.status === 'completed',
      JSON.stringify(back.body ?? {}).slice(0, 200)
    )

    const outsider = players.find((p) => !joinedEmails.has(p.email))
    const refused = await rpc(outsider.jwt, 'live_quiz_join', { p_room_code: room.room_code })
    check(
      'a newcomer is still refused once the room is finished',
      refused.body?.ok === false && refused.body?.error === 'invalid_or_unavailable',
      JSON.stringify(refused.body ?? {}).slice(0, 200)
    )
  }

  console.log('\n=== F. quiz library + practice')
  {
    const empty = await rpc(host.jwt, 'quiz_create', { p_title: `Smoke quiz empty ${stamp}`, p_subject: 'Smoke' })
    const emptyId = empty.body?.quiz_id
    if (emptyId) createdQuizzes.push(emptyId)
    const publishEmpty = await rpc(host.jwt, 'quiz_publish', { p_quiz_id: emptyId })
    check('publishing an empty quiz is refused', publishEmpty.body?.error === 'no_questions', JSON.stringify(publishEmpty.body).slice(0, 140))

    const added = await rpc(host.jwt, 'quiz_add_questions', { p_quiz_id: emptyId, p_question_ids: [bankQuestion.id] })
    check('question is attached to the quiz', added.body?.added === 1, JSON.stringify(added.body).slice(0, 140))

    const published = await rpc(host.jwt, 'quiz_publish', { p_quiz_id: emptyId })
    check('quiz publishes once it has a valid question', published.body?.ok === true, JSON.stringify(published.body).slice(0, 160))

    // a viewer needs a discoverable quiz: the practice checks below are the
    // non-owner path, so publish it publicly first
    await rpc(host.jwt, 'quiz_update', { p_quiz_id: emptyId, p_visibility: 'public' })

    const detail = await rpc(players[0].jwt, 'quiz_detail', { p_quiz_id: emptyId })
    check('a viewer cannot see the answer key in quiz_detail', !JSON.stringify(detail.body ?? {}).includes('"is_correct_positions":['), JSON.stringify(detail.body ?? {}).slice(0, 120))

    const attempt = await rpc(players[0].jwt, 'quiz_attempt_start', { p_quiz_id: emptyId })
    check('practice attempt starts', attempt.body?.ok === true && attempt.body?.questions?.length === 1, JSON.stringify(attempt.body).slice(0, 160))
    check('the practice paper carries no answer key', !JSON.stringify(attempt.body ?? {}).includes('is_correct'))

    const questionId = attempt.body?.questions?.[0]?.question_id
    const first = await rpc(players[0].jwt, 'quiz_attempt_answer', {
      p_attempt_id: attempt.body.attempt_id,
      p_question_id: questionId,
      p_positions: [0],
    })
    check('practice grades the answer server-side', first.body?.ok === true && first.body?.correct === true, JSON.stringify(first.body).slice(0, 160))

    const again = await rpc(players[0].jwt, 'quiz_attempt_answer', {
      p_attempt_id: attempt.body.attempt_id,
      p_question_id: questionId,
      p_positions: [0],
    })
    check('re-answering is idempotent and awards nothing', again.body?.already_answered === true && again.body?.points === 0, JSON.stringify(again.body).slice(0, 160))

    const finished = await rpc(players[0].jwt, 'quiz_attempt_finish', { p_attempt_id: attempt.body.attempt_id })
    check('attempt finishes at 100%', finished.body?.status === 'completed' && finished.body?.percent === 100, JSON.stringify(finished.body).slice(0, 160))
  }

  console.log('\n=== G. fork')
  {
    await rpc(host.jwt, 'quiz_update', { p_quiz_id: createdQuizzes[0], p_visibility: 'public' })
    const forked = await rpc(players[1].jwt, 'quiz_fork', { p_quiz_id: createdQuizzes[0] })
    check('a published quiz can be forked', forked.body?.ok === true && forked.body?.question_count === 1, JSON.stringify(forked.body).slice(0, 160))
    if (forked.body?.quiz_id) createdQuizzes.push(forked.body.quiz_id)

    const forkDetail = await rpc(players[1].jwt, 'quiz_detail', { p_quiz_id: forked.body?.quiz_id })
    const forkQuestionId = forkDetail.body?.questions?.[0]?.question_id
    check('the fork points at a question the forker owns', forkQuestionId && forkQuestionId !== bankQuestion.id, `${forkQuestionId}`)

    const ownRows = await rest(players[1].jwt, `question_bank?id=eq.${forkQuestionId ?? ''}&select=id`)
    check('the copied bank row is readable by the forker', Array.isArray(ownRows.body) && ownRows.body.length === 1, `rows=${ownRows.body?.length}`)
  }

  console.log('\n=== H. AI review')
  {
    const draft = {
      questions: [
        {
          question: 'Which structure gives O(1) average lookup by key?',
          type: 'single',
          options: [
            { text: 'Hash map', is_correct: true },
            { text: 'Linked list', is_correct: false },
            { text: 'Stack', is_correct: false },
          ],
          explanation: 'A hash map indexes by key.',
          difficulty: 'easy',
          marks: 100,
          time_limit_seconds: 20,
          topic: 'Hashing',
        },
        {
          // invalid: two correct options on a single-choice question
          question: 'Which of these is a valid smoke-test question?',
          type: 'single',
          options: [
            { text: 'A', is_correct: true },
            { text: 'B', is_correct: true },
          ],
          explanation: '',
          difficulty: 'medium',
          marks: 100,
          time_limit_seconds: 20,
          topic: 'Smoke',
        },
      ],
    }

    const job = await rpc(host.jwt, 'quiz_ai_job_create', {
      p_source_kind: 'topic',
      p_source_hash: `smoke-${stamp}`,
      p_spec: { subject: 'Smoke', count: 2 },
      p_draft: draft,
      p_model: 'smoke',
      p_error: null,
    })
    check('invalid candidates are dropped before review', job.body?.question_count === 1 && job.body?.status === 'review_ready', JSON.stringify(job.body).slice(0, 160))
    if (job.body?.job_id) createdJobs.push(job.body.job_id)

    const accepted = await rpc(host.jwt, 'quiz_ai_job_accept', {
      p_job_id: job.body?.job_id,
      p_indices: [0],
      p_title: `Smoke AI quiz ${stamp}`,
    })
    check('accepted draft becomes a draft quiz', accepted.body?.ok === true && accepted.body?.question_count === 1, JSON.stringify(accepted.body).slice(0, 160))
    if (accepted.body?.quiz_id) {
      createdQuizzes.push(accepted.body.quiz_id)
      const aiQuiz = await rest(host.jwt, `quizzes?id=eq.${accepted.body.quiz_id}&select=status,source`)
      check('the AI quiz is a draft and marked as AI', row(aiQuiz.body)?.status === 'draft' && row(aiQuiz.body)?.source === 'ai', JSON.stringify(aiQuiz.body).slice(0, 140))
    }

    const second = await rpc(host.jwt, 'quiz_ai_job_create', {
      p_source_kind: 'topic',
      p_source_hash: `smoke-2-${stamp}`,
      p_spec: {},
      p_draft: draft,
      p_model: 'smoke',
      p_error: null,
    })
    if (second.body?.job_id) {
      createdJobs.push(second.body.job_id)
      const discarded = await rpc(host.jwt, 'quiz_ai_job_discard', { p_job_id: second.body.job_id })
      const after = await rpc(host.jwt, 'quiz_ai_job_get', { p_job_id: second.body.job_id })
      check('discarding clears the draft', discarded.body?.ok === true && after.body?.status === 'discarded' && after.body?.draft === null, JSON.stringify(after.body).slice(0, 160))
    }
  }
}

async function cleanup() {
  console.log('\n=== cleanup')
  // service role: the test client is anon and has no DELETE policy anywhere
  if (createdRooms.length) await admin.from('competitions').delete().in('id', createdRooms)
  if (createdQuizzes.length) await admin.from('quizzes').delete().in('id', createdQuizzes)
  if (createdJobs.length) await admin.from('quiz_ai_jobs').delete().in('id', createdJobs)
  // join_attempts survives user deletion by design (user_id is SET NULL), so
  // clear the throwaway telemetry before the accounts go away.
  if (createdUsers.length) await admin.from('join_attempts').delete().in('user_id', createdUsers)
  for (const id of createdUsers) {
    await admin.auth.admin.deleteUser(id).catch(() => null)
  }
  console.log(`   removed ${createdRooms.length} rooms, ${createdQuizzes.length} quizzes, ${createdJobs.length} jobs, ${createdUsers.length} users`)
}

try {
  await main()
} catch (error) {
  failed++
  failures.push(`fatal: ${error.message}`)
  console.log(`\n💥 ${error.stack ?? error.message}`)
} finally {
  await cleanup()
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`failing checks: ${failures.join(' | ')}`)
  process.exit(1)
}
