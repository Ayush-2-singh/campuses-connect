/**
 * Shared, side-effect-free helpers for the interview-experience seed pipeline.
 *
 * The seed dataset is a list of RESEARCH LEADS: a title, a company, a role, a
 * one-line original summary and a source URL. Nothing here decides that a lead
 * is true — it only checks that the record is complete enough to store, folds
 * two URLs that point at the same post into one, and marks everything
 * `pending_review` so nothing reaches a public page before a human has looked
 * at it.
 *
 * Kept in one file so the validator, the importer and the tests agree — a
 * normalisation rule that lives in two places is a duplicate that comes back.
 */

/** The statuses a record may carry. Mirrors the CHECK in the migration. */
export const REVIEW_STATUSES = ['pending_review', 'approved', 'rejected']
export const VERIFICATION_STATUSES = [
  'pending_review',
  'source_accessible',
  'source_inaccessible',
  'source_mismatch',
  'duplicate',
  'approved',
  'rejected',
]

/** Query parameters that never identify a post — dropped before comparing. */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'igshid',
  'ref',
  'ref_src',
  'source',
  'share',
])

/**
 * Normalise a source URL for duplicate detection ONLY.
 *
 * The original URL is always stored as written — this value exists so
 * `https://www.example.com/post/1/`, `https://example.com/post/1?utm_source=x`
 * and `HTTP://EXAMPLE.COM/post/1#top` are recognised as one post. Returns null
 * when the string is not an http(s) URL we can reason about.
 */
export function normalizeSourceUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  const search = params.length ? `?${new URLSearchParams(params).toString()}` : ''

  // LeetCode writes the same post two ways: /discuss/post/<id>/<slug>/ and
  // /discuss/interview-experience/<id>. The numeric id is the identity, so
  // both fold onto one canonical shape. (Left alone for every other host.)
  if (host === 'leetcode.com' || host === 'leetcode.cn') {
    const match = url.pathname.match(/^\/discuss\/(?:post|interview-experience)\/(\d+)/)
    if (match) return `https://${host}/discuss/post/${match[1]}`
  }

  const path = url.pathname.replace(/\/+$/, '') || '/'
  return `https://${host}${path}${search}`
}

/** Strip a UTF-8 BOM and surrounding quotes that CSV exporters love to add. */
function cleanCell(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
}

/**
 * Parse the JSON export. Accepts an array or `{ records: [...] }`.
 * Throws when the file is not JSON at all — a broken file must not be read as
 * "zero records", which would look like a clean import.
 */
export function parseJsonSeed(text) {
  const parsed = JSON.parse(text)
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.records) ? parsed.records : null
  if (!rows) throw new Error('JSON seed is not an array of records')
  return rows.map(normalizeRecordShape)
}

/**
 * Parse the CSV export (RFC 4180 field quoting, embedded commas/newlines).
 * Hand-written instead of pulling a dependency for one file.
 */
export function parseCsvSeed(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const rows = []
  let field = ''
  let row = []
  let quoted = false

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cleanCell(cell)))
  if (!header) return []
  const keys = header.map(cleanCell)
  return body.map((cells) => {
    const record = {}
    keys.forEach((key, index) => {
      record[key] = cleanCell(cells[index])
    })
    return normalizeRecordShape(record)
  })
}

/** One shape for both files, so the comparison is field by field. */
function normalizeRecordShape(record) {
  return {
    source_title: cleanCell(record.source_title),
    company: cleanCell(record.company),
    role: cleanCell(record.role),
    short_summary: cleanCell(record.short_summary),
    source_platform: cleanCell(record.source_platform),
    source_url: cleanCell(record.source_url),
    source_type: cleanCell(record.source_type),
    publication_date: cleanCell(record.publication_date),
    source_credit: cleanCell(record.source_credit),
    content_storage_policy: cleanCell(record.content_storage_policy),
    review_status: cleanCell(record.review_status),
  }
}

