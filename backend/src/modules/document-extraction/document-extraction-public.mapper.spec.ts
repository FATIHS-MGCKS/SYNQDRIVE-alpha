import { toPublicDocumentExtraction } from './document-extraction-public.mapper';

describe('document-extraction-public.mapper', () => {
  const baseRecord = {
    id: 'e1',
    vehicleId: 'v1',
    organizationId: 'org-1',
    status: 'READY_FOR_REVIEW' as const,
    processingStage: 'REVIEW' as const,
    classificationMode: 'MANUAL' as const,
    processingAttempts: 1,
    createdAt: new Date('2026-07-10T12:00:00.000Z'),
    updatedAt: new Date('2026-07-10T12:05:00.000Z'),
  };

  it('projects lifecycle fields and strips storage internals', () => {
    const dto = toPublicDocumentExtraction({
      ...baseRecord,
      requestedDocumentType: 'SERVICE',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      objectKey: 'org/v1/secret.pdf',
      sourceFileUrl: 'https://bucket.example.com/secret.pdf',
      storageProvider: 's3',
      errorCode: 'EXTRACTION_FAILED',
      errorMessage: 'Safe user message',
      extractionProvider: 'mistral',
      extractionModel: 'mistral-small-latest',
    });

    expect(dto).toMatchObject({
      id: 'e1',
      vehicleId: 'v1',
      requestedDocumentType: 'SERVICE',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      errorCode: 'EXTRACTION_FAILED',
      errorMessage: 'Safe user message',
      extractionProvider: 'mistral',
      hasStoredFile: true,
      allowedActions: expect.any(Array),
      audit: expect.objectContaining({
        createdBy: null,
        typeChanges: expect.any(Array),
        actions: expect.any(Array),
      }),
    });
    expect(dto).not.toHaveProperty('objectKey');
    expect(dto).not.toHaveProperty('sourceFileUrl');
    expect(dto).not.toHaveProperty('storageProvider');
    expect(dto).not.toHaveProperty('createdById');
  });

  it('maps AUTO manual-upload semantics with unresolved effective type', () => {
    const dto = toPublicDocumentExtraction({
      ...baseRecord,
      status: 'AWAITING_DOCUMENT_TYPE',
      processingStage: 'CLASSIFICATION',
      classificationMode: 'AUTO',
      requestedDocumentType: 'AUTO',
      effectiveDocumentType: null,
      documentType: null,
      objectKey: 'org/v1/file.pdf',
    });

    expect(dto.requestedDocumentType).toBe('AUTO');
    expect(dto.effectiveDocumentType).toBeNull();
    expect(dto.documentType).toBeNull();
    expect(dto.hasStoredFile).toBe(true);
  });

  it('projects field provenance for review without pipeline payload', () => {
    const dto = toPublicDocumentExtraction({
      ...baseRecord,
      requestedDocumentType: 'INVOICE',
      effectiveDocumentType: 'INVOICE',
      documentType: 'INVOICE',
      plausibility: {
        _pipeline: {
          fieldProvenance: {
            contractVersion: '1.0.0',
            correctionCount: 1,
            correctedFieldKeys: ['invoiceNumber'],
            fields: [
              {
                fieldKey: 'invoiceNumber',
                rawValue: 'INV-AI',
                normalizedValue: 'INV-AI',
                confidence: 0.9,
                page: 1,
                textEvidence: '…INV-AI…',
                sourceType: 'user_correction',
                manuallyEdited: true,
                confirmedValue: 'INV-USER',
                confirmedBy: 'user-1',
                confirmedAt: '2026-07-17T12:00:00.000Z',
              },
            ],
          },
        },
      },
    });

    expect(dto.fieldProvenance).toHaveLength(1);
    expect(dto.fieldProvenance?.[0]).toMatchObject({
      normalizedValue: 'INV-AI',
      confirmedValue: 'INV-USER',
      manuallyEdited: true,
    });
    expect(dto.fieldCorrectionCount).toBe(1);
    expect((dto.plausibility as Record<string, unknown>)._pipeline).toBeUndefined();
  });
});
