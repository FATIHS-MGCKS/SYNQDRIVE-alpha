import { ServiceUnavailableException } from '@nestjs/common';

export const DOCUMENT_PHYSICAL_DELETE_PENDING_CODE = 'DOCUMENT_PHYSICAL_DELETE_PENDING' as const;

export class DocumentPhysicalDeletePendingError extends ServiceUnavailableException {
  constructor(extractionId: string) {
    super({
      code: DOCUMENT_PHYSICAL_DELETE_PENDING_CODE,
      message:
        'Document metadata was soft-deleted but object storage removal is pending retry. The object key is retained until purge succeeds.',
      extractionId,
    });
  }
}
