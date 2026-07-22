import type { IamMfaState, IamRiskClassification } from '../../../lib/api';
import type { TranslationKey } from '../../i18n/translations/en';

export const IAM_TABS = [
  { id: 'team' as const, labelKey: 'iam.tab.team' as TranslationKey },
  { id: 'roles' as const, labelKey: 'iam.tab.roles' as TranslationKey },
  { id: 'security' as const, labelKey: 'iam.tab.security' as TranslationKey },
];

export type IamTabId = (typeof IAM_TABS)[number]['id'];

export const MFA_STATE_LABEL: Record<IamMfaState, TranslationKey> = {
  ENABLED: 'iam.mfa.enabled',
  DISABLED: 'iam.mfa.disabled',
  REQUIRED: 'iam.mfa.required',
  UNKNOWN: 'iam.mfa.unknown',
  NOT_SUPPORTED: 'iam.mfa.notSupported',
  ACTION_REQUIRED: 'iam.mfa.actionRequired',
};

export const RISK_LABEL: Record<IamRiskClassification, TranslationKey> = {
  LOW: 'iam.risk.low',
  MEDIUM: 'iam.risk.medium',
  HIGH: 'iam.risk.high',
  CRITICAL: 'iam.risk.critical',
};

export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}
