/**
 * HELPFUL VOTE TALLY — a vote must actually change the count.
 *
 * `interview_experiences` can only be UPDATEd by its author under RLS. The
 * route used the reader's cookie client for the aggregate update, so the write
 * matched zero rows, the error was discarded, and the UI refetched the same
 * unchanged total. The tally now runs through the service role and both writes
 * are checked.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const route = fs.readFileSync(path.join(root, 'src/app/api/experiences/route.ts'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src/app/experiences/ExperiencesApp.tsx'), 'utf8')

describe('the helpful tally is written server-side', () => {
  it('recalculates the total with the service-role client', () => {
    expect(route).toMatch(/function serviceClient/)
    expect(route).toMatch(/const admin = serviceClient\(\)/)
    expect(route).toMatch(/admin\s*\.from\('interview_votes'\)\s*\.select\('vote'\)/)
  })

  it('never leaves a failed vote or tally write silent', () => {
    expect(route).toMatch(/if \(voteError\) return serverError/)
    expect(route).toMatch(/if \(tallyError\) return serverError/)
    expect(route).toMatch(/if \(updateError\) return serverError/)
  })

  it('rejects a vote that is not +1 or -1', () => {
    expect(route).toMatch(/vote !== 1 && vote !== -1/)
  })
})

describe('the card reflects the vote immediately', () => {
  it('applies the server total to the clicked experience', () => {
    expect(app).toMatch(/upvotes: data\.upvotes \?\? exp\.upvotes/)
  })

  it('surfaces a failed vote instead of swallowing it', () => {
    expect(app).toMatch(/if \(!res\.ok\)/)
    expect(app).toMatch(/setError\(data\.error \|\| 'Could not save your vote/)
  })
})
