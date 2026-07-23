import type { TranslationKey } from '../i18n/translations/en';
import type { ConsumerInformationVariant } from './legal-document-types';
import { LEGAL_DOCUMENT_TYPE, LEGAL_DOCUMENT_TYPE_CONFIGS } from './legal-document-types';
import type { LegalDocumentLifecycleAction } from './legal-document-lifecycle.types';

export type LegalDocumentsTranslate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

const STATUS_KEY_PREFIX = 'legalDocuments.status.' as const;
const SCAN_KEY_PREFIX = 'legalDocuments.scan.' as const;
const INTEGRITY_KEY_PREFIX = 'legalDocuments.integrity.' as const;
const EVENT_KEY_PREFIX = 'legalDocuments.lifecycle.event.' as const;
const VARIANT_KEY_PREFIX = 'legalDocuments.variant.' as const;
const TYPE_KEY_PREFIX = 'legalDocuments.type.' as const;

export function legalDocumentStatusKey(status: string): TranslationKey {
  return `${STATUS_KEY_PREFIX}${status}` as TranslationKey;
}

export function formatLegalDocumentStatusI18n(status: string, t: LegalDocumentsTranslate): string {
  const key = legalDocumentStatusKey(status);
  const translated = t(key);
  return translated === key ? status : translated;
}

export function legalDocumentTypeTitleKey(documentType: string): TranslationKey {
  return `${TYPE_KEY_PREFIX}${documentType}.title` as TranslationKey;
}

export function legalDocumentTypeHintKey(documentType: string): TranslationKey {
  return `${TYPE_KEY_PREFIX}${documentType}.hint` as TranslationKey;
}

export function formatLegalDocumentTypeTitle(documentType: string, t: LegalDocumentsTranslate): string {
  const key = legalDocumentTypeTitleKey(documentType);
  const translated = t(key);
  return translated === key ? documentType : translated;
}

export function formatLegalDocumentVariantLabel(
  variant: string | null | undefined,
  t: LegalDocumentsTranslate,
): string | null {
  if (!variant) return null;
  const key = `${VARIANT_KEY_PREFIX}${variant}` as TranslationKey;
  const translated = t(key);
  return translated === key ? variant : translated;
}

export function formatScanStatusLabelI18n(
  status: string | null | undefined,
  t: LegalDocumentsTranslate,
): string {
  if (!status) return t('legalDocuments.common.emDash');
  const key = `${SCAN_KEY_PREFIX}${status.toUpperCase()}` as TranslationKey;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function formatIntegrityStatusLabelI18n(
  status: string | null | undefined,
  t: LegalDocumentsTranslate,
): string {
  if (!status) return t('legalDocuments.common.emDash');
  const key = `${INTEGRITY_KEY_PREFIX}${status.toUpperCase()}` as TranslationKey;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function formatLifecycleEventLabelI18n(eventType: string, t: LegalDocumentsTranslate): string {
  const key = `${EVENT_KEY_PREFIX}${eventType}` as TranslationKey;
  const translated = t(key);
  return translated === key ? eventType : translated;
}

export function lifecycleActionTitleKey(action: LegalDocumentLifecycleAction): TranslationKey {
  return `legalDocuments.lifecycle.action.${action}.title` as TranslationKey;
}

export function lifecycleActionDescriptionKey(action: LegalDocumentLifecycleAction): TranslationKey {
  return `legalDocuments.lifecycle.action.${action}.description` as TranslationKey;
}

export function lifecycleActionConfirmKey(action: LegalDocumentLifecycleAction): TranslationKey {
  return `legalDocuments.lifecycle.action.${action}.confirm` as TranslationKey;
}

export function lifecycleActionLabelKey(action: LegalDocumentLifecycleAction): TranslationKey {
  return `legalDocuments.lifecycle.actionLabel.${action}` as TranslationKey;
}

export function lifecycleConflictKey(code: string): TranslationKey | null {
  const map: Record<string, TranslationKey> = {
    LEGAL_DOCUMENT_ACTIVE_CONFLICT: 'legalDocuments.lifecycle.conflict.ACTIVE_CONFLICT',
    LEGAL_DOCUMENT_SCOPE_CONFLICT: 'legalDocuments.lifecycle.conflict.SCOPE_CONFLICT',
    LEGAL_DOCUMENT_FOUR_EYES_VIOLATION: 'legalDocuments.lifecycle.conflict.FOUR_EYES_VIOLATION',
    LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION:
      'legalDocuments.lifecycle.conflict.INVALID_STATUS_TRANSITION',
    LEGAL_DOCUMENT_NOT_ACTIVATABLE: 'legalDocuments.lifecycle.conflict.NOT_ACTIVATABLE',
    LEGAL_DOCUMENT_SCAN_NOT_PASSED: 'legalDocuments.lifecycle.conflict.SCAN_NOT_PASSED',
  };
  return map[code] ?? null;
}

export function optionLabelKey(
  group: 'language' | 'jurisdiction' | 'segment' | 'channel' | 'stationScope' | 'productScope',
  value: string,
): TranslationKey {
  if (group === 'productScope' && !value) {
    return 'legalDocuments.option.productScope.all';
  }
  return `legalDocuments.option.${group}.${value}` as TranslationKey;
}

export function formatOptionLabel(
  group: 'language' | 'jurisdiction' | 'segment' | 'channel' | 'stationScope' | 'productScope',
  value: string | null | undefined,
  t: LegalDocumentsTranslate,
): string {
  if (!value && group !== 'productScope') return t('legalDocuments.common.emDash');
  const key = optionLabelKey(group, value ?? '');
  const translated = t(key);
  return translated === key ? (value ?? t('legalDocuments.common.emDash')) : translated;
}

export function resolveLegalDocumentTypeConfig(documentType: string, t: LegalDocumentsTranslate) {
  const config = LEGAL_DOCUMENT_TYPE_CONFIGS.find((c) => c.key === documentType);
  if (!config) {
    return { key: documentType, title: documentType, hint: '' };
  }
  return {
    key: config.key,
    title: t(legalDocumentTypeTitleKey(config.key)),
    hint: t(legalDocumentTypeHintKey(config.key)),
    variants: config.variants?.map((v) => ({
      value: v.value,
      label: formatLegalDocumentVariantLabel(v.value, t) ?? v.value,
    })),
    legacyKeys: config.legacyKeys,
  };
}

export function legalDocumentGroupTitle(
  documentType: string,
  legacyDocumentType: string | null | undefined,
  t: LegalDocumentsTranslate,
): string {
  if (
    documentType === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION ||
    documentType === LEGAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION ||
    legacyDocumentType === LEGAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION
  ) {
    return formatLegalDocumentTypeTitle(LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION, t);
  }
  return formatLegalDocumentTypeTitle(documentType, t);
}

export const LEGAL_DOCUMENTS_I18N_KEY_PREFIX = 'legalDocuments.' as const;

/** Keys used by legal-documents.i18n.test.ts — keep in sync with legal-documents.en.ts */
export { legalDocumentsEn } from '../i18n/translations/legal-documents.en';
export type { LegalDocumentsTranslationKey } from '../i18n/translations/legal-documents.en';
