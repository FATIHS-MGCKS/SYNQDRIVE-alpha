import type { MisuseCaseDecisionEligibility, MisuseCaseStatus } from '../../lib/api';
import {
  resolveMisuseCaseDecisionHint,
  resolveMisuseCaseStatusLabel,
  type MisuseStressTranslate,
} from './rental-misuse-stress-i18n';

export function misuseCaseStatusLabel(
  t: MisuseStressTranslate,
  status: MisuseCaseStatus | string | undefined,
): string | null {
  return resolveMisuseCaseStatusLabel(t, status);
}

export function misuseCaseDecisionHint(
  t: MisuseStressTranslate,
  eligibility: MisuseCaseDecisionEligibility | string | undefined,
): string | null {
  return resolveMisuseCaseDecisionHint(t, eligibility);
}
