import type { LegalDocumentIntegrityStatus } from './legal-document-integrity.constants';
import { LEGAL_DOCUMENT_INTEGRITY_STATUS } from './legal-document-integrity.constants';

export interface LegalDocumentIntegrityCheckResult {
  status: LegalDocumentIntegrityStatus;
  detail?: string;
  expectedChecksum: string | null;
  actualChecksum: string | null;
  checkedAt: Date;
}

export interface LegalDocumentIntegrityCheckInput {
  organizationId: string;
  legalDocumentId: string;
  objectKey: string;
  checksum: string | null;
  sizeBytes: number | null;
}

export interface LegalDocumentStorageReconciliationMetrics {
  documentsProcessed: number;
  verified: number;
  missingObject: number;
  checksumMismatch: number;
  storageError: number;
  unverified: number;
  unexpectedObjects: number;
  durationMs: number;
  batches: number;
}

export interface LegalDocumentStorageReconciliationDrift {
  kind: 'MISSING_OBJECT' | 'CHECKSUM_MISMATCH' | 'STORAGE_ERROR' | 'UNEXPECTED_OBJECT';
  organizationId: string;
  legalDocumentId?: string;
  objectKey: string;
  detail?: string;
  expectedChecksum?: string | null;
  actualChecksum?: string | null;
}

export interface LegalDocumentStorageReconciliationRunResult {
  runId: string;
  organizationId: string | null;
  dryRun: boolean;
  status: string;
  metrics: LegalDocumentStorageReconciliationMetrics;
  drifts: LegalDocumentStorageReconciliationDrift[];
  resumedFromRunId?: string | null;
}

export function emptyReconciliationMetrics(): LegalDocumentStorageReconciliationMetrics {
  return {
    documentsProcessed: 0,
    verified: 0,
    missingObject: 0,
    checksumMismatch: 0,
    storageError: 0,
    unverified: 0,
    unexpectedObjects: 0,
    durationMs: 0,
    batches: 0,
  };
}

export function incrementMetricForStatus(
  metrics: LegalDocumentStorageReconciliationMetrics,
  status: LegalDocumentIntegrityStatus,
): void {
  metrics.documentsProcessed += 1;
  switch (status) {
    case LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED:
      metrics.verified += 1;
      break;
    case LEGAL_DOCUMENT_INTEGRITY_STATUS.MISSING_OBJECT:
      metrics.missingObject += 1;
      break;
    case LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH:
      metrics.checksumMismatch += 1;
      break;
    case LEGAL_DOCUMENT_INTEGRITY_STATUS.STORAGE_ERROR:
      metrics.storageError += 1;
      break;
    default:
      metrics.unverified += 1;
  }
}
