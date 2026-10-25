/**
 * A SHARED PROFILE LINK MUST READ LIKE A PERSON, NOT THE PRODUCT.
 *
 * /profile/[username] is a client page, so before this layout every shared
 * link previewed as the root title ("ConnectToCampus — Interview Experiences…")
 * with no avatar. A server layout over the route now supplies the name, handle,
 * headline and avatar.
 *
 * The page's own visibility rule is deliberate and must NOT be duplicated here:
 * robots.txt disallows /profile (these are link previews, not a ranking play),
 * and the client page decides who sees a profile — so the server must never
 * 404 a handle it read through the service role.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const layout = read('src/app/profile/[username]/layout.tsx')

describe('a profile previews as its owner', () => {
  it('builds the title and description from the profile itself', () => {
    expect(layout).toMatch(/export async function generateMetadata/)
    expect(layout).toMatch(/const title = `\$\{name\} \(@\$\{username\}\) · ConnectToCampus`/)
    expect(layout).toMatch(/profile\?\.headline\?\.trim\(\)/)
  })

  it('points the canonical at the handle and marks it noindex', () => {
    expect(layout).toMatch(/alternates: \{ canonical: `\/profile\/\$\{username\}` \}/)
    // robots.txt already disallows /profile; this keeps the two in agreement
    // even if the file changes.
    expect(layout).toMatch(/robots: \{ index: false, follow: true \}/)
  })

  it('ships the avatar and an Open Graph profile card', () => {
    expect(layout).toMatch(/type: 'profile'/)
    expect(layout).toMatch(/username: profile\?\.username \|\| username/)
    expect(layout).toMatch(/images: profile\?\.avatar_url/)
  })

  it('reads only the fields a preview may show, never `*`', () => {
    expect(layout).toMatch(/\.select\('full_name, username, headline, bio, avatar_url, campuses\(name\)'\)/)
    expect(layout).not.toMatch(/\.select\('\*'/)
  })

  it('lets the client page keep the visibility decision — no server 404', () => {
    // Sliced past the doc comment (which explains the rule in words) so the
    // assertion reads CODE: the handler below must never 404 a handle it read
    // through the service role.
    const handlers = layout.slice(layout.indexOf('export async function generateMetadata'))
    expect(handlers).not.toMatch(/notFound\(\)/)
    expect(layout).not.toMatch(/import \{ notFound \}/)
    expect(layout).toMatch(/export default function ProfileUsernameLayout/)
  })

  it('treats anything that cannot be a handle as a miss', () => {
    expect(layout).toMatch(/a-zA-Z0-9\._-\]\{1,40\}/)
  })
})
