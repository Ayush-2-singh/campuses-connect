/**
 * Validate the interview-experience seed dataset — no database, no writes to
 * the product, just a report.
 *
 *   node scripts/validate-interview-seed.mjs \
 *     --json ~/Downloads/connecttocampus_interview_seed_50.json \
 *     --csv  ~/Downloads/connecttocampus_interview_seed_50.csv
 *
 * Writes `docs/interview-seed-validation.md` and `.json`. Every record it calls
 * importable is still `pending_review`: a URL that answers 200 does not make a
 * candidate's account true, so this script never marks anything `approved`.
 *
 * `--check-urls=N` asks the first N sources whether they resolve (10s timeout,
 * one request each, redirects recorded, never retried in a loop). LeetCode
 * blocks scripted clients, so a 403 is written down as `blocked` — not as a
 * dead or fake source.
 */
import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReport, parseCsvSeed, parseJsonSeed, reportToMarkdown } from './interview-seed-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback = null) {
  // Both `--flag=value` and `--flag value` — the second is what people type.
  const prefix = `--${name}=`
  const inline = process.argv.find((a) => a.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const at = process.argv.indexOf(`--${name}`)
  const next = at >= 0 ? process.argv[at + 1] : undefined
  return next && !next.startsWith('--') ? next : fallback
}

const jsonPath = arg('json')
const csvPath = arg('csv')
const checkUrls = Number(arg('check-urls', '0')) || 0
if (!jsonPath) {
  console.error('Usage: node scripts/validate-interview-seed.mjs --json <file> [--csv <file>] [--check-urls=N]')
  process.exit(1)
}

const jsonRecords = parseJsonSeed(fs.readFileSync(resolve(jsonPath), 'utf8'))
const csvRecords = csvPath ? parseCsvSeed(fs.readFileSync(resolve(csvPath), 'utf8')) : []

const report = buildReport(jsonRecords, csvRecords)

/**
 * A single light request per URL. `manual` when we cannot say anything useful
 * (blocked, rate-limited, timeout): the source is NOT called fake for refusing
 * a scripted client.
 */
async function probe(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        // Identify the check honestly instead of impersonating a browser.
        'user-agent': 'ConnectToCampus-seed-validator/1.0 (+https://www.connecttocampus.com)',
        accept: 'text/html',
      },
    })
    const status = res.status
    const kind =
      status >= 200 && status < 300
        ? 'ok'
        : status === 403 || status === 401 || status === 429
          ? 'blocked'
          : status >= 300 && status < 400
            ? 'redirect'
            : 'error'
    return { status, result: kind, location: res.headers.get('location') ?? undefined }
  } catch (e) {
    return { status: null, result: e?.name === 'AbortError' ? 'timeout' : 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

if (checkUrls > 0) {
  const targets = report.sources_requiring_manual_verification.slice(0, checkUrls)
  const checks = []
  for (const source of targets) {
    checks.push({ url: source.url, ...(await probe(source.url)) })
  }
  report.url_checks = checks
  report.url_check_note =
    'A resolving URL is not verification; blocked/rate-limited hosts are recorded as blocked, never as dead.'
}

const outDir = join(root, 'docs')
fs.mkdirSync(outDir, { recursive: true })
const mdPath = join(outDir, 'interview-seed-validation.md')
const jsonOut = join(outDir, 'interview-seed-validation.json')
fs.writeFileSync(mdPath, reportToMarkdown(report))
fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)

const { totals, missing } = report
console.log('Interview seed validation')
console.log(`  JSON records        ${totals.json_records}`)
console.log(`  CSV records         ${totals.csv_records}`)
console.log(`  Unique source URLs  ${totals.unique_source_urls}`)
console.log(`  Duplicates folded   ${totals.records_in_duplicate_groups}`)
console.log(`  Missing company     ${missing.company}`)
console.log(`  Missing role        ${missing.role}`)
console.log(`  Missing date        ${missing.date}`)
console.log(`  Recommended import  ${totals.valid_unique_records}`)
console.log(`  Report              ${mdPath}`)
if (report.url_checks?.length) {
  const ok = report.url_checks.filter((c) => c.result === 'ok').length
  console.log(`  URL checks          ${ok}/${report.url_checks.length} resolved (see report)`)
}
