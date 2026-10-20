/**
 * Seed the company directory with real, verifiable facts.
 *
 * The directory shipped with ten rows whose only accurate field was the name:
 * every company read "tech · 500+ · Global" and arrived with `is_verified`
 * already true, which told students these were partners we had vetted. They are
 * not — they are real companies we are onboarding. This script writes the public
 * facts (HQ, industry, website, founding year, one-line description), clears the
 * fake verification flag, and leaves the relationship label to
 * src/lib/company-status.ts, which derives it from real activity (a posted role
 * or a filed interview experience).
 *
 * Idempotent: re-running rewrites the same values.
 *
 *   node scripts/seed-company-directory.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment or .env.local.
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

/**
 * Public facts only. `partner_status` is deliberately absent: it is observed
 * (posted roles, filed experiences), never asserted here.
 */
const COMPANIES = [
  {
    slug: 'google',
    name: 'Google',
    industry: 'tech',
    hq_location: 'Mountain View, CA',
    company_size: '500+',
    founded_year: 1998,
    website: 'https://about.google',
    description: 'US multinational technology company — search, advertising, cloud and Android.',
  },
  {
    slug: 'microsoft',
    name: 'Microsoft',
    industry: 'tech',
    hq_location: 'Redmond, WA',
    company_size: '500+',
    founded_year: 1975,
    website: 'https://www.microsoft.com',
    description: 'US multinational technology company — Windows, Azure and Microsoft 365.',
  },
  {
    slug: 'amazon',
    name: 'Amazon',
    industry: 'ecommerce',
    hq_location: 'Seattle, WA',
    company_size: '500+',
    founded_year: 1994,
    website: 'https://www.amazon.com',
    description: 'US e-commerce and cloud computing company (Amazon Web Services).',
  },
  {
    slug: 'apple',
    name: 'Apple',
    industry: 'tech',
    hq_location: 'Cupertino, CA',
    company_size: '500+',
    founded_year: 1976,
    website: 'https://www.apple.com',
    description: 'US consumer hardware and services company — iPhone, Mac and iOS.',
  },
  {
    slug: 'meta',
    name: 'Meta',
    industry: 'tech',
    hq_location: 'Menlo Park, CA',
    company_size: '500+',
    founded_year: 2004,
    website: 'https://about.meta.com',
    description: 'US social technology company — Facebook, Instagram and WhatsApp.',
  },
  {
    slug: 'flipkart',
    name: 'Flipkart',
    industry: 'ecommerce',
    hq_location: 'Bengaluru, KA',
    company_size: '500+',
    founded_year: 2007,
    website: 'https://www.flipkart.com',
    description: 'Indian e-commerce marketplace headquartered in Bengaluru.',
  },
  {
    slug: 'razorpay',
    name: 'Razorpay',
    industry: 'fintech',
    hq_location: 'Bengaluru, KA',
    company_size: '500+',
    founded_year: 2014,
    website: 'https://razorpay.com',
    description: 'Indian payment gateway and business-banking platform.',
  },
  {
    slug: 'swiggy',
    name: 'Swiggy',
    industry: 'ecommerce',
    hq_location: 'Bengaluru, KA',
    company_size: '500+',
    founded_year: 2014,
    website: 'https://www.swiggy.com',
    description: 'Indian food-delivery and quick-commerce platform.',
  },
  {
    slug: 'zerodha',
    name: 'Zerodha',
    industry: 'fintech',
    hq_location: 'Bengaluru, KA',
    company_size: '500+',
    founded_year: 2010,
    website: 'https://zerodha.com',
    description: 'Indian discount stockbroking platform.',
  },
  {
    slug: 'goldman-sachs',
    name: 'Goldman Sachs',
    industry: 'finance',
    hq_location: 'New York, NY',
    company_size: '500+',
    founded_year: 1869,
    website: 'https://www.goldmansachs.com',
    description: 'US investment bank and financial services firm.',
  },
]

const env = readEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

let failed = 0
for (const company of COMPANIES) {
  const { error } = await db.from('companies').upsert(
    // `is_verified` is a claim the platform makes; nobody has vetted these
    // relationships, so it stays false until a role actually ships.
    { ...company, is_verified: false, is_active: true },
    { onConflict: 'slug' }
  )
  console.log(error ? `✗ ${company.name}: ${error.message}` : `✓ ${company.name} — ${company.hq_location}`)
  if (error) failed++
}

console.log(failed === 0 ? `\n${COMPANIES.length} companies written.` : `\n${failed} failed.`)
process.exit(failed === 0 ? 0 : 2)
