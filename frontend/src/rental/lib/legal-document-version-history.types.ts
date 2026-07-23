export interface LegalDocumentVersionHistoryFilters {
  language: string;
  status: string;
  jurisdiction: string;
  from: string;
  to: string;
}

export const EMPTY_VERSION_HISTORY_FILTERS: LegalDocumentVersionHistoryFilters = {
  language: '',
  status: '',
  jurisdiction: '',
  from: '',
  to: '',
};

export type LegalDocumentVersionHistorySort =
  | 'createdAt'
  | 'activatedAt'
  | 'versionLabel'
  | 'status';

export interface LegalDocumentVersionHistoryItem {
  id: string;
  documentType: string;
  categoryTitle: string;
  versionLabel: string;
  variantLabel: string | null;
  language: string;
  jurisdiction: string | null;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  checksumShort: string | null;
  checksum: string | null;
  scanStatus: string | null;
  integrityStatus: string | null;
  snapshotCount: number;
  fileName: string;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
