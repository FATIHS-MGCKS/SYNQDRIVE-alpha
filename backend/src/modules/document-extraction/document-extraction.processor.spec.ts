import { Job } from 'bullmq';
import { DocumentExtractionProcessor } from './document-extraction.processor';
import {
  DocumentExtractionPipelineError,
  DOCUMENT_PIPELINE_ERROR_CODES,
} from './document-extraction.errors';
import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';

function makeProcessor(overrides: Record<string, unknown> = {}) {
  const prisma = {
    vehicleDocumentExtraction: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...(overrides.prisma as object),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ vin: null, licensePlate: null, mileageKm: null }),
    },
    vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const storage = {
    getObject: jest.fn().mockResolvedValue(Buffer.from('hello world text content')),
    ...(overrides.storage as object),
  };
  const contentExtractor = {
    extractContent: jest.fn().mockResolvedValue({
      text: 'Invoice text',
      sourceMethod: 'TXT_DIRECT',
      normalizedMimeType: 'text/plain',
      displayFileName: 'a.txt',
      pages: [
        {
          pageNumber: null,
          text: 'Invoice text',
          sourceMethod: 'TXT_DIRECT',
          hasReliablePageBoundaries: false,
        },
      ],
      pageBoundaryReliable: false,
    }),
    ...(overrides.contentExtractor as object),
  };
  const classification = {
    classify: jest.fn().mockResolvedValue({
      success: true,
      detectedDocumentType: 'SERVICE',
      confidence: 0.9,
      rationale: 'Workshop service maintenance record on page 1',
      sourcePages: [1],
      provider: 'mistral',
      model: 'mistral-small',
      processingDurationMs: 10,
    }),
    ...(overrides.classification as object),
  };
  const aiExtraction = {
    extract: jest.fn().mockResolvedValue({
      success: true,
      fields: { eventDate: '2026-01-01' },
      recommendedHumanReviewNotes: [],
      dimoContextAvailable: false,
    }),
    ...(overrides.aiExtraction as object),
  };
  const plausibility = {
    runChecks: jest.fn().mockReturnValue({
      overallStatus: 'OK',
      checks: [],
      recommendedHumanReviewNotes: [],
    }),
  };
  const docConfig = {
    jobAttempts: 4,
    jobBackoffMs: 5000,
    classificationAutoContinueMinConfidence: 0.85,
    classificationSuggestionMinConfidence: 0.55,
    malwareScanEnabled: false,
    ...(overrides.docConfig as object),
  };
  const observability = {
    logEvent: jest.fn(),
    recordJobOutcome: jest.fn(),
    recordFailure: jest.fn(),
    recordStageDuration: jest.fn(),
    recordPages: jest.fn(),
    recordRetry: jest.fn(),
    recordClassification: jest.fn(),
    recordApply: jest.fn(),
    setQueueAgeSeconds: jest.fn(),
    setActiveJobs: jest.fn(),
    observeStage: jest.fn((_id, _stage, fn) => fn()),
    ...(overrides.observability as object),
  };

  const processor = new DocumentExtractionProcessor(
    prisma as any,
    storage as any,
    contentExtractor as any,
    classification as any,
    aiExtraction as any,
    plausibility as any,
    docConfig as any,
    observability as any,
    {
      loadEntitySnapshot: jest.fn().mockResolvedValue({ licensePlate: 'B-AB 123', vin: null }),
    } as any,
    { resolve: jest.fn().mockResolvedValue({ evaluatedAt: new Date().toISOString(), hints: {}, candidates: [], blockerPresent: false, autoConfirmEligible: false }) } as any,
    { supportsDocumentType: jest.fn(() => true), resolve: jest.fn().mockResolvedValue({ evaluatedAt: new Date().toISOString(), hints: { eventTimePrecision: 'missing' }, candidates: [], ambiguousOverlap: false, autoConfirmEligible: false }) } as any,
  );
  return { processor, prisma, storage, contentExtractor, classification, aiExtraction, plausibility };
}

