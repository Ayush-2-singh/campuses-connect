/**
 * SECURITY HARDENING — locks the fixes from the vulnerability sweep.
 *
 * 1. The profiles privilege guard: `profiles_update` lets users edit their
 *    own row, and the old trigger only protected `status` — a user could
 *    set is_verified/college_email_verified on themselves from the browser
 *    console. The migration guard must stay.
 * 2. Every expensive/auth-adjacent endpoint keeps a per-user rate limit.
 * 3. The emailed-token verification flow moves verification through the
 *    service role (the only non-moderator path the guard allows).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('profiles cannot self-escalate verification', () => {
  const migration = read('supabase/migrations/20261012_privilege_guard.sql')

  it('guards is_verified and college_email_verified in the trigger', () => {
    expect(migration).toContain("-> 'is_verified'")
    expect(migration).toContain("-> 'college_email_verified'")
    expect(migration).toContain('auth.uid() IS NOT NULL')
    expect(migration).toContain("has_mod_permission(auth.uid(), 'users.manage')")
    expect(migration).toContain('RAISE EXCEPTION')
  })
})

describe('per-user rate limits on expensive endpoints', () => {
  it('campus-change uploads are limited', () => {
    const route = read('src/app/api/campus-change/route.ts')
    expect(route).toContain("checkRateLimit(user.id, 'campus-change:post'")
    expect(route).toContain('429')
  })

  it('LiveKit token minting is limited', () => {
    const route = read('src/app/api/live-voice-chat/token/route.ts')
    expect(route).toContain("p_endpoint: 'voice:token'")
    expect(route).toContain('429')
  })

  it('push subscription churn is limited', () => {
    const route = read('src/app/api/notifications/push/route.ts')
    expect(route).toContain("checkRateLimit(user.id, 'push:subscribe'")
    expect(route).toContain('429')
  })

  it('token guessing against verify-college-email is limited', () => {
    const route = read('src/app/api/verify-college-email/route.ts')
    expect(route).toContain("checkRateLimit(user.id, 'verify:college-email'")
    expect(route).toContain('429')
  })

  it('the AI-expensive brain routes stay limited (no regression)', () => {
    const ask = read('src/app/api/brain/ask/route.ts')
    expect(ask).toContain('checkRateLimit')
  })
})

describe('verification flips only through the server', () => {
  it('verify-college-email writes through the service role', () => {
    const route = read('src/app/api/verify-college-email/route.ts')
    expect(route).toContain('getSupabaseAdmin()')
    // the privileged profiles update must ride the admin client, not the
    // caller-scoped one (which the privilege guard now blocks)
    expect(route).not.toMatch(/await supabase\s*\n?\s*\.from\('profiles'\)\s*\n?\s*\.update\(\{ college_email/)
  })

  it('the token lookup stays caller-scoped (RLS limits guesses to own rows)', () => {
    const route = read('src/app/api/verify-college-email/route.ts')
    expect(route).toContain(".from('college_email_verifications')")
  })
})