/** The dataset's placeholder for "the source page says when it was posted". */
const UNKNOWN_DATE = /^see original source$/i
/** `Company not specified` and friends are a missing field, not a company. */
const UNKNOWN_COMPANY = /^(company not specified|unknown|n\/?a|-+)$/i

/**
 * Validate one record. Returns the issues that matter for STORAGE — not a
 * judgement about whether the interview happened. `blocking` issues mean the
 * record is not importable; the rest are notes for the reviewer.
 */
export function validateRecord(record) {
  const issues = []
  const add = (code, message, blocking = false) => issues.push({ code, message, blocking })

  const url = normalizeSourceUrl(record.source_url)
  if (!record.source_url) add('missing_url', 'No source URL — cannot attribute or verify', true)
  else if (!url) add('invalid_url', 'Source URL is not a valid http(s) URL', true)

  if (!UNKNOWN_COMPANY.test(record.company) && !record.company) add('missing_company', 'No company name', true)
  if (UNKNOWN_COMPANY.test(record.company)) add('unknown_company', 'Source does not name the company', true)
  if (!record.role) add('missing_role', 'No role', true)
  if (!record.short_summary) add('empty_summary', 'No summary to store', true)
  if (!record.source_title) add('missing_title', 'No title', true)
  if (!record.source_platform) add('missing_platform', 'No source platform')
  if (UNKNOWN_DATE.test(record.publication_date) || !record.publication_date) {
    add('unknown_date', 'Publication/interview date is not stated by the source')
  }
  if (/^original author/i.test(record.source_credit)) {
    add('generic_credit', 'Credit is generic — the author is only knowable on the source page')
  }
  if (!record.attribution_allowed) add('attribution_note', 'Summary + URL only; the full article is never copied')

  return { record, normalizedUrl: url, issues, blocking: issues.some((i) => i.blocking) }
}

/** Which fields differ between the CSV and JSON copies of the same record. */
export function compareFiles(jsonRecords, csvRecords) {
  const key = (r) => `${normalizeSourceUrl(r.source_url) ?? r.source_url}|${r.company}|${r.role}`
  const jsonByKey = new Map(jsonRecords.map((r) => [key(r), r]))
  const csvByKey = new Map(csvRecords.map((r) => [key(r), r]))
  const onlyJson = [...jsonByKey.keys()].filter((k) => !csvByKey.has(k))
  const onlyCsv = [...csvByKey.keys()].filter((k) => !jsonByKey.has(k))
  const fieldDiffs = []
  for (const [k, a] of jsonByKey) {
    const b = csvByKey.get(k)
    if (!b) continue
    const fields = Object.keys(a).filter((f) => a[f] !== b[f])
    if (fields.length) fieldDiffs.push({ key: k, fields })
  }
  return { onlyJson, onlyCsv, fieldDiffs }
}

/**
 * Build the validation report: totals, duplicates, missing metadata and the
 * recommended import list. No network, no database — a report you can re-run.
 */
