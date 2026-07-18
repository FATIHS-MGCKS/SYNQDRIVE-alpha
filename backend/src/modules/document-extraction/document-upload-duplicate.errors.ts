import { ConflictException } from '@nestjs/common';
import type { UploadDuplicateAssessment } from './document-upload-duplicate.types';

export const DOCUMENT_UPLOAD_DUPLICATE_ERROR_CODE = 'DOCUMENT_UPLOAD_DUPLICATE_BLOCKED';

export class DocumentUploadDuplicateBlockedException extends ConflictException {
  constructor(assessment: UploadDuplicateAssessment) {
    super({
      statusCode: 409,
      errorCode: DOCUMENT_UPLOAD_DUPLICATE_ERROR_CODE,
      duplicateStatus: assessment.status,
      detectedAs: 'EXACT_DUPLICATE',
      message: 'An identical document already exists for this organization.',
      existingExtraction: assessment.existingExtraction ?? null,
      relatedExtractionId: assessment.relatedExtractionId ?? assessment.existingExtraction?.id ?? null,
      businessMatch: assessment.businessMatch ?? null,
    });
  }
}