function makeJob(attemptsMade = 0, attempts = 4): Job {
  return {
    data: {
      extractionId: 'e1',
      vehicleId: 'v1',
      organizationId: 'org-1',
      documentType: 'SERVICE',
      objectKey: 'k1',
    },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job;
}

describe('DocumentExtractionProcessor retry/idempotency', () => {
  const baseRecord = {
    id: 'e1',
    vehicleId: 'v1',
    organizationId: 'org-1',
    status: 'QUEUED',
    objectKey: 'k1',
    mimeType: 'text/plain',
    sourceFileName: 'a.txt',
    effectiveDocumentType: 'SERVICE',
    documentType: 'SERVICE',
    classificationMode: 'MANUAL',
    requestedDocumentType: 'SERVICE',
    processingStartedAt: null,
    plausibility: null,
    ocrCompletedAt: null,
  };

  it('skips READY_FOR_REVIEW without processing', async () => {
    const { processor, prisma } = makeProcessor({
      prisma: {
        findUnique: jest.fn().mockResolvedValue({ ...baseRecord, status: 'READY_FOR_REVIEW' }),
      },
    });
    await processor.process(makeJob());
    expect(prisma.vehicleDocumentExtraction.updateMany).not.toHaveBeenCalled();
  });

  it('skips APPLIED without processing', async () => {
    const { processor, prisma } = makeProcessor({
      prisma: {
        findUnique: jest.fn().mockResolvedValue({ ...baseRecord, status: 'APPLIED' }),
      },
    });
    await processor.process(makeJob());
    expect(prisma.vehicleDocumentExtraction.updateMany).not.toHaveBeenCalled();
  });

  it('manual type skips classification', async () => {
    const { processor, classification, aiExtraction } = makeProcessor({
      prisma: { findUnique: jest.fn().mockResolvedValue(baseRecord) },
    });
    await processor.process(makeJob());
    expect(classification.classify).not.toHaveBeenCalled();
    expect(aiExtraction.extract).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: 'SERVICE' }),
    );
  });

  it('AUTO with high confidence continues to extraction', async () => {
    const autoRecord = {
      ...baseRecord,
      effectiveDocumentType: null,
      documentType: null,
      classificationMode: 'AUTO',
      requestedDocumentType: 'AUTO',
    };
    const { processor, classification, aiExtraction } = makeProcessor({
      prisma: { findUnique: jest.fn().mockResolvedValue(autoRecord) },
    });
    await processor.process(makeJob());
    expect(classification.classify).toHaveBeenCalled();
    expect(aiExtraction.extract).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: 'SERVICE' }),
    );
  });

  it('AUTO with low confidence stops at AWAITING_DOCUMENT_TYPE (not FAILED)', async () => {
    const autoRecord = {
      ...baseRecord,
      effectiveDocumentType: null,
      documentType: null,
      classificationMode: 'AUTO',
      requestedDocumentType: 'AUTO',
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { processor, aiExtraction } = makeProcessor({
      prisma: {
        findUnique: jest.fn().mockResolvedValue(autoRecord),
        updateMany,
      },
      classification: {
        classify: jest.fn().mockResolvedValue({
          success: true,
          detectedDocumentType: CLASSIFICATION_UNKNOWN,
          confidence: 0.2,
          rationale: 'Too generic to classify with confidence',
          sourcePages: [],
          provider: 'mistral',
          model: 'mistral-small',
          processingDurationMs: 5,
        }),
      },
    });
    await processor.process(makeJob());
    expect(aiExtraction.extract).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'AWAITING_DOCUMENT_TYPE',
          processingStage: 'CLASSIFICATION',
        }),
      }),
    );
  });

  it('reuses OCR cache without calling storage/content extractor', async () => {
    const cachedRecord = {
      ...baseRecord,
      plausibility: {
        _pipeline: {
          contentCache: {
            objectKey: 'k1',
            text: 'cached invoice',
            pages: [
              {
                pageNumber: 1,
                text: 'cached invoice',
                sourceMethod: 'OCR',
                hasReliablePageBoundaries: true,
              },
            ],
            pageBoundaryReliable: true,
            sourceMethod: 'OCR',
            cachedAt: new Date().toISOString(),
          },
        },
      },
    };
    const { processor, storage, contentExtractor } = makeProcessor({
      prisma: { findUnique: jest.fn().mockResolvedValue(cachedRecord) },
    });
    await processor.process(makeJob());
    expect(storage.getObject).not.toHaveBeenCalled();
    expect(contentExtractor.extractContent).not.toHaveBeenCalled();
  });

  it('does not claim when another worker already holds PROCESSING', async () => {
    const { processor, prisma } = makeProcessor({
      prisma: {
        findUnique: jest.fn().mockResolvedValue({ ...baseRecord, status: 'PROCESSING' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    await processor.process(makeJob());
    expect(prisma.vehicleDocumentExtraction.update).not.toHaveBeenCalled();
  });

  it('rethrows retryable OCR errors and keeps QUEUED until final attempt', async () => {
    const retryable = new DocumentExtractionPipelineError({
      code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_FAILED,
      safeMessage: 'OCR rate limit',
      retryable: true,
      stage: 'OCR',
    });
    const { processor, contentExtractor } = makeProcessor({
      prisma: { findUnique: jest.fn().mockResolvedValue(baseRecord) },
      contentExtractor: { extractContent: jest.fn().mockRejectedValue(retryable) },
    });

    await expect(processor.process(makeJob(0, 4))).rejects.toBe(retryable);
  });

  it('marks FAILED on last attempt for retryable errors', async () => {
    const retryable = new DocumentExtractionPipelineError({
      code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_FAILED,
      safeMessage: 'OCR timeout',
      retryable: true,
      stage: 'OCR',
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { processor, contentExtractor } = makeProcessor({
      prisma: {
        findUnique: jest.fn().mockResolvedValue(baseRecord),
        updateMany,
      },
      contentExtractor: { extractContent: jest.fn().mockRejectedValue(retryable) },
    });

    await processor.process(makeJob(3, 4));
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', errorCode: DOCUMENT_PIPELINE_ERROR_CODES.OCR_FAILED }),
      }),
    );
  });

  it('retries AI extraction failures that look transient (429)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { processor, aiExtraction } = makeProcessor({
      prisma: {
        findUnique: jest.fn().mockResolvedValue(baseRecord),
        updateMany,
      },
      aiExtraction: {
        extract: jest.fn().mockResolvedValue({
          success: false,
          error: 'HTTP 429 rate limit exceeded',
          fields: {},
          recommendedHumanReviewNotes: [],
          dimoContextAvailable: false,
        }),
      },
    });

    await expect(processor.process(makeJob(0, 4))).rejects.toBeInstanceOf(
      DocumentExtractionPipelineError,
    );
  });
});
