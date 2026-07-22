import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DOCUMENTS_STORAGE,
  type DocumentStoragePort,
} from '../storage/document-storage.interface';
import {
  LEGAL_DOCUMENT_INTEGRITY_STATUS,
  type LegalDocumentIntegrityStatus,
} from './legal-document-integrity.constants';
import type {
  LegalDocumentIntegrityCheckInput,
  LegalDocumentIntegrityCheckResult,
} from './legal-document-integrity.types';
import { sha256HexFromReadable } from './legal-document-checksum-stream.util';

@Injectable()
export class LegalDocumentChecksumVerificationService {
  private readonly logger = new Logger(LegalDocumentChecksumVerificationService.name);

  constructor(
    @Inject(DOCUMENTS_STORAGE)
    private readonly storage: DocumentStoragePort,
  ) {}

  /**
   * Verifies a stored object against the persisted checksum without loading the
   * full file when storage metadata already matches.
   */
  async verify(input: LegalDocumentIntegrityCheckInput): Promise<LegalDocumentIntegrityCheckResult> {
    const checkedAt = new Date();
    const expected = input.checksum?.trim().toLowerCase() ?? null;

    if (!input.objectKey?.trim()) {
      return {
        status: LEGAL_DOCUMENT_INTEGRITY_STATUS.MISSING_OBJECT,
        detail: 'No object key on record',
        expectedChecksum: expected,
        actualChecksum: null,
        checkedAt,
      };
    }

    if (!expected) {
      return {
        status: LEGAL_DOCUMENT_INTEGRITY_STATUS.UNVERIFIED,
        detail: 'No checksum stored on record',
        expectedChecksum: null,
        actualChecksum: null,
        checkedAt,
      };
    }

    try {
      if (this.storage.getObjectMetadata) {
        const meta = await this.storage.getObjectMetadata(input.objectKey);
        const metaHash = meta.contentHash?.toLowerCase() ?? null;
        if (metaHash && metaHash === expected) {
          return {
            status: LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED,
            expectedChecksum: expected,
            actualChecksum: metaHash,
            checkedAt,
          };
        }
        if (metaHash && metaHash !== expected) {
          return {
            status: LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH,
            detail: 'Storage metadata hash does not match database checksum',
            expectedChecksum: expected,
            actualChecksum: metaHash,
            checkedAt,
          };
        }
      }

      const stream = await this.storage.getObjectStream(input.objectKey);
      const actual = await sha256HexFromReadable(stream);
      if (actual === expected) {
        return {
          status: LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED,
          expectedChecksum: expected,
          actualChecksum: actual,
          checkedAt,
        };
      }
      return {
        status: LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH,
        detail: 'Streamed hash does not match database checksum',
        expectedChecksum: expected,
        actualChecksum: actual,
        checkedAt,
      };
    } catch (err) {
      if (err instanceof NotFoundException) {
        return {
          status: LEGAL_DOCUMENT_INTEGRITY_STATUS.MISSING_OBJECT,
          detail: 'Object not found in storage',
          expectedChecksum: expected,
          actualChecksum: null,
          checkedAt,
        };
      }
      this.logger.warn(
        `Integrity verify failed for legalDocument=${input.legalDocumentId}: ${(err as Error).message}`,
      );
      return {
        status: LEGAL_DOCUMENT_INTEGRITY_STATUS.STORAGE_ERROR,
        detail: (err as Error).message,
        expectedChecksum: expected,
        actualChecksum: null,
        checkedAt,
      };
    }
  }

  isBlockingStatus(status: LegalDocumentIntegrityStatus): boolean {
    return (
      status === LEGAL_DOCUMENT_INTEGRITY_STATUS.MISSING_OBJECT ||
      status === LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH ||
      status === LEGAL_DOCUMENT_INTEGRITY_STATUS.STORAGE_ERROR
    );
  }
}
