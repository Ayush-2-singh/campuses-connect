/**
 * ONE WRITE-UP, ONE URL.
 *
 * Before this route every interview experience lived only inside the
 * /experiences list: nothing could be shared, nothing could be indexed, and
 * the whole list required a session to read — a crawler saw an empty shell.
 *
 * Guards the contract that makes a detail page worth having:
 *   • the page is SERVER-rendered (the write-up must be in the HTML, not
 *     fetched by a client bundle a crawler never executes);
 *   • it carries its own title / description / canonical / Article JSON-LD;
 *   • it does not repeat the embedded-profiles mistake that 500'd the list API;
 *   • a bad id is a 404, not a 500;
 *   • the list links into it and the sitemap lists it — a route Google cannot
 *     reach is a route that cannot rank.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const detail = read('src/app/experiences/[id]/page.tsx')
const list = read('src/app/experiences/page.tsx')
const sitemap = read('src/app/sitemap.ts')

describe('the write-up is rendered on the server', () => {
  it('is a server component — the text must be in the HTML', () => {
    expect(detail).not.toMatch(/^'use client'/m)
    expect(detail).toMatch(/export default async function ExperienceDetailPage/)
  })

  it('revalidates instead of freezing at build time', () => {
    expect(detail).toMatch(/export const revalidate = 600/)
  })

  it('emits Article JSON-LD with the student as author', () => {
    expect(detail).toMatch(/'@type': 'Article'/)
    expect(detail).toMatch(/datePublished: exp\.created_at/)
    expect(detail).toMatch(/author: \{ '@type': 'Person', name: authorName \}/)
    // Escaped, so a `<` inside a write-up cannot break out of the script tag.
    expect(detail).toMatch(/replace\(/)
    expect(detail).toMatch(/\\u003c/)
  })

  it('reads the author in its own query — profiles are not embeddable here', () => {
    expect(detail).toMatch(/\.from\('profiles'\)/)
    // interview_experiences.user_id points at auth.users(id); the embedded
    // select is what made /api/experiences answer 500 (PGRST200).
    expect(detail).not.toMatch(/profiles:user_id/)
  })
})

describe('each write-up owns its metadata', () => {
  it('builds a title and description from the company and role', () => {
    expect(detail).toMatch(/export async function generateMetadata/)
    expect(detail).toMatch(/function headlineFor/)
    expect(detail).toMatch(/companies\?\.name/)
    expect(detail).toMatch(/exp\.role \? `\$\{company\} interview experience — \$\{exp\.role\}`/)
  })

  it('points the canonical, Open Graph and Twitter card at itself', () => {
    expect(detail).toMatch(/alternates: \{ canonical: `\/experiences\/\$\{id\}` \}/)
    expect(detail).toMatch(/type: 'article'/)
    expect(detail).toMatch(/twitter: \{/)
  })

  it('is a 404, never a 500, for an id that is not a UUID', () => {
    expect(detail).toMatch(/0-9a-f\]\{8\}/)
    expect(detail).toMatch(/notFound\(\)/)
  })
})

describe('the route is reachable by crawlers and by people', () => {
  it('links every card title into the detail route', () => {
    expect(list).toMatch(/import Link from 'next\/link'/)
    expect(list).toMatch(/href=\{`\/experiences\/\$\{exp\.id\}`\}/)
  })

  it('lists the write-ups in the sitemap', () => {
    expect(sitemap).toMatch(/async function experiencePaths/)
    expect(sitemap).toMatch(/\.from\('interview_experiences'\)/)
    expect(sitemap).toMatch(/export default async function sitemap/)
    expect(sitemap).toMatch(/priority: 0\.7/)
  })
})
