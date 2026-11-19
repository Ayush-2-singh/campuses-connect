#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Backfill the LeetCode-style starter stubs + function contracts.
//
// The solve workspace grades a function, so every problem row needs the
// visible stub per language and the `_meta` contract that tells the judge
// which function to call. Migrations only touch the problems they seeded;
// a database that also carries problems from another environment, an export
// or an older seed can end up with rows that still expect stdin.
//
// This script applies `scripts/judge-starter-code.json` to every problem in
// the target database whose slug is listed there. Problems it does not know
// are left untouched (they keep working on the stdin/stdout contract).
//
// Usage:
//   node scripts/seed-judge-contracts.mjs            # apply
//   node scripts/seed-judge-contracts.mjs --dry-run  # report only
//
// Credentials come from the environment, or from .env.local when present:
//   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// Environment variables win over the file.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const root = new URL('..', import.meta.url)
const dryRun = process.argv.includes('--dry-run')

function loadEnv() {
  const env = { ...process.env }
  const file = new URL('.env.local', root)
  if (!existsSync(file)) return env
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const i = trimmed.indexOf('=')
    const key = trimmed.slice(0, i).trim()
    if (!env[key]) env[key] = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

/** JSONB returns object keys in its own order; compare content, not order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const starters = JSON.parse(readFileSync(new URL('judge-starter-code.json', import.meta.url), 'utf8'))
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: problems, error } = await supabase.from('dsa_problems').select('id, slug, starter_code')
if (error) {
  console.error('Could not read dsa_problems:', error.message)
  process.exit(1)
}

const known = new Set(Object.keys(starters))
const present = new Set((problems ?? []).map((p) => p.slug))
const missing = [...known].filter((slug) => !present.has(slug))
const targets = (problems ?? []).filter((p) => known.has(p.slug))

console.log(`${targets.length} of ${problems?.length ?? 0} problems matched the contract list`)
if (missing.length) console.log(`Not in this database (skipped): ${missing.join(', ')}`)

let updated = 0
let unchanged = 0
for (const problem of targets) {
  const next = starters[problem.slug]
  if (canonical(problem.starter_code) === canonical(next)) {
    unchanged++
    continue
  }
  if (dryRun) {
    console.log(`would update ${problem.slug}`)
    updated++
    continue
  }
  const { error: updateError } = await supabase.from('dsa_problems').update({ starter_code: next }).eq('id', problem.id)
  if (updateError) {
    console.error(`failed ${problem.slug}: ${updateError.message}`)
    process.exitCode = 1
    continue
  }
  updated++
}

console.log(dryRun ? `${updated} would be updated, ${unchanged} already current` : `${updated} updated, ${unchanged} already current`)
