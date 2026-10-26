/**
 * SEO FOR WHAT THE SITE IS NOW — a company-by-company interview directory.
 *
 * The searches that matter are "<company> interview experience" and "interview
 * experiences", so the pages that must exist, render server-side and stay
 * honest are:
 *   • /companies                — every company that has an approved write-up
 *   • /companies/[slug]         — that company's write-ups
 *   • /experiences/[id]         — one write-up, indexable, credited to its source
 *
 * And the pages that must NOT exist: a company with nothing approved (a thin
 * page), a pending write-up, or a sitemap entry for either.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const directory = read('src/app/companies/page.tsx')
const companyPage = read('src/app/companies/[slug]/page.tsx')
const detail = read('src/app/experiences/[id]/page.tsx')
const sitemap = read('src/app/sitemap.ts')
const lib = read('src/lib/publicExperiences.ts')

describe('/companies — the directory', () => {
  it('is server-rendered, so the list is in the HTML', () => {
    expect(directory).not.toMatch(/^'use client'/m)
    expect(directory).toMatch(/export default async function CompaniesPage/)
    expect(directory).toMatch(/revalidate = 600/)
  })

  it('carries its own canonical and a description that names the intent', () => {
    expect(directory).toMatch(/alternates: \{ canonical: '\/companies' \}/)
    expect(directory).toMatch(/interview experiences by company/i)
  })

  it('emits CollectionPage + ItemList JSON-LD from the rows it renders', () => {
    expect(directory).toMatch(/'@type': 'CollectionPage'/)
    expect(directory).toMatch(/'@type': 'ItemList'/)
    expect(directory).toMatch(/itemListElement: companies\.map/)
  })

  it('shows a logo when the company has one and an initial when it does not', () => {
    expect(directory).toMatch(/company\.logo_url \?/)
    expect(directory).toMatch(/company\.name\.charAt\(0\)\.toUpperCase\(\)/)
  })

  it('has an honest empty state instead of padding the page', () => {
    expect(directory).toMatch(/No company pages yet/)
  })
})

describe('/companies/[slug] — one company', () => {
  it('is a real 404 when that company has nothing approved', () => {
    expect(companyPage).toMatch(/if \(!company\) return null/)
    expect(companyPage).toMatch(/if \(!found\) notFound\(\)/)
    expect(companyPage).toMatch(/robots: \{ index: false, follow: false \}/)
  })

  it('titles the page for the query people actually type', () => {
    expect(companyPage).toMatch(/title: `\$\{company\.name\} interview experience`/)
    expect(companyPage).toMatch(/alternates: \{ canonical: `\/companies\/\$\{company\.slug\}` \}/)
  })

  it('is built only from approved rows', () => {
    expect(lib).toMatch(/\.eq\('review_status', 'approved'\)/)
    expect(companyPage).toMatch(/getApprovedExperiences\(\{ companySlug: slug/)
  })

  it('credits the original source without vouching for it', () => {
    expect(companyPage).toMatch(/rel="nofollow noopener noreferrer"/)
    expect(companyPage).toMatch(/Original source/)
  })
})

describe('a write-up page refuses to render anything unapproved', () => {
  it('404s unless review_status is approved', () => {
    expect(detail).toMatch(/if \(data\.review_status !== 'approved'\) return null/)
  })

  it('credits the source it was summarised from', () => {
    expect(detail).toMatch(/Originally reported on/)
    expect(detail).toMatch(/rel="nofollow noopener noreferrer"/)
  })

  it('takes dateModified from the row, not from the publication date', () => {
    expect(detail).toMatch(/dateModified: exp\.updated_at \?\? exp\.created_at/)
  })
})

describe('the sitemap only asks Google to crawl pages a visitor can read', () => {
  it('carries the company directory and its child pages', () => {
    expect(sitemap).toMatch(/\{ path: '\/companies', priority: 0\.7/)
    expect(sitemap).toMatch(/getCompaniesWithExperiences\(\)/)
    expect(sitemap).toMatch(/APP_URL\}\$\{path\}`[\s\S]{0,120}priority: 0\.7/)
  })

  it('filters write-ups to approved and dates them from updated_at', () => {
    expect(sitemap).toMatch(/\.eq\('review_status', 'approved'\)/)
    expect(sitemap).toMatch(/select\('id, updated_at'\)/)
    expect(sitemap).toMatch(/lastModified: new Date\(e\.lastModified\)/)
  })
})

describe('the product landing is untouched by this work', () => {
  it('still renders the placement landing and adds no page-level metadata', () => {
    const landing = read('src/app/page.tsx')
    expect(landing).toContain("import PlacementLanding from '@/components/marketing/PlacementLanding'")
    expect(landing).toMatch(/<PlacementLanding /)
    // SEO for `/` lives in the root layout; changing it here would change the
    // first page, which this task explicitly must not do.
    expect(landing).not.toMatch(/export const metadata/)
  })
})
