import type { MisuseCaseDecisionEligibility, MisuseCaseStatus } from '../../lib/api';

export const MISUSE_CASE_STATUS_LABEL: Record<MisuseCaseStatus, string> = {
  CANDIDATE: 'Kandidat',
  ACTIVE: 'Aktiv',
  REVIEW_REQUIRED: 'Prüfung erforderlich',
  CONFIRMED: 'Bestätigt',
  DISMISSED: 'Verworfen',
  RESOLVED: 'Erledigt',
  SUPERSEDED: 'Ersetzt',
  NOT_ASSESSABLE: 'Nicht bewertbar',
};

export const MISUSE_CASE_DECISION_ELIGIBILITY_HINT: Record<MisuseCaseDecisionEligibility, string> = {
  INFORMATIONAL_ONLY: 'Nur informativ — keine automatische Kundenbelastung',
  REVIEW_ONLY: 'Manuelle Prüfung erforderlich',
  MANUAL_CONFIRMATION_ONLY: 'Bestätigung nur manuell möglich',
  OPERATIONAL_ELIGIBLE: 'Operative Folgeaktion möglich — keine automatische Belastung',
  NOT_ELIGIBLE: 'Keine operative Entscheidung',
};

export function misuseCaseStatusLabel(status: MisuseCaseStatus | string | undefined): string | null {
  if (!status) return null;
  return MISUSE_CASE_STATUS_LABEL[status as MisuseCaseStatus] ?? status;
}

export function misuseCaseDecisionHint(
  eligibility: MisuseCaseDecisionEligibility | string | undefined,
): string | null {
  if (!eligibility) return null;
  return MISUSE_CASE_DECISION_ELIGIBILITY_HINT[eligibility as MisuseCaseDecisionEligibility] ?? null;
}
