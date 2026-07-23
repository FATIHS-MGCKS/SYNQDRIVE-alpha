import { DOCUMENT_TYPE, legalDocumentTitleDe } from '../documents.constants';
import { normalizeLegalDocumentType } from '../legal-document-type.compat';
import {
  LEGAL_DOCUMENT_CATEGORY_KEYS,
  LEGAL_INTEGRITY_BLOCKING_STATUSES,
  LEGAL_NOTIFICATION_EXPECTED_JURISDICTION,
  LEGAL_NOTIFICATION_EXPECTED_LANGUAGE,
  LEGAL_NOTIFICATION_EXPIRY_WARNING_DAYS,
  LEGAL_SCAN_BLOCKING_STATUSES,
  type LegalDocumentCategoryKey,
} from './legal-document-operational-notification.constants';
import type { LegalDocumentOrgReadinessRow } from './legal-document-operational-notification.types';

export function legalDocumentCategoryKey(
  documentType: string,
  legalVariant?: string | null,
): LegalDocumentCategoryKey {
  const canonical = normalizeLegalDocumentType(documentType);
  if (canonical === DOCUMENT_TYPE.PRIVACY_POLICY) return 'PRIVACY_POLICY';
  if (
    canonical === DOCUMENT_TYPE.CONSUMER_INFORMATION ||
    canonical === DOCUMENT_TYPE.WITHDRAWAL_INFORMATION
  ) {
    return 'CONSUMER_INFORMATION';
  }
  return 'TERMS_AND_CONDITIONS';
}

export function categoryTitleDe(categoryKey: LegalDocumentCategoryKey): string {
  switch (categoryKey) {
    case 'PRIVACY_POLICY':
      return legalDocumentTitleDe(DOCUMENT_TYPE.PRIVACY_POLICY, null);
    case 'CONSUMER_INFORMATION':
      return legalDocumentTitleDe(DOCUMENT_TYPE.CONSUMER_INFORMATION, null);
    default:
      return legalDocumentTitleDe(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, null);
  }
}

export function groupDocumentsByCategory(
  documents: LegalDocumentOrgReadinessRow[],
): Record<LegalDocumentCategoryKey, LegalDocumentOrgReadinessRow[]> {
  const grouped: Record<LegalDocumentCategoryKey, LegalDocumentOrgReadinessRow[]> = {
    TERMS_AND_CONDITIONS: [],
    CONSUMER_INFORMATION: [],
    PRIVACY_POLICY: [],
  };
  for (const doc of documents) {
    const key = legalDocumentCategoryKey(doc.documentType, doc.legalVariant);
    grouped[key].push(doc);
  }
  return grouped;
}

export function pickActiveDocument(
  versions: LegalDocumentOrgReadinessRow[],
): LegalDocumentOrgReadinessRow | null {
  return (
    versions.find((v) => v.status === 'ACTIVE') ??
    versions.find((v) => v.status === 'SCHEDULED') ??
    null
  );
}

export function countActiveDocuments(
  versions: LegalDocumentOrgReadinessRow[],
): LegalDocumentOrgReadinessRow[] {
  return versions.filter((v) => v.status === 'ACTIVE');
}

export function isExpiringSoon(validUntil: Date | null, reference = new Date()): boolean {
  if (!validUntil) return false;
  const ms = validUntil.getTime() - reference.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  return days > 0 && days <= LEGAL_NOTIFICATION_EXPIRY_WARNING_DAYS;
}

export function hasExpectedLanguageCoverage(
  versions: LegalDocumentOrgReadinessRow[],
): boolean {
  return versions.some(
    (v) =>
      v.status === 'ACTIVE' &&
      v.language?.toLowerCase() === LEGAL_NOTIFICATION_EXPECTED_LANGUAGE,
  );
}

export function hasExpectedJurisdictionCoverage(
  versions: LegalDocumentOrgReadinessRow[],
): boolean {
  return versions.some(
    (v) =>
      v.status === 'ACTIVE' &&
      (v.jurisdictionCountry ?? '').toUpperCase() === LEGAL_NOTIFICATION_EXPECTED_JURISDICTION,
  );
}

export function isScanBlocking(scanStatus: string | null | undefined): boolean {
  return LEGAL_SCAN_BLOCKING_STATUSES.has((scanStatus ?? 'UPLOADED').toUpperCase());
}

export function isIntegrityBlocking(integrityStatus: string | null | undefined): boolean {
  if (!integrityStatus) return false;
  return LEGAL_INTEGRITY_BLOCKING_STATUSES.has(integrityStatus.toUpperCase());
}

export const LEGAL_DOCUMENT_CATEGORY_KEYS_EXPORT = LEGAL_DOCUMENT_CATEGORY_KEYS;
