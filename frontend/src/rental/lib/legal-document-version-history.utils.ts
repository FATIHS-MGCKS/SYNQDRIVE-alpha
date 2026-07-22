import type { LegalDocumentDto } from '../../lib/api';
import { CONSUMER_INFORMATION_VARIANT_LABELS_DE, LEGAL_DOCUMENT_TYPE_CONFIGS } from './legal-document-types';
import type { LegalDocumentVersionHistoryItem } from './legal-document-version-history.types';

export const VERSION_HISTORY_PAGE_SIZE = 15;

const SCAN_LABELS_DE: Record<string, string> = {
  UPLOADED: 'Hochgeladen',
  PENDING: 'Ausstehend',
  SCANNING: 'Wird gescannt',
  SCAN_PASSED: 'OK',
  FAILED: 'Fehlgeschlagen',
  INFECTED: 'Infiziert',
  REJECTED: 'Abgelehnt',
  QUARANTINED: 'Quarantäne',
};

const INTEGRITY_LABELS_DE: Record<string, string> = {
  UNVERIFIED: 'Ungeprüft',
  VERIFIED: 'Verifiziert',
  CHECKSUM_MISMATCH: 'Prüfsumme abweichend',
  MISSING_OBJECT: 'Datei fehlt',
  STORAGE_ERROR: 'Speicherfehler',
  INTEGRITY_FAILED: 'Integrität fehlgeschlagen',
};

export function formatScanStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return SCAN_LABELS_DE[status.toUpperCase()] ?? status;
}

export function formatIntegrityStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return INTEGRITY_LABELS_DE[status.toUpperCase()] ?? status;
}

export function shortenChecksum(checksum: string | null | undefined): string | null {
  if (!checksum?.trim()) return null;
  const value = checksum.trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function resolveVariantLabel(doc: LegalDocumentDto): string | null {
  const variant = doc.documentVariant ?? doc.legalVariant;
  if (!variant) return null;
  return (
    CONSUMER_INFORMATION_VARIANT_LABELS_DE[
      variant as keyof typeof CONSUMER_INFORMATION_VARIANT_LABELS_DE
    ] ?? variant
  );
}

export function mapDtoToVersionHistoryItem(doc: LegalDocumentDto): LegalDocumentVersionHistoryItem {
  const categoryTitle =
    LEGAL_DOCUMENT_TYPE_CONFIGS.find((c) => c.key === doc.documentType)?.title ?? doc.documentType;

  return {
    id: doc.id,
    documentType: doc.documentType,
    categoryTitle,
    versionLabel: doc.versionLabel,
    variantLabel: resolveVariantLabel(doc),
    language: doc.language,
    jurisdiction: doc.jurisdiction ?? null,
    status: doc.status,
    validFrom: doc.validFrom ?? null,
    validUntil: doc.validUntil ?? null,
    approvedAt: doc.approvedAt ?? null,
    activatedAt: doc.activatedAt ?? doc.activeFrom ?? null,
    checksumShort: shortenChecksum(doc.checksum),
    checksum: doc.checksum ?? null,
    scanStatus: doc.scanStatus ?? null,
    integrityStatus: doc.integrityStatus ?? null,
    snapshotCount: doc.snapshotCount ?? 0,
    fileName: doc.fileName,
  };
}

export function buildVersionHistoryQueryParams(input: {
  documentType: string;
  page: number;
  filters: import('./legal-document-version-history.types').LegalDocumentVersionHistoryFilters;
  sort: import('./legal-document-version-history.types').LegalDocumentVersionHistorySort;
  order: 'asc' | 'desc';
}) {
  const params: Record<string, string | number> = {
    documentType: input.documentType,
    page: input.page,
    limit: VERSION_HISTORY_PAGE_SIZE,
    sort: input.sort,
    order: input.order,
  };
  if (input.filters.language) params.language = input.filters.language;
  if (input.filters.status) params.status = input.filters.status;
  if (input.filters.jurisdiction) params.jurisdiction = input.filters.jurisdiction;
  if (input.filters.from) params.from = new Date(input.filters.from).toISOString();
  if (input.filters.to) params.to = new Date(input.filters.to).toISOString();
  return params;
}
