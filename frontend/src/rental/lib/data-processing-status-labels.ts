import type { TranslationKey } from '../i18n/translations/en';

const LIFECYCLE_STATUS_KEYS: Record<string, TranslationKey> = {
  DRAFT: 'dataProcessing.status.lifecycle.DRAFT',
  IN_REVIEW: 'dataProcessing.status.lifecycle.IN_REVIEW',
  APPROVED: 'dataProcessing.status.lifecycle.APPROVED',
  SCHEDULED: 'dataProcessing.status.lifecycle.SCHEDULED',
  ACTIVE: 'dataProcessing.status.lifecycle.ACTIVE',
  SUSPENDED: 'dataProcessing.status.lifecycle.SUSPENDED',
  SUPERSEDED: 'dataProcessing.status.lifecycle.SUPERSEDED',
  REVOKED: 'dataProcessing.status.lifecycle.REVOKED',
  EXPIRED: 'dataProcessing.status.lifecycle.EXPIRED',
  REJECTED: 'dataProcessing.status.lifecycle.REJECTED',
};

const ENFORCEMENT_STATUS_KEYS: Record<string, TranslationKey> = {
  ENFORCED: 'dataProcessing.status.enforcement.ENFORCED',
  PARTIALLY_ENFORCED: 'dataProcessing.status.enforcement.PARTIALLY_ENFORCED',
  NOT_IMPLEMENTED: 'dataProcessing.status.enforcement.NOT_IMPLEMENTED',
  ENFORCEMENT_ERROR: 'dataProcessing.status.enforcement.ENFORCEMENT_ERROR',
  DISABLED: 'dataProcessing.status.enforcement.DISABLED',
};

export function labelLifecycleStatus(
  status: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const key = LIFECYCLE_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function labelEnforcementStatus(
  status: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const key = ENFORCEMENT_STATUS_KEYS[status];
  return key ? t(key) : status;
}
