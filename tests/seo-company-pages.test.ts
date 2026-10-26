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
const list = read('src/app/experiences/page.tsx')
const post = read('src/app/blog/[slug]/layout.tsx')
const feed = read('src/app/experiences/ExperiencesApp.tsx')
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

describe('structured data points at absolute urls', () => {
  // Google's validator silently drops a relative `url`, `item` or `@id`: the
  // page still ranks on its text but loses its link and its breadcrumb.
  it('derives every structured url from the site origin', () => {
    for (const file of [directory, companyPage, detail, list, post]) {
      expect(file).toContain('const APP_URL = (process.env.NEXT_PUBLIC_APP_URL')
    }
    // The shapes that used to be bare paths.
    expect(companyPage).toContain('const canonical = `${APP_URL}/companies/${company.slug}`')
    expect(companyPage).toContain('item: `${APP_URL}/companies`')
    expect(detail).toContain('item: `${APP_URL}/companies`')
    expect(detail).toContain('url: `${APP_URL}/icon-512.png`')
    expect(list).toContain('url: `${APP_URL}/experiences`')
    expect(post).toContain('url: `${APP_URL}/blog/${slug}`')
  })

  it('gives the write-up a breadcrumb through the company, not straight home', () => {
    expect(detail).toContain("'@type': 'BreadcrumbList'")
    expect(detail).toContain("name: 'Companies'")
    expect(detail).toContain('companyHref = exp.companies?.slug')
  })

  it('carries an image, because an Article without one gets no rich result', () => {
    expect(detail).toContain('image: [`${APP_URL}/og.png`]')
  })
})

describe("the <title> is the query, not the author's shorthand", () => {
  it('leads with the company, then the role and the rounds', () => {
    // "SDE Interview" as a title names no company and ranks for nothing.
    expect(detail).toContain('function seoTitleFor(')
    expect(detail).toContain("`${company} interview experience${role ? ` — ${role}` : ''}${rounds}`")
    expect(detail).toMatch(/const title = `\$\{seoTitleFor\(exp\)\} · ConnectToCampus`/)
  })

  it('keeps the brand suffix on segments whose layout sets a plain title', () => {
    // /experiences/layout.tsx and /blog/layout.tsx declare string titles, which
    // stops Next applying the root `%s · ConnectToCampus` template below them.
    expect(post).toContain('const title = `${post.title} · ConnectToCampus`')
    expect(post).not.toContain('`${title} · ConnectToCampus`')
  })
})

describe('every share card keeps an image', () => {
  // A page-level `openGraph` REPLACES the root layout's object, images
  // included, so a page that forgets `images` previews as an empty box.
  it('declares og + twitter images on both company routes', () => {
    for (const file of [directory, companyPage]) {
      expect(file).toContain("images: ['/og.png']")
      expect(file).toMatch(/twitter: \{/)
    }
  })

  it('does the same for a write-up and for a blog post with no cover', () => {
    expect(detail).toContain("images: ['/og.png']")
    expect(post).toContain(": ['/og.png']")
    expect(post).toContain('image: post.cover_url ?? `${APP_URL}/og.png`')
  })
})

describe('the directory is reachable by following links, not just the sitemap', () => {
  it('is linked from the experiences list and from every write-up', () => {
    expect(feed).toContain('href="/companies"')
    expect(detail).toContain('/companies/${exp.companies.slug}`')
  })

  it('links back to the newest-first list', () => {
    expect(directory).toContain('href="/experiences"')
    expect(companyPage).toContain('href="/experiences"')
  })
})

describe('the sitemap only asks Google to crawl pages a visitor can read', () => {
  it('lists published blog posts, and only published ones', () => {
    expect(sitemap).toContain("from('blog_posts')")
    expect(sitemap).toContain(".eq('status', 'published')")
    expect(sitemap).toContain('path: `/blog/${row.slug}`')
  })

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

  it('leaves the landing components themselves alone', () => {
    // The first page is the placement landing plus its own frame (PublicNav /
    // PublicFooter). None of the directory work may edit those files, which is
    // why the company pages link to themselves instead of through that nav.
    const landing = read('src/app/page.tsx')
    expect(landing).not.toContain('PublicNav')
    // The frame is shared, so a change there WOULD change `/`. Guard against
    // someone "helpfully" adding the directory to it.
    expect(read('src/components/marketing/PublicNav.tsx')).not.toContain('/companies')
    expect(read('src/components/marketing/PublicFooter.tsx')).not.toContain('/companies')
  })
})
