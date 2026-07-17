import { Job } from 'bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentExtractionApplyService } from './document-extraction-apply.service';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import { DocumentExtractionObservabilityService } from './document-extraction-observability.service';
import { DocumentExtractionProcessor } from './document-extraction.processor';
import {
  DocumentExtractionPipelineError,
  DOCUMENT_PIPELINE_ERROR_CODES,
} from './document-extraction.errors';
import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';
import { DocumentExtractionEnqueueFailedException } from './document-extraction-enqueue.exception';
import { DOCUMENT_EXTRACTION_ERROR_CODES } from './document-extraction-lifecycle.util';
import { makeLifecycleMock, makeMalwareScanMock, makeRetentionMock, makeUploadContextMock, makeVehicleCandidateResolverMock, makeBookingCandidateResolverMock, makeCustomerCandidateResolverMock, makeDriverCandidateResolverMock, makePartnerCandidateResolverMock, makeClassificationResultMock } from './document-extraction-test.helpers';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

/**
 * Integration-style tests: real NestJS provider wiring with mocked external I/O
 * (Mistral OCR/AI, Redis queue, object storage, Prisma).
 */
describe('Document extraction pipeline (integration wiring)', () => {
  const docConfig = {
    queueEnabled: true,
    allowPendingWithoutQueue: false,
    jobAttempts: 4,
    jobBackoffMs: 1000,
    jobTimeoutMs: 120000,
    classificationAutoContinueMinConfidence: 0.85,
    classificationSuggestionMinConfidence: 0.55,
    storageProvider: 'local',
  };

  let prisma: Record<string, any>;
  let storage: Record<string, jest.Mock>;
  let queue: Record<string, jest.Mock>;
  let contentExtractor: { extractContent: jest.Mock };
  let classification: { classify: jest.Mock };
  let aiExtraction: { extract: jest.Mock };
  let applyService: { apply: jest.Mock };
  let processor: DocumentExtractionProcessor;
  let service: DocumentExtractionService;

  const baseRecord = {
    id: 'e1',
    vehicleId: 'v1',
    organizationId: 'org-1',
    status: 'QUEUED',
    objectKey: 'organizations/org-1/vehicles/v1/documents/2026/07/e1.pdf',
    mimeType: 'application/pdf',
    sourceFileName: 'invoice.pdf',
    sizeBytes: 120_000,
    effectiveDocumentType: null,
    documentType: null,
    classificationMode: 'AUTO',
    requestedDocumentType: 'AUTO',
    processingStartedAt: null,
    plausibility: null,
    ocrCompletedAt: null,
    sourceFileUrl: null,
    vehicle: { id: 'v1', organizationId: 'org-1' },
  };

  beforeEach(async () => {
    prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          vin: 'WVWZZZ',
          licensePlate: 'B-AB 123',
          mileageKm: 40000,
        }),
        findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue({ odometerKm: 41000 }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    storage = {
      putObject: jest.fn().mockResolvedValue({
        objectKey: baseRecord.objectKey,
        storageProvider: 'local',
        mimeType: 'application/pdf',
        sizeBytes: 120_000,
      }),
      getObject: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 digital text')),
      getObjectStream: jest.fn(),
      deleteObject: jest.fn(),
      getInternalPath: jest.fn().mockReturnValue('/tmp'),
    };
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: jest.fn().mockResolvedValue(null),
    };
    contentExtractor = {
      extractContent: jest.fn().mockResolvedValue({
        text: 'Digital PDF invoice text',
        sourceMethod: 'PDF_TEXT',
        pages: [{ pageNumber: 1, text: 'Digital PDF invoice text', sourceMethod: 'PDF_TEXT', hasReliablePageBoundaries: true }],
        pageBoundaryReliable: true,
        pageCount: 1,
      }),
    };
    classification = {
      classify: jest.fn().mockResolvedValue(
        makeClassificationResultMock({
          detectedDocumentType: 'INVOICE',
          documentCategory: 'FINANCE',
          documentSubtype: 'INVOICE',
          confidence: 0.92,
          rationale: 'Invoice layout',
          sourcePages: [1],
        }, { processingDurationMs: 50 }),
      ),
    };
    aiExtraction = {
      extract: jest.fn().mockResolvedValue({
        success: true,
        fields: { totalCents: 12900, invoiceNumber: 'INV-1' },
        recommendedHumanReviewNotes: [],
        dimoContextAvailable: false,
        providerId: 'mistral',
        modelId: 'mistral-small',
      }),
    };
    applyService = { apply: jest.fn().mockResolvedValue({ serviceEventId: 'evt-1' }) };

    const metrics = new TripMetricsService();
    const observability = new DocumentExtractionObservabilityService(metrics);
    const plausibility = new DocumentExtractionPlausibilityService();

    processor = new DocumentExtractionProcessor(
      prisma as any,
      storage as any,
      contentExtractor as any,
      classification as any,
      aiExtraction as any,
      plausibility as any,
      docConfig as any,
      observability,
      makeUploadContextMock() as any,
      makeVehicleCandidateResolverMock() as any,
      makeBookingCandidateResolverMock() as any,
      makeCustomerCandidateResolverMock() as any,
      makeDriverCandidateResolverMock() as any,
      makePartnerCandidateResolverMock() as any,
    );
    service = new DocumentExtractionService(
      prisma as any,
      { get: jest.fn() } as any,
      docConfig as any,
      storage as any,
      queue as any,
      applyService as any,
      { supportsExecutorPath: jest.fn(), executeConfirmedPlan: jest.fn() } as any,
      plausibility as any,
      {
        identify: jest.fn().mockResolvedValue({
          detectedKind: 'pdf',
          detectedMime: 'application/pdf',
          clientMime: 'application/pdf',
          displayFileName: 'invoice.pdf',
          sizeBytes: 120_000,
        }),
      } as any,
      {
        assess: jest.fn().mockResolvedValue({ status: 'UNIQUE', blocked: false }),
        claimContentAnchor: jest.fn().mockResolvedValue('claimed'),
        loadBlockedAssessmentFromAnchor: jest.fn(),
      } as any,
      { assertAllowed: jest.fn().mockResolvedValue(undefined) } as any,
      makeMalwareScanMock(storage as any) as any,
      makeLifecycleMock() as any,
      makeRetentionMock() as any,
    makeUploadContextMock() as any,
      observability,
    );
  });

  function job(attemptsMade = 0): Job {
    return {
      data: { extractionId: 'e1', vehicleId: 'v1', organizationId: 'org-1', documentType: 'AUTO', objectKey: baseRecord.objectKey },
      attemptsMade,
      opts: { attempts: 4 },
    } as unknown as Job;
  }

  it('1. digital PDF succeeds via PDF_TEXT layer', async () => {
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({ ...baseRecord, effectiveDocumentType: 'INVOICE', documentType: 'INVOICE', classificationMode: 'MANUAL', requestedDocumentType: 'INVOICE' });
    await processor.process(job());
    expect(contentExtractor.extractContent).toHaveBeenCalled();
    expect(classification.classify).not.toHaveBeenCalled();
    expect(aiExtraction.extract).toHaveBeenCalled();
    expect(prisma.vehicleDocumentExtraction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY_FOR_REVIEW' }),
      }),
    );
  });

  it('2. scanned PDF succeeds via OCR fallback', async () => {
    contentExtractor.extractContent.mockResolvedValue({
      text: 'OCR text',
      sourceMethod: 'OCR',
      ocrProvider: 'mistral',
      ocrModel: 'mistral-ocr',
      pages: [{ pageNumber: 1, text: 'OCR text', sourceMethod: 'OCR', hasReliablePageBoundaries: true }],
      pageBoundaryReliable: true,
      pageCount: 1,
    });
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({ ...baseRecord, effectiveDocumentType: 'SERVICE', documentType: 'SERVICE', classificationMode: 'MANUAL' });
    await processor.process(job());
    expect(aiExtraction.extract).toHaveBeenCalled();
  });

  it.each([
    ['3. JPG', 'image/jpeg'],
    ['4. PNG', 'image/png'],
    ['5. WebP', 'image/webp'],
  ])('%s succeeds', async (_label, mime) => {
    contentExtractor.extractContent.mockResolvedValue({
      text: 'Image OCR',
      sourceMethod: 'OCR',
      pages: [{ pageNumber: 1, text: 'Image OCR', sourceMethod: 'OCR', hasReliablePageBoundaries: false }],
      pageBoundaryReliable: false,
      pageCount: 1,
    });
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({ ...baseRecord, mimeType: mime, effectiveDocumentType: 'SERVICE', documentType: 'SERVICE', classificationMode: 'MANUAL' });
    await processor.process(job());
    expect(aiExtraction.extract).toHaveBeenCalled();
  });

  it('6. AUTO classification auto-continues on high confidence', async () => {
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue(baseRecord);
    await processor.process(job());
    expect(classification.classify).toHaveBeenCalled();
    expect(aiExtraction.extract).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: 'INVOICE' }),
    );
  });

  it('7. AUTO uncertain → AWAITING_DOCUMENT_TYPE', async () => {
    classification.classify.mockResolvedValue(
      makeClassificationResultMock({
        detectedDocumentType: 'SERVICE',
        documentCategory: 'TECHNICAL',
        documentSubtype: 'SERVICE_REPORT',
        confidence: 0.6,
        rationale: 'Uncertain workshop evidence overall',
        sourcePages: [1],
      }),
    );
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue(baseRecord);
    await processor.process(job());
    expect(prisma.vehicleDocumentExtraction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'AWAITING_DOCUMENT_TYPE' }),
      }),
    );
  });

  it('8. set type → re-enqueue extraction', async () => {
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue({
      ...baseRecord,
      status: 'AWAITING_DOCUMENT_TYPE',
      detectedDocumentType: 'SERVICE',
      classificationConfidence: 0.6,
    });
    prisma.vehicleDocumentExtraction.update.mockResolvedValue({
      ...baseRecord,
      status: 'PENDING',
      effectiveDocumentType: 'INVOICE',
      documentType: 'INVOICE',
    });
    await service.setDocumentType('v1', 'e1', 'INVOICE');
    expect(queue.add).toHaveBeenCalled();
  });

  it('10. OCR 429 → retry then success', async () => {
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({ ...baseRecord, effectiveDocumentType: 'SERVICE', documentType: 'SERVICE', classificationMode: 'MANUAL' });
    contentExtractor.extractContent
      .mockRejectedValueOnce(
        new DocumentExtractionPipelineError({
          code: 'OCR_RATE_LIMITED',
          safeMessage: 'Rate limited',
          retryable: true,
          stage: 'OCR',
        }),
      )
      .mockResolvedValueOnce({
        text: 'retry ok',
        sourceMethod: 'OCR',
        pages: [{ pageNumber: 1, text: 'retry ok', sourceMethod: 'OCR', hasReliablePageBoundaries: true }],
        pageBoundaryReliable: true,
        pageCount: 1,
      });
    await expect(processor.process(job(0))).rejects.toBeInstanceOf(DocumentExtractionPipelineError);
    await processor.process(job(1));
    expect(aiExtraction.extract).toHaveBeenCalled();
  });

  it('11. permanent file error does not retry', async () => {
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({ ...baseRecord, effectiveDocumentType: 'SERVICE', documentType: 'SERVICE', classificationMode: 'MANUAL' });
    contentExtractor.extractContent.mockRejectedValue(
      new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED,
        safeMessage: 'Unsupported',
        retryable: false,
        stage: 'OCR',
      }),
    );
    await processor.process(job(0));
    expect(prisma.vehicleDocumentExtraction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('14. confirm → apply', async () => {
    const review = {
      ...baseRecord,
      status: 'READY_FOR_REVIEW',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      classificationMode: 'MANUAL',
      processingStage: 'REVIEW',
      processingAttempts: 1,
      extractedData: { eventDate: '2026-06-01' },
      plausibility: { overallStatus: 'OK', checks: [] },
      sourceFileUrl: 'storage://k1',
      objectKey: baseRecord.objectKey,
    };
    const applied = { ...review, status: 'APPLIED', processingStage: 'APPLY' };
    prisma.vehicleDocumentExtraction.findFirst
      .mockResolvedValueOnce(review)
      .mockResolvedValue(applied);
    prisma.vehicleDocumentExtraction.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.confirm('v1', 'e1', { eventDate: '2026-06-01', odometerKm: 40000 });
    expect(applyService.apply).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('APPLIED');
  });

  it('15. apply failure surfaces error without silent success', async () => {
    const review = {
      ...baseRecord,
      status: 'READY_FOR_REVIEW',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      classificationMode: 'MANUAL',
      processingStage: 'REVIEW',
      processingAttempts: 1,
      extractedData: { eventDate: '2026-06-01' },
      plausibility: { overallStatus: 'OK', checks: [] },
      sourceFileUrl: 'storage://k1',
    };
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(review);
    applyService.apply.mockRejectedValue(new Error('domain apply failed'));
    await expect(service.confirm('v1', 'e1', { eventDate: '2026-06-01' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('16. foreign organization list is scoped', async () => {
    prisma.vehicleDocumentExtraction.findMany.mockResolvedValue([]);
    prisma.vehicleDocumentExtraction.count.mockResolvedValue(0);
    await service.listForOrg('org-other', { page: 1, limit: 20 } as any);
    expect(prisma.vehicleDocumentExtraction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-other' }),
      }),
    );
  });

  it('17. download rejects missing stored file', async () => {
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue({
      ...baseRecord,
      status: 'READY_FOR_REVIEW',
      objectKey: null,
      hasStoredFile: false,
    });
    await expect(service.getDownloadForVehicle('v1', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('18. deleted file leaves audit record fetchable', async () => {
    storage.getObjectStream.mockRejectedValue(new Error('ENOENT'));
    const appliedRecord = {
      ...baseRecord,
      status: 'APPLIED',
      objectKey: 'missing-key',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      classificationMode: 'MANUAL',
      processingAttempts: 1,
      plausibility: { actions: [{ action: 'apply', at: '2026-07-10T12:00:00.000Z' }] },
    };
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(appliedRecord);
    await expect(service.getDownloadForVehicle('v1', 'e1')).rejects.toBeInstanceOf(NotFoundException);
    const detail = await service.getForVehicle('v1', 'e1');
    expect(detail.status).toBe('APPLIED');
  });

  it('UNKNOWN classification without suggestion awaits user', async () => {
    classification.classify.mockResolvedValue(
      makeClassificationResultMock({
        detectedDocumentType: CLASSIFICATION_UNKNOWN,
        documentCategory: 'GENERAL',
        documentSubtype: 'OTHER',
        confidence: 0.2,
        rationale: 'Unknown document without clear subtype',
        sourcePages: [],
      }),
    );
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue(baseRecord);
    await processor.process(job());
    expect(prisma.vehicleDocumentExtraction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'AWAITING_DOCUMENT_TYPE' }),
      }),
    );
  });

  it('9. long document succeeds with chunked extraction metadata', async () => {
    const longPages = Array.from({ length: 40 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Page ${i + 1} content`,
      sourceMethod: 'OCR' as const,
      hasReliablePageBoundaries: true,
    }));
    contentExtractor.extractContent.mockResolvedValue({
      text: longPages.map((p) => p.text).join('\n'),
      sourceMethod: 'OCR',
      pages: longPages,
      pageBoundaryReliable: true,
      pageCount: 40,
    });
    aiExtraction.extract.mockResolvedValue({
      success: true,
      fields: { eventDate: '2026-01-01' },
      recommendedHumanReviewNotes: ['Chunked extraction'],
      dimoContextAvailable: false,
      chunking: {
        limitExceeded: true,
        limitCode: 'PAGE_LIMIT',
        uncoveredPageNumbers: [39, 40],
      },
    });
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
      ...baseRecord,
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      classificationMode: 'MANUAL',
    });
    await processor.process(job());
    expect(aiExtraction.extract).toHaveBeenCalled();
    expect(prisma.vehicleDocumentExtraction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READY_FOR_REVIEW',
          plausibility: expect.objectContaining({
            chunking: expect.objectContaining({ limitExceeded: true }),
          }),
        }),
      }),
    );
  });

  it('12. queue unreachable marks upload as failed', async () => {
    prisma.vehicleDocumentExtraction.create.mockResolvedValue({
      ...baseRecord,
      id: 'e-new',
      status: 'PENDING',
    });
    queue.add.mockRejectedValue(new Error('redis connection refused'));
    prisma.vehicleDocumentExtraction.update.mockImplementation(
      ({ where, data }: { where: { id: string }; data: object }) =>
        Promise.resolve({
          ...baseRecord,
          id: where.id,
          vehicle: { id: 'v1', organizationId: 'org-1', licensePlate: null, vin: null, make: null, model: null },
          createdAt: new Date('2026-07-10T10:00:00.000Z'),
          updatedAt: new Date('2026-07-10T10:00:00.000Z'),
          ...data,
        }),
    );
    await expect(
      service.createFromUpload({
        vehicleId: 'v1',
        documentType: 'SERVICE',
        originalName: 'invoice.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF'),
      }),
    ).rejects.toBeInstanceOf(DocumentExtractionEnqueueFailedException);
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e-new' },
        data: expect.objectContaining({
          errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.QUEUE_UNAVAILABLE,
        }),
      }),
    );
  });

  it('13. detail status is reloadable via getPublicForVehicle', async () => {
    const now = new Date('2026-07-10T10:00:00.000Z');
    const record = {
      ...baseRecord,
      id: 'e1',
      status: 'PROCESSING',
      processingStage: 'OCR',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      classificationMode: 'MANUAL',
      processingAttempts: 1,
      createdAt: now,
      updatedAt: now,
      vehicle: { id: 'v1', organizationId: 'org-1', licensePlate: 'B-AB 1', vin: null, make: 'VW', model: 'Golf' },
    };
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(record);
    const first = await service.getPublicForVehicle('v1', 'e1');
    const second = await service.getPublicForVehicle('v1', 'e1');
    expect(first.status).toBe('PROCESSING');
    expect(first.processingStage).toBe('OCR');
    expect(second).toEqual(first);
    expect(first).not.toHaveProperty('objectKey');
  });
});
