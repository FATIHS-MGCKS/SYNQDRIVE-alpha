import { describe, expect, it } from 'vitest';
import {
  DocumentUploadDuplicateError,
  formatUploadDuplicateLinks,
  parseUploadDuplicateError,
} from './document-upload-duplicate';

describe('document-upload-duplicate', () => {
  it('parses blocked duplicate upload responses', () => {
    const error = parseUploadDuplicateError({
      statusCode: 409,
      errorCode: 'DOCUMENT_UPLOAD_DUPLICATE_BLOCKED',
      duplicateStatus: 'DUPLICATE_BLOCKED',
      detectedAs: 'EXACT_DUPLICATE',
      message: 'An identical document already exists for this organization.',
      relatedExtractionId: 'ext-1',
      existingExtraction: {
        id: 'ext-1',
        vehicleId: 'v1',
        organizationId: 'org-1',
        status: 'APPLIED',
        processingStage: 'APPLY',
        sourceFileName: 'invoice.pdf',
        effectiveDocumentType: 'INVOICE',
        requestedDocumentType: 'INVOICE',
        contentSha256: 'abc',
        createdAt: '2026-07-01T10:00:00.000Z',
        appliedAt: '2026-07-02T10:00:00.000Z',
        entityLinks: { fineIds: [], invoiceIds: ['inv-1'], damageIds: [], serviceEventIds: [] },
      },
    });

    expect(error).toBeInstanceOf(DocumentUploadDuplicateError);
    expect(error?.payload.existingExtraction?.id).toBe('ext-1');
    expect(error?.payload.duplicateStatus).toBe('DUPLICATE_BLOCKED');
  });

  it('formats linked entity counts for duplicate summaries', () => {
    expect(
      formatUploadDuplicateLinks({
        fineIds: ['fine-1'],
        invoiceIds: ['inv-1', 'inv-2'],
        damageIds: [],
        serviceEventIds: ['svc-1'],
      }),
    ).toEqual(['Rechnungen: 2', 'Bußgelder: 1', 'Service-Ereignisse: 1']);
  });
});
