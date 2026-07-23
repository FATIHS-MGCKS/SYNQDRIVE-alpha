import type { LegalDocumentDto } from '../../lib/api';
import { LEGAL_DOCUMENT_TYPE_CONFIGS } from './legal-document-types';
import type { LegalDocumentVersionHistoryItem } from './legal-document-version-history.types';
import {
  formatLegalDocumentTypeTitle,
  formatLegalDocumentVariantLabel,
  formatIntegrityStatusLabelI18n,
  formatScanStatusLabelI18n,
  type LegalDocumentsTranslate,
} from './legal-documents-i18n';

export const VERSION_HISTORY_PAGE_SIZE = 15;

export function formatScanStatusLabel(
  status: string | null | undefined,
  t?: LegalDocumentsTranslate,
): string {
  if (t) return formatScanStatusLabelI18n(status, t);
  if (!status) return '—';
  return status;
}

export function formatIntegrityStatusLabel(
  status: string | null | undefined,
  t?: LegalDocumentsTranslate,
): string {
  if (t) return formatIntegrityStatusLabelI18n(status, t);
  if (!status) return '—';
  return status;
}

export function shortenChecksum(checksum: string | null | undefined): string | null {
  if (!checksum?.trim()) return null;
  const value = checksum.trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function resolveVariantLabel(
  doc: LegalDocumentDto,
  t: LegalDocumentsTranslate,
): string | null {
  const variant = doc.documentVariant ?? doc.legalVariant;
  if (!variant) return null;
  return formatLegalDocumentVariantLabel(variant, t);
}

export function mapDtoToVersionHistoryItem(
  doc: LegalDocumentDto,
  t: LegalDocumentsTranslate,
): LegalDocumentVersionHistoryItem {
  const categoryTitle = formatLegalDocumentTypeTitle(doc.documentType, t);

  return {
    id: doc.id,
    documentType: doc.documentType,
    categoryTitle,
    versionLabel: doc.versionLabel,
    variantLabel: resolveVariantLabel(doc, t),
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

export function resolveCategoryTitle(documentType: string, t: LegalDocumentsTranslate): string {
  const config = LEGAL_DOCUMENT_TYPE_CONFIGS.find((c) => c.key === documentType);
  return config ? t(config.titleKey) : documentType;
}
