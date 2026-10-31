/**
 * CONTRIBUTOR LADDER — Compete × Experiences × Blog.
 *
 * The ranking must be derived from real contributions, not a separately
 * maintained counter that can drift. These guards pin the score weights, the
 * public filters, the campus scope and the Compete tab wiring.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const route = read('src/app/api/compete/contributors/route.ts')
const component = read('src/app/compete/ContributorsTab.tsx')
const page = read('src/app/compete/page.tsx')
const types = read('src/app/compete/types.ts')

describe('the contributor score is derived from real rows', () => {
  it('counts approved experiences, published blogs, reviews, helpful votes and likes', () => {
    expect(route).toMatch(/from\('interview_experiences'\)/)
    expect(route).toMatch(/\.eq\('review_status', 'approved'\)/)
    expect(route).toMatch(/from\('blog_posts'\)/)
    expect(route).toMatch(/\.eq\('status', 'published'\)/)
    expect(route).toMatch(/from\('blog_comments'\)/)
  })

  it('uses the published weights', () => {
    expect(route).toMatch(/EXPERIENCE_POINTS = 50/)
    expect(route).toMatch(/BLOG_POINTS = 40/)
    expect(route).toMatch(/REVIEW_POINTS = 5/)
    expect(route).toMatch(/HELPFUL_POINTS = 3/)
    expect(route).toMatch(/LIKE_POINTS = 1/)
  })

  it('never counts seeded rows with no author', () => {
    expect(route).toMatch(/\.not\('user_id', 'is', null\)/)
  })

  it('supports global and campus scopes and a 100-row ceiling', () => {
    expect(route).toMatch(/campus_id/)
    expect(route).toMatch(/Math\.min\(Math\.max\(requested, 1\), 100\)/)
    expect(route).toMatch(/\.eq\('campus_id', campusId\)/)
  })

  it('exposes a tier for every score band', () => {
    for (const tier of ['Legend', 'Trailblazer', 'Author', 'Contributor', 'Rookie']) {
      expect(route).toContain(`'${tier}'`)
    }
  })
})

describe('the Compete UI is wired to the ladder', () => {
  it('adds a Contributors tab and URL state', () => {
    expect(types).toMatch(/contributors/)
    expect(page).toMatch(/label: 'Contributors'/)
    expect(page).toMatch(/contributors: 'contributors'/)
    expect(page).toMatch(/<ContributorsTab user=\{user\} profile=\{profile\} \/>/)
  })

  it('calls the contributor API with the selected scope', () => {
    expect(component).toContain('/api/compete/contributors')
    expect(component).toMatch(/scope === 'campus'/)
  })

  it('links creators straight into the three contribution flows', () => {
    expect(component).toContain("router.push('/experiences')")
    expect(component).toContain("router.push(user ? '/blog/new' : '/auth/login?redirect=/blog/new')")
    expect(component).toContain("router.push('/blog')")
  })

  it('does not delete or drop any existing data', () => {
    expect(route).not.toMatch(/\.delete\(\)|DROP TABLE|DELETE FROM/i)
    expect(component).not.toMatch(/\.delete\(\)/)
  })
})
