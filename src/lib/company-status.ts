/**
 * How a company's relationship with the platform is described.
 *
 * The label is never inferred from a name. A household brand is not a partner
 * just because it sits in the directory — that would be a claim the product
 * cannot back up. Instead the status comes from something the platform can
 * actually observe:
 *
 *   hiring_partner    the company has an active role posted here
 *   assisting_partner students have filed interview experiences for it
 *                     (the company is helping candidates prepare), no roles yet
 *   future_partner    real company on our onboarding list; nothing posted yet
 *
 * Every surface (catalogue, detail page, API) resolves the label through these
 * helpers, so one company can never read "Hiring partner" on one screen and
 * "Future partner" on another.
 */
export type PartnerStatus = 'hiring_partner' | 'assisting_partner' | 'future_partner'

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  hiring_partner: 'Hiring partner',
  assisting_partner: 'Assisting partner',
  future_partner: 'Future partner',
}

export const PARTNER_STATUS_NOTE: Record<PartnerStatus, string> = {
  hiring_partner: 'Posts roles on ConnectToCampus.',
  assisting_partner: 'Students have shared their interview process; nothing posted here yet.',
  future_partner:
    'On our onboarding list — nothing live yet. It can become an assisting partner as soon as students share its process.',
}

/** Chip tone per status, so the same label always paints the same way. */
export const PARTNER_STATUS_TONE: Record<PartnerStatus, string> = {
  hiring_partner: 'hc-tag--success',
  assisting_partner: 'hc-tag--accent',
  future_partner: 'hc-tag--ghost',
}

export function partnerStatusOf(input: { openRoles?: number | null; experienceCount?: number | null }): PartnerStatus {
  if ((input.openRoles ?? 0) > 0) return 'hiring_partner'
  if ((input.experienceCount ?? 0) > 0) return 'assisting_partner'
  return 'future_partner'
}

/** `2026` → "since 2026"; a missing year renders nothing rather than a guess. */
export function foundedLabel(year?: number | null): string | null {
  return year ? `since ${year}` : null
}
