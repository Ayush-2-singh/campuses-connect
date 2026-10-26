/**
 * BLOG POSTS GET THEIR OWN LABELS.
 *
 * /blog/[slug] is a client page (likes, comments, view counter), so
 * `generateMetadata` cannot live on it — it lives in a server layout over the
 * same route. Before this, every post inherited the root title, had no
 * canonical, no Open Graph article card and no structured data, which is how a
 * content site ends up ranking for nothing.
 *
 * Guards the contract that makes a post indexable: a title/description built
 * from the post itself, a canonical that points at itself, BlogPosting JSON-LD
 * with the body in it (the page's own text arrives from a client fetch), only
 * published rows, and a 404 for anything else.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const layout = read('src/app/blog/[slug]/layout.tsx')

describe('a blog post is labelled on the server', () => {
  it('is a server layout over the client page — that is the only place metadata can live', () => {
    expect(layout).not.toMatch(/^'use client'/m)
    expect(layout).toMatch(/export async function generateMetadata/)
    expect(layout).toMatch(/export default async function BlogPostLayout/)
  })

  it('titles and describes the post from its own content', () => {
    // With the brand suffix written out: /blog/layout.tsx declares a plain
    // string title, which stops the root `%s · ConnectToCampus` template from
    // reaching this segment (the rendered post had no suffix before).
    expect(layout).toMatch(/const title = `\$\{post\.title\} · ConnectToCampus`/)
    expect(layout).toMatch(/function summaryOf/)
    expect(layout).toMatch(/post\.excerpt \|\| post\.body/)
    // Truncated, so a long post cannot emit a description Google ignores.
    expect(layout).toMatch(/slice\(0, max - 1\)/)
  })

  it('points the canonical, Open Graph article and Twitter card at itself', () => {
    expect(layout).toMatch(/alternates: \{ canonical: `\/blog\/\$\{slug\}` \}/)
    expect(layout).toMatch(/type: 'article'/)
    expect(layout).toMatch(/publishedTime: published/)
    expect(layout).toMatch(/authors: \[authorNameOf\(post\)\]/)
  })

  it('revalidates so a new post is visible without a deploy', () => {
    expect(layout).toMatch(/export const revalidate = 600/)
  })
})

describe('each post publishes BlogPosting structured data', () => {
  it('carries the headline, body, dates, author and publisher', () => {
    expect(layout).toMatch(/'@type': 'BlogPosting'/)
    expect(layout).toMatch(/headline: post\.title/)
    expect(layout).toMatch(/articleBody: \(post\.body \?\? ''\)\.slice\(0, 60_000\)/)
    expect(layout).toMatch(/datePublished: post\.published_at \?\? post\.created_at/)
    expect(layout).toMatch(/author: \{ '@type': 'Person', name: authorNameOf\(post\) \}/)
    expect(layout).toMatch(/'@type': 'Organization'/)
  })

  it('names the section from the category key the editor picks', () => {
    expect(layout).toMatch(/interview_experience: 'Interview Experience'/)
    expect(layout).toMatch(/articleSection: CATEGORY_LABEL\[post\.category \?\? ''\]/)
  })

  it('escapes the payload so a `<` in a post cannot break the script tag', () => {
    expect(layout).toMatch(/replace\(/)
    expect(layout).toMatch(/\\u003c/)
  })

  it('only ever reads published posts', () => {
    expect(layout).toMatch(/\.eq\('status', 'published'\)/)
    expect(layout).toMatch(/notFound\(\)/)
  })

  it('handles PostgREST answering a to-one relation either way', () => {
    expect(layout).toMatch(/Array\.isArray\(profiles\)/)
  })
})
