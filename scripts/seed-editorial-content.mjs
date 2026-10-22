/**
 * Seed the editorial content that the public landing reads.
 *
 * Why this exists: `/` shows a "Worth reading next" rail wired to
 * `blog_posts` (status = 'published'), and with zero published rows it can only
 * show "preview — not published" cards. That reads like a broken product on the
 * first screen a visitor lands on.
 *
 * WHAT IT WRITES (default): four posts authored by the platform itself —
 * explainers about how the product works. They are not presented as student
 * testimonials, so nothing on the page pretends to be first-hand experience
 * that never happened.
 *
 * WHAT IT DOES NOT WRITE by default: `interview_experiences` rows. A write-up is
 * a student's own account of a real drive; inventing those and showing them to
 * visitors would break the honesty contract the landing is built on. If you
 * explicitly want three clearly-labelled sample rows (titles start with
 * "[Sample]") for a demo, pass `--with-samples`.
 *
 *   node scripts/seed-editorial-content.mjs --dry-run
 *   node scripts/seed-editorial-content.mjs
 *   node scripts/seed-editorial-content.mjs --with-samples
 *   node scripts/seed-editorial-content.mjs --remove      # undo both
 *
 * Idempotent: posts are upserted on `slug`. The author is the oldest profile
 * with a username, or SEED_AUTHOR_ID when set. Reads NEXT_PUBLIC_SUPABASE_URL
 * and SUPABASE_SERVICE_ROLE_KEY from the environment or .env.local.
 */
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readEnv() {
  const env = { ...process.env }
  const path = join(root, '.env.local')
  if (!fs.existsSync(path)) return env
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i < 0 || line.trim().startsWith('#')) continue
    const key = line.slice(0, i).trim()
    if (!env[key]) env[key] = line.slice(i + 1).trim()
  }
  return env
}

const POSTS = [
  {
    slug: 'how-a-contest-is-scored',
    title: 'How a contest is scored on ConnectToCampus',
    category: 'how_to',
    tags: ['compete', 'scoring'],
    excerpt: 'Every submission is run against the problem’s test cases. What the score actually measures.',
    body: `A contest on ConnectToCampus is not graded on how fast you typed. Your submission is run against the test cases the problem ships with, and your score is the share of them your code passes.

**What that means in practice**

- A solution that handles the sample input but fails the large case scores below a slower one that is correct.
- Partial credit is real, so submitting a working brute force beats submitting nothing.
- The clock only decides the tie-break.

**Reading your own result**

Open the submission and look at which cases failed, not just the total. One failure on an edge case is a different lesson from six timeouts, and the next problem you open should be chosen from that difference.`,
  },
  {
    slug: 'what-a-placement-write-up-should-contain',
    title: 'What a placement write-up should contain',
    category: 'how_to',
    tags: ['experiences', 'interviews'],
    excerpt: 'Five things a useful drive write-up includes — and the one thing it usually leaves out.',
    body: `A write-up is only worth reading if the next batch can prepare from it. Five things do most of that work:

1. **The round order.** Online test, then two technical rounds, then HR — with roughly how long each took.
2. **The questions.** As close to the wording as you remember, especially the follow-up.
3. **The bar.** How much of the problem you were expected to finish on your own.
4. **The result and timeline.** Selected, rejected, or pending — and how many days between rounds.
5. **What you would do differently.** This is the part most write-ups skip, and the part people actually use.

Company name, role and campus are the framing; everything above is the content.`,
  },
  {
    slug: 'reading-a-round-into-practice',
    title: 'Reading a round, then practising it',
    category: 'tech_blog',
    tags: ['dsa', 'preparation'],
    excerpt: 'A round you only read about is trivia. Turn it into a problem you solve tonight.',
    body: `The gap between reading an interview round and being ready for one is a single evening of practice.

**Turn each question into a task**

For every question in a write-up, write down the pattern it belongs to — sliding window, two pointers, heap, graph traversal. If you cannot name the pattern, that is the gap, not the question.

**Then answer three things**

- What would I have said out loud in the first two minutes?
- Which edge case would have broken that answer?
- What is the complexity, and can I say it without hand-waving?

Two rounds a week, done this way, covers more ground than a hundred posts skimmed.`,
  },
  {
    slug: 'why-campus-first',
    title: 'Why this platform is campus-first',
    category: 'campus_life',
    tags: ['campus', 'placements'],
    excerpt: 'The same company runs a different process at a different college. A national average hides that.',
    body: `Ask two students from two colleges about the same company and you often get two different processes: different round counts, different difficulty, sometimes a different role on offer.

That is why the write-ups here are filed against the campus they happened at. A number like "average package" flattens exactly the detail a student needs — which round was the filter, and what it asked.

It also means the platform grows one campus at a time instead of pretending a national average applies to everyone. Slow, but the advice stays usable.`,
  },
]

