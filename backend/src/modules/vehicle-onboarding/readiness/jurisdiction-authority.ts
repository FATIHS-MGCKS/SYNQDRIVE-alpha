import type { Organization } from '@prisma/client';

/**
 * READINESS_JURISDICTION_AUTHORITY=Organization.country (optional ISO-2)
 *
 * When absent, jurisdiction is JURISDICTION_UNKNOWN and only global profile rules apply.
 * TÜV/BOKraft-specific blockers are not enforced without an established jurisdiction rule set.
 */
export function readinessJurisdictionAuthorityLabel(): string {
  return 'Organization.country (optional); else JURISDICTION_UNKNOWN';
}

export function resolveJurisdictionContext(org: Pick<Organization, 'country'>): {
  code: string;
  authority: string;
} {
  const raw = org.country?.trim().toUpperCase();
  if (raw && raw.length === 2) {
    return { code: raw, authority: 'Organization.country' };
  }
  return { code: 'JURISDICTION_UNKNOWN', authority: 'none' };
}
