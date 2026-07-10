import type { TranslationKey } from '../rental/i18n/translations/en';

const DOC_TYPE_KEYS: Record<string, TranslationKey> = {
  BOOKING_INVOICE: 'email.docType.BOOKING_INVOICE',
  DEPOSIT_RECEIPT: 'email.docType.DEPOSIT_RECEIPT',
  RENTAL_CONTRACT: 'email.docType.RENTAL_CONTRACT',
  TERMS_AND_CONDITIONS: 'email.docType.TERMS_AND_CONDITIONS',
  WITHDRAWAL_INFORMATION: 'email.docType.WITHDRAWAL_INFORMATION',
  HANDOVER_PICKUP: 'email.docType.HANDOVER_PICKUP',
  HANDOVER_RETURN: 'email.docType.HANDOVER_RETURN',
  FINAL_INVOICE: 'email.docType.FINAL_INVOICE',
};

const OUTBOUND_STATUS_KEYS: Record<string, TranslationKey> = {
  QUEUED: 'email.outboundStatus.QUEUED',
  SENDING: 'email.outboundStatus.SENDING',
  SENT: 'email.outboundStatus.SENT',
  FAILED: 'email.outboundStatus.FAILED',
  SENT_SIMULATED: 'email.outboundStatus.SENT_SIMULATED',
};

const DOMAIN_STATUS_KEYS: Record<string, TranslationKey> = {
  NOT_CONFIGURED: 'email.domain.status.NOT_CONFIGURED',
  PENDING_DNS: 'email.domain.status.PENDING_DNS',
  VERIFYING: 'email.domain.status.VERIFYING',
  VERIFIED: 'email.domain.status.VERIFIED',
  FAILED: 'email.domain.status.FAILED',
};

export function emailDocTypeLabel(
  t: (key: TranslationKey) => string,
  documentType: string,
  fallback?: string | null,
): string {
  const key = DOC_TYPE_KEYS[documentType];
  return key ? t(key) : fallback ?? documentType;
}

export function outboundEmailStatusLabel(
  t: (key: TranslationKey) => string,
  status: string,
): string {
  const key = OUTBOUND_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function emailDomainStatusLabel(
  t: (key: TranslationKey) => string,
  status: string,
): string {
  const key = DOMAIN_STATUS_KEYS[status];
  return key ? t(key) : status;
}