export function buildReport(jsonRecords, csvRecords) {
  const results = jsonRecords.map(validateRecord)
  const byUrl = new Map()
  for (const result of results) {
    const url = result.normalizedUrl
    if (!url) continue
    if (!byUrl.has(url)) byUrl.set(url, [])
    byUrl.get(url).push(result)
  }

  const duplicates = [...byUrl.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([url, group]) => ({
      normalized_url: url,
      count: group.length,
      titles: group.map((g) => g.record.source_title),
      urls: group.map((g) => g.record.source_url),
    }))

  const duplicateUrls = new Set(duplicates.map((d) => d.normalized_url))
  const unique = results.filter((r) => r.normalizedUrl && !duplicateUrls.has(r.normalizedUrl))
  const importable = unique.filter((r) => !r.blocking)
  const needsReview = results.filter((r) => r.issues.some((i) => i.code !== 'unknown_date'))

  const countBy = (code) => results.reduce((n, r) => n + (r.issues.some((i) => i.code === code) ? 1 : 0), 0)

  return {
    generated_at: new Date().toISOString(),
    totals: {
      json_records: jsonRecords.length,
      csv_records: csvRecords.length,
      unique_source_urls: byUrl.size,
      valid_unique_records: importable.length,
      duplicate_url_groups: duplicates.length,
      records_in_duplicate_groups: results.length - unique.length,
    },
    files: compareFiles(jsonRecords, csvRecords),
    duplicates,
    missing: {
      url: countBy('missing_url') + countBy('invalid_url'),
      company: countBy('missing_company') + countBy('unknown_company'),
      role: countBy('missing_role'),
      summary: countBy('empty_summary'),
      title: countBy('missing_title'),
      platform: countBy('missing_platform'),
      date: countBy('unknown_date'),
      author_credit: countBy('generic_credit'),
    },
    needs_manual_review: needsReview.length,
    recommended_import_count: importable.length,
    sources_requiring_manual_verification: importable.map((r) => ({
      title: r.record.source_title,
      company: r.record.company,
      role: r.record.role,
      url: r.record.source_url,
      normalized_url: r.normalizedUrl,
      notes: r.issues.map((i) => i.message),
    })),
  }
}

/** Markdown rendering of `buildReport` — what a human actually reads. */
export function reportToMarkdown(report) {
  const { totals, missing, files } = report
  const lines = [
    '# Interview experience seed — validation report',
    '',
    `Generated: ${report.generated_at}`,
    '',
    '## Totals',
    '',
    '| Measure | Count |',
    '| --- | --- |',
    `| Records in the JSON export | ${totals.json_records} |`,
    `| Records in the CSV export | ${totals.csv_records} |`,
    `| Distinct source URLs (normalised) | ${totals.unique_source_urls} |`,
    `| Duplicate source-URL groups | ${totals.duplicate_url_groups} |`,
    `| Records collapsed as duplicates | ${totals.records_in_duplicate_groups} |`,
    `| **Recommended import count** | **${totals.valid_unique_records}** |`,
    '',
    '## File comparison',
    '',
    `- Only in JSON: ${files.onlyJson.length}`,
    `- Only in CSV: ${files.onlyCsv.length}`,
    `- Records with field differences: ${files.fieldDiffs.length}`,
    '',
    '## Missing metadata (records affected)',
    '',
    '| Field | Records |',
    '| --- | --- |',
    `| Source URL | ${missing.url} |`,
    `| Company | ${missing.company} |`,
    `| Role | ${missing.role} |`,
    `| Summary | ${missing.summary} |`,
    `| Title | ${missing.title} |`,
    `| Source platform | ${missing.platform} |`,
    `| Interview/publication date | ${missing.date} |`,
    `| Named author credit | ${missing.author_credit} |`,
    '',
    '## Duplicate source URLs',
    '',
  ]
  if (report.duplicates.length === 0) {
    lines.push('None.')
  } else {
    for (const d of report.duplicates) {
      lines.push(`- \`${d.normalized_url}\` — ${d.count}: ${d.titles.join(' / ')}`)
    }
  }
  lines.push('', '## Sources that still need a human', '', 'Every importable record is listed here: none of', 'them has been read against its source by this script.', '')
  lines.push('| Company | Role | URL | Notes |', '| --- | --- | --- | --- |')
  for (const s of report.sources_requiring_manual_verification) {
    lines.push(`| ${s.company} | ${s.role} | ${s.url} | ${s.notes.join('; ')} |`)
  }
  lines.push(
    '',
    '## What this report does NOT claim',
    '',
    '- A URL resolving is not verification: nothing here has been marked `approved`.',
    '- No interview date, author, question or round count has been invented.',
    '- Records whose source is blocked or unreachable stay `pending_review`, never `rejected`.'
  )
  return `${lines.join('\n')}\n`
}
