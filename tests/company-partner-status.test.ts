/**
 * COMPANY PARTNER STATUS — guards the honesty rule for the company directory.
 *
 * The directory lists real companies (Google, Amazon, Zerodha…), and the first
 * build presented every one of them as verified, with a tick beside the name.
 * That was a claim the product cannot back up: none of them had signed anything.
 * The rule now is that a relationship label comes from observable activity only
 * — a role posted here, or an interview experience a student filed — never from
 * how famous the name is. These tests pin that derivation down, and fail if a
 * page goes back to rendering the stored `is_verified` flag as a trust mark.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import {
  PARTNER_STATUS_LABEL,
  PARTNER_STATUS_NOTE,
  PARTNER_STATUS_TONE,
  foundedLabel,
  partnerStatusOf,
} from '@/lib/company-status'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('partner status derivation', () => {
  it('is a hiring partner only once a role is posted', () => {
    expect(partnerStatusOf({ openRoles: 3, experienceCount: 0 })).toBe('hiring_partner')
    expect(partnerStatusOf({ openRoles: 1, experienceCount: 12 })).toBe('hiring_partner')
  })

  it('is an assisting partner when students filed experiences but no role is posted', () => {
    expect(partnerStatusOf({ openRoles: 0, experienceCount: 2 })).toBe('assisting_partner')
  })

  it('defaults to future partner — a known name earns nothing', () => {
    expect(partnerStatusOf({ openRoles: 0, experienceCount: 0 })).toBe('future_partner')
    expect(partnerStatusOf({})).toBe('future_partner')
    expect(partnerStatusOf({ openRoles: null, experienceCount: null })).toBe('future_partner')
  })
})

describe('partner status labels', () => {
  const statuses = ['hiring_partner', 'assisting_partner', 'future_partner'] as const

  it('gives every status a label, a note and a chip tone', () => {
    for (const status of statuses) {
      expect(PARTNER_STATUS_LABEL[status]).toMatch(/partner/i)
      expect(PARTNER_STATUS_NOTE[status].length).toBeGreaterThan(10)
      expect(PARTNER_STATUS_TONE[status]).toMatch(/^hc-tag/)
    }
  })

  it('does not call an unposted company a partner of the hiring kind', () => {
    expect(PARTNER_STATUS_LABEL.future_partner).not.toMatch(/hiring/i)
    expect(PARTNER_STATUS_NOTE.future_partner).toMatch(/no roles posted/i)
  })

  it('renders a founding year only when the directory holds one', () => {
    expect(foundedLabel(1998)).toBe('since 1998')
    expect(foundedLabel(null)).toBeNull()
    expect(foundedLabel(undefined)).toBeNull()
  })
})

describe('the directory never borrows a trust mark', () => {
  it('does not render the stored is_verified flag as a verification tick', () => {
    for (const page of ['src/app/companies/page.tsx', 'src/app/companies/[slug]/page.tsx']) {
      expect(read(page)).not.toMatch(/is_verified/)
    }
  })

  it('derives the label through the shared helper in both company APIs', () => {
    for (const route of ['src/app/api/companies/route.ts', 'src/app/api/companies/[slug]/route.ts']) {
      expect(read(route)).toMatch(/partnerStatusOf/)
    }
  })
})