const SAMPLE_EXPERIENCES = [
  {
    title: '[Sample] SDE intern drive — 3 rounds',
    role: 'SDE Intern',
    result: 'selected',
    difficulty: 'medium',
    experience:
      'Sample row seeded for a demo, not a real student account. Round 1: online assessment, two DSA problems in 90 minutes. Round 2: technical interview on arrays and hashing, followed by a discussion of a project. Round 3: HR, mostly about relocation and timeline.',
    tips: 'Replace or delete this row before inviting real students — it exists so the band is not empty on a demo.',
  },
  {
    title: '[Sample] Backend intern drive — 2 rounds',
    role: 'Backend Intern',
    result: 'pending',
    difficulty: 'easy',
    experience:
      'Sample row seeded for a demo, not a real student account. Round 1: 45-minute screening on SQL and one string problem. Round 2: system design discussion at a small scale — how would you store and query posts.',
    tips: 'Replace or delete this row before inviting real students.',
  },
  {
    title: '[Sample] Analyst drive — 4 rounds',
    role: 'Analyst',
    result: 'rejected',
    difficulty: 'hard',
    experience:
      'Sample row seeded for a demo, not a real student account. Four rounds: aptitude, case discussion, technical, and a final partner round. The case discussion was the filter — most candidates were dropped there.',
    tips: 'Replace or delete this row before inviting real students.',
  },
]

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const withSamples = args.has('--with-samples')
const remove = args.has('--remove')

const env = readEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const postSlugs = POSTS.map((p) => p.slug)

if (remove) {
  const { error } = await db.from('blog_posts').delete().in('slug', postSlugs)
  console.log(error ? `✗ posts: ${error.message}` : `✓ ${postSlugs.length} seeded posts removed`)
  const { error: expError } = await db.from('interview_experiences').delete().like('title', '[Sample]%')
  console.log(expError ? `✗ sample rows: ${expError.message}` : '✓ sample write-ups removed')
  process.exit(0)
}

// Author: an explicit id wins, otherwise the oldest profile that has a username.
let authorId = env.SEED_AUTHOR_ID || null
if (!authorId) {
  const { data, error } = await db
    .from('profiles')
    .select('id, username, full_name')
    .not('username', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) console.error(`✗ profile lookup: ${error.message}`)
  authorId = data?.id ?? null
  if (authorId) console.log(`author: ${data.full_name || data.username} (${authorId})`)
}

if (!authorId) {
  console.error('No profile found to author the posts — set SEED_AUTHOR_ID and re-run.')
  process.exit(1)
}

let failed = 0
for (const post of POSTS) {
  const row = {
    ...post,
    author_id: authorId,
    status: 'published',
    published_at: new Date().toISOString(),
  }
  if (dryRun) {
    console.log(`· would upsert ${post.slug} (${post.category})`)
    continue
  }
  const { error } = await db.from('blog_posts').upsert(row, { onConflict: 'slug' })
  console.log(error ? `✗ ${post.slug}: ${error.message}` : `✓ ${post.slug}`)
  if (error) failed++
}

if (withSamples) {
  // Company is required by the table; pick an active one so the join on the
  // landing resolves a real name.
  const { data: company } = await db
    .from('companies')
    .select('id, name')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!company) {
    console.error('✗ no active company to attach sample write-ups to')
    failed++
  } else {
    for (const sample of SAMPLE_EXPERIENCES) {
      const row = {
        ...sample,
        user_id: authorId,
        company_id: company.id,
        round_count: Number((sample.experience.match(/round/gi) || []).length) || null,
        is_verified: false,
      }
      if (dryRun) {
        console.log(`· would insert ${sample.title} → ${company.name}`)
        continue
      }
      const { data: existing } = await db
        .from('interview_experiences')
        .select('id')
        .eq('title', sample.title)
        .maybeSingle()
      if (existing) {
        console.log(`· exists  ${sample.title}`)
        continue
      }
      const { error } = await db.from('interview_experiences').insert(row)
      console.log(error ? `✗ ${sample.title}: ${error.message}` : `✓ ${sample.title} → ${company.name}`)
      if (error) failed++
    }
  }
}

console.log(
  dryRun
    ? '\nDry run — nothing written.'
    : failed === 0
      ? `\n${POSTS.length} posts written${withSamples ? ' + sample write-ups' : ''}.`
      : `\n${failed} failed.`
)
process.exit(failed === 0 ? 0 : 2)
