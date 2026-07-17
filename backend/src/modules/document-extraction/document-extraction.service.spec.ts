import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DocumentExtractionService } from './document-extraction.service';
import { makeLifecycleMock, makeMalwareScanMock, makeRetentionMock, makeUploadContextMock } from './document-extraction-test.helpers';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

/**
 * These tests exercise the parts of DocumentExtractionService that do NOT touch
 * the queue/storage: confirmedData schema validation, the cross-vehicle IDOR
 * guard, and confirm() idempotency (apply exactly once, never auto-apply).
 */
describe('DocumentExtractionService', () => {
  function makeService(
    prismaOverrides: any = {},
    applyService: any = { apply: jest.fn().mockResolvedValue({}) },
  ) {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        ...prismaOverrides,
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ vin: null, licensePlate: null, mileageKm: null }),
        findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const config = { get: jest.fn((_k: string, d?: unknown) => d) };
    const docConfig = {
      queueEnabled: true,
      allowPendingWithoutQueue: false,
      jobAttempts: 4,
      jobBackoffMs: 5000,
      jobTimeoutMs: 120000,
    };
    const storage = {
      putObject: jest.fn(),
      getObject: jest.fn(),
      getObjectStream: jest.fn(),
      deleteObject: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue({}), getJob: jest.fn().mockResolvedValue(null) };
    const plausibility = { runChecks: jest.fn().mockReturnValue({ overallStatus: 'OK', checks: [], recommendedHumanReviewNotes: [] }) };
    const fileIdentification = {
      identify: jest.fn().mockResolvedValue({
        detectedKind: 'pdf',
        detectedMime: 'application/pdf',
        clientMime: 'application/pdf',
        displayFileName: 'invoice.pdf',
        sizeBytes: 100,
      }),
    };
    const actionOrchestrator = {
      supportsExecutorPath: jest.fn().mockReturnValue(false),
      executeConfirmedPlan: jest.fn(),
      buildPreviewPlan: jest.fn(),
    };
    const actionPlanPreview = {
      buildForRecord: jest.fn(),
    };
    const observability = {
      logEvent: jest.fn(),
      recordApply: jest.fn(),
      recordJobOutcome: jest.fn(),
      recordFailure: jest.fn(),
      recordStageDuration: jest.fn(),
      recordPages: jest.fn(),
      recordRetry: jest.fn(),
      recordClassification: jest.fn(),
      setQueueAgeSeconds: jest.fn(),
      setActiveJobs: jest.fn(),
      observeStage: jest.fn((_id: string, _stage: string, fn: () => unknown) => fn()),
    };
    const uploadDuplicate = {
      assess: jest.fn().mockResolvedValue({ status: 'UNIQUE', blocked: false }),
      claimContentAnchor: jest.fn().mockResolvedValue('claimed'),
      loadBlockedAssessmentFromAnchor: jest.fn(),
    };
    const uploadRateLimit = { assertAllowed: jest.fn().mockResolvedValue(undefined) };
    const svc = new DocumentExtractionService(
      prisma as any,
      config as any,
      docConfig as any,
      storage as any,
      queue as any,
      applyService as any,
      actionOrchestrator as any,
      plausibility as any,
      fileIdentification as any,
      uploadDuplicate as any,
      uploadRateLimit as any,
      makeMalwareScanMock(storage) as any,
      makeLifecycleMock() as any,
      makeRetentionMock() as any,
    makeUploadContextMock() as any,
      observability as any,
      actionPlanPreview as any,
    );
    return { svc, prisma, applyService, storage, queue, observability, fileIdentification, uploadDuplicate };
  }

  describe('sanitizeConfirmedData', () => {
    it('keeps known schema keys + apply aliases and drops unknown keys', () => {
      const { svc } = makeService();
      const out = svc.sanitizeConfirmedData('SERVICE', {
        eventDate: '2026-01-10',
        odometerKm: 50000,
        costCents: 12900,
        invoiceNumber: 'R-1',
        notes: 'alias-kept',
        injected: 'DROP ME',
        __proto__: 'nope',
      });
      expect(out).toMatchObject({
        eventDate: '2026-01-10',
        odometerKm: 50000,
        costCents: 12900,
        invoiceNumber: 'R-1',
        notes: 'alias-kept',
      });
      expect(out).not.toHaveProperty('injected');
    });

    it('coerces an invalid enum value to null and keeps valid enum values', () => {
      const { svc } = makeService();
      expect(svc.sanitizeConfirmedData('BRAKE', { serviceKind: 'bogus' }).serviceKind).toBeNull();
      expect(svc.sanitizeConfirmedData('BRAKE', { serviceKind: 'pads_service' }).serviceKind).toBe(
        'pads_service',
      );
    });

    it('preserves nested measurement objects (treadDepthMm)', () => {
      const { svc } = makeService();
      const out = svc.sanitizeConfirmedData('TIRE', {
        treadDepthMm: { fl: 5, fr: 5, rl: 4, rr: 4 },
      });
      expect(out.treadDepthMm).toEqual({ fl: 5, fr: 5, rl: 4, rr: 4 });
    });

    it('throws when confirmedData is not a plain object', () => {
      const { svc } = makeService();
      expect(() => svc.sanitizeConfirmedData('SERVICE', null)).toThrow(BadRequestException);
      expect(() => svc.sanitizeConfirmedData('SERVICE', [])).toThrow(BadRequestException);
      expect(() => svc.sanitizeConfirmedData('SERVICE', 'x' as any)).toThrow(BadRequestException);
    });
  });

  describe('toPublicExtraction', () => {
    it('strips storage keys and URLs from API responses', () => {
      const { svc } = makeService();
      const publicRow = svc.toPublicExtraction({
        id: 'e1',
        vehicleId: 'v1',
        organizationId: 'org-1',
        status: 'APPLIED',
        processingStage: 'APPLY',
        classificationMode: 'MANUAL',
        processingAttempts: 1,
        objectKey: 'private/key.pdf',
        sourceFileUrl: 'https://bucket.example.com/secret.pdf',
        storageProvider: 's3',
        documentType: 'SERVICE',
        effectiveDocumentType: 'SERVICE',
        requestedDocumentType: 'SERVICE',
        createdAt: new Date('2026-07-10T12:00:00.000Z'),
        updatedAt: new Date('2026-07-10T12:00:00.000Z'),
      });
      expect(publicRow).not.toHaveProperty('objectKey');
      expect(publicRow).not.toHaveProperty('sourceFileUrl');
      expect(publicRow).not.toHaveProperty('storageProvider');
      expect(publicRow.hasStoredFile).toBe(true);
      expect(publicRow.effectiveDocumentType).toBe('SERVICE');
      expect(publicRow.processingStage).toBe('APPLY');
    });
  });

  describe('createFromUpload', () => {
    it('creates a manual upload with immediate effective document type', async () => {
      const create = jest.fn().mockResolvedValue({
        id: 'e1',
        vehicleId: 'v1',
        organizationId: 'org-1',
        status: 'PENDING',
        requestedDocumentType: 'SERVICE',
        effectiveDocumentType: 'SERVICE',
        documentType: 'SERVICE',
        classificationMode: 'MANUAL',
        processingAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const update = jest.fn().mockResolvedValue({
        id: 'e1',
        status: 'QUEUED',
        processingStage: 'QUEUE',
        requestedDocumentType: 'SERVICE',
        effectiveDocumentType: 'SERVICE',
        documentType: 'SERVICE',
        classificationMode: 'MANUAL',
        processingAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const { svc, prisma, storage } = makeService({
        create,
        update,
        findUnique: jest.fn(),
      });
      prisma.vehicle.findUnique = jest.fn().mockResolvedValue({ organizationId: 'org-1' });
      storage.putObject.mockResolvedValue({
        objectKey: 'k1',
        storageProvider: 'local',
        mimeType: 'application/pdf',
        sizeBytes: 100,
      });

      await svc.createFromUpload({
        vehicleId: 'v1',
        documentType: 'SERVICE',
        originalName: 'invoice.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('pdf'),
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestedDocumentType: 'SERVICE',
            effectiveDocumentType: 'SERVICE',
            documentType: 'SERVICE',
            classificationMode: 'MANUAL',
            status: 'PENDING',
            processingStage: 'UPLOAD',
          }),
        }),
      );
    });

    it('creates an AUTO request without resolved effective document type', async () => {
      const create = jest.fn().mockResolvedValue({
        id: 'e2',
        vehicleId: 'v1',
        organizationId: 'org-1',
        status: 'PENDING',
        requestedDocumentType: 'AUTO',
        effectiveDocumentType: null,
        documentType: null,
        classificationMode: 'AUTO',
        processingAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const update = jest.fn().mockResolvedValue({
        id: 'e2',
        status: 'QUEUED',
        processingStage: 'QUEUE',
        requestedDocumentType: 'AUTO',
        effectiveDocumentType: null,
        documentType: null,
        classificationMode: 'AUTO',
        processingAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const { svc, prisma, storage } = makeService({ create, update });
      prisma.vehicle.findUnique = jest.fn().mockResolvedValue({ organizationId: 'org-1' });
      storage.putObject.mockResolvedValue({
        objectKey: 'k2',
        storageProvider: 'local',
        mimeType: 'application/pdf',
        sizeBytes: 100,
      });

      await svc.createFromUpload({
        vehicleId: 'v1',
        documentType: 'AUTO',
        originalName: 'scan.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('pdf'),
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestedDocumentType: 'AUTO',
            effectiveDocumentType: null,
            documentType: null,
            classificationMode: 'AUTO',
          }),
        }),
      );
    });
  });

  describe('setDocumentType', () => {
    const awaitingRecord = {
      id: 'e1',
      vehicleId: 'v1',
      organizationId: 'org-1',
      status: 'AWAITING_DOCUMENT_TYPE',
      objectKey: 'k1',
      effectiveDocumentType: null,
      documentType: null,
      detectedDocumentType: 'INVOICE',
      requestedDocumentType: 'AUTO',
      classificationMode: 'AUTO',
      plausibility: {
        _pipeline: {
          contentCache: {
            objectKey: 'k1',
            text: 'cached',
            pages: [],
            pageBoundaryReliable: false,
            sourceMethod: 'OCR',
            cachedAt: new Date().toISOString(),
          },
        },
      },
      confirmedData: null,
    };

    it('sets type from AWAITING_DOCUMENT_TYPE and enqueues re-extraction', async () => {
      const update = jest
        .fn()
        .mockResolvedValueOnce(awaitingRecord)
        .mockResolvedValueOnce({ ...awaitingRecord, status: 'QUEUED' });
      const { svc, prisma, queue } = makeService({
        findFirst: jest.fn().mockResolvedValue(awaitingRecord),
        update,
      });

      const result = await svc.setDocumentType('v1', 'e1', 'INVOICE', { userId: 'u1' });
      expect(result.status).toBe('QUEUED');
      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ skipOcr: true, documentType: 'INVOICE' }),
        expect.any(Object),
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            effectiveDocumentType: 'INVOICE',
            documentType: 'INVOICE',
            status: 'PENDING',
          }),
        }),
      );
    });

    it('rejects AUTO as effective type', async () => {
      const { svc } = makeService({
        findFirst: jest.fn().mockResolvedValue(awaitingRecord),
      });
      await expect(svc.setDocumentType('v1', 'e1', 'AUTO')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects type change after APPLIED', async () => {
      const { svc } = makeService({
        findFirst: jest.fn().mockResolvedValue({
          ...awaitingRecord,
          status: 'APPLIED',
          effectiveDocumentType: 'INVOICE',
        }),
      });
      await expect(svc.setDocumentType('v1', 'e1', 'SERVICE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows READY_FOR_REVIEW re-extract only with reextract=true', async () => {
      const reviewRecord = {
        ...awaitingRecord,
        status: 'READY_FOR_REVIEW',
        effectiveDocumentType: 'INVOICE',
        documentType: 'INVOICE',
        extractedData: { totalCents: 100 },
      };
      const { svc } = makeService({
        findFirst: jest.fn().mockResolvedValue(reviewRecord),
        update: jest.fn().mockResolvedValue(reviewRecord),
      });
      await expect(svc.setDocumentType('v1', 'e1', 'SERVICE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('archives prior structured extraction on re-extract type change', async () => {
      const reviewRecord = {
        ...awaitingRecord,
        status: 'READY_FOR_REVIEW',
        effectiveDocumentType: 'INVOICE',
        documentType: 'INVOICE',
        extractedData: { invoiceNumber: 'INV-OLD' },
        plausibility: {
          _pipeline: {
            structuredExtraction: {
              contractVersion: '1.0.0',
              schemaVersion: '1.0.0',
              documentSubtype: 'INVOICE',
              legacyDocumentType: 'INVOICE',
              fields: [],
              missingFields: [],
              conflicts: [],
              normalizedFlat: { invoiceNumber: 'INV-OLD' },
            },
            structuredExtractionRun: {
              runId: 'run-1',
              contractVersion: '1.0.0',
              schemaVersion: '1.0.0',
              documentSubtype: 'INVOICE',
              legacyDocumentType: 'INVOICE',
              trigger: 'auto',
              startedAt: '2026-07-17T10:00:00.000Z',
              completedAt: '2026-07-17T10:00:01.000Z',
              provider: 'mistral',
              modelVersion: 'mistral-small',
              fieldCount: 1,
              missingFieldCount: 0,
              conflictCount: 0,
            },
          },
        },
      };
      const update = jest.fn().mockResolvedValue(reviewRecord);
      const { svc } = makeService({
        findFirst: jest.fn().mockResolvedValue(reviewRecord),
        update,
      });

      await svc.setDocumentType('v1', 'e1', 'SERVICE', { reextract: true, userId: 'u1' });

      const updateArg = update.mock.calls[0]?.[0];
      const pipeline = (updateArg.data.plausibility as Record<string, unknown>)._pipeline as Record<
        string,
        unknown
      >;
      expect(Array.isArray(pipeline.supersededExtractionRuns)).toBe(true);
      expect((pipeline.supersededExtractionRuns as unknown[]).length).toBe(1);
      expect(pipeline.structuredExtraction).toBeNull();
      expect(updateArg.data.extractedData).toBe(Prisma.DbNull);
    });
  });

  describe('getForVehicle (cross-vehicle IDOR guard)', () => {
    it('throws NotFound when the extraction belongs to a different vehicle', async () => {
      const { svc } = makeService({
        findFirst: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.getForVehicle('my-vehicle', 'e1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the record when the vehicle matches', async () => {
      const record = {
        id: 'e1',
        vehicleId: 'my-vehicle',
        status: 'READY_FOR_REVIEW',
        vehicle: { id: 'my-vehicle', organizationId: 'org-1' },
      };
      const { svc } = makeService({ findFirst: jest.fn().mockResolvedValue(record) });
      await expect(svc.getForVehicle('my-vehicle', 'e1')).resolves.toMatchObject(record);
    });
  });

  describe('confirm', () => {
    it('is idempotent — does not re-apply an already APPLIED extraction', async () => {
      const applied = {
        id: 'e1',
        vehicleId: 'v1',
        documentType: 'SERVICE',
        effectiveDocumentType: 'SERVICE',
        status: 'APPLIED',
        classificationMode: 'MANUAL',
        processingStage: 'APPLY',
        processingAttempts: 1,
      };
      const apply = jest.fn();
      const { svc } = makeService(
        { findFirst: jest.fn().mockResolvedValue(applied) },
        { apply },
      );
      const result = await svc.confirm('v1', 'e1', { eventDate: '2026-01-10' });
      expect(result).toMatchObject(applied);
      expect(apply).not.toHaveBeenCalled();
    });

    it('applies confirmed data exactly once and transitions to APPLIED', async () => {
      const record = {
        id: 'e1',
        vehicleId: 'v1',
        documentType: 'SERVICE',
        effectiveDocumentType: 'SERVICE',
        status: 'READY_FOR_REVIEW',
        classificationMode: 'MANUAL',
        processingStage: 'REVIEW',
        processingAttempts: 1,
        sourceFileUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const apply = jest.fn().mockResolvedValue({ serviceEventId: 'svc-1' });
      const update = jest
        .fn()
        .mockImplementation(({ data }: any) => Promise.resolve({ ...record, ...data }));
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(record)
        .mockResolvedValueOnce({ ...record, status: 'APPLIED', appliedAt: new Date() });
      const { svc } = makeService(
        { findFirst, updateMany },
        { apply },
      );

      const result: any = await svc.confirm('v1', 'e1', {
        eventDate: '2026-01-10',
        odometerKm: 50000,
        injected: 'DROP ME',
      });

      // Applied exactly once with sanitized confirmedData (no unknown keys).
      expect(apply).toHaveBeenCalledTimes(1);
      const applyArg = apply.mock.calls[0][0];
      expect(applyArg.confirmedData).not.toHaveProperty('injected');
      expect(applyArg.confirmedData.eventDate).toBe('2026-01-10');

      // CONFIRMED first (audit), then APPLIED with appliedAt set.
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('APPLIED');
    });
  });

  describe('saveReview', () => {
    it('persists confirmedData and stays READY_FOR_REVIEW', async () => {
      const record = {
        id: 'e1',
        vehicleId: 'v1',
        organizationId: 'org-1',
        documentType: 'INVOICE',
        effectiveDocumentType: 'INVOICE',
        status: 'READY_FOR_REVIEW',
        classificationMode: 'MANUAL',
        processingStage: 'REVIEW',
        processingAttempts: 1,
        confirmedData: null,
        plausibility: { overallStatus: 'OK', checks: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const update = jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...record, ...data }));
      const { svc } = makeService({ findFirst: jest.fn().mockResolvedValue(record), update });

      const result = await svc.saveReview('v1', 'e1', {
        invoiceNumber: 'INV-9',
        invoiceDate: '2026-03-01',
        totalGross: 10000,
      });

      expect(update).toHaveBeenCalledTimes(1);
      const updateArg = update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('READY_FOR_REVIEW');
      expect(updateArg.data.confirmedData).toMatchObject({ invoiceNumber: 'INV-9' });
      expect(result.status).toBe('READY_FOR_REVIEW');
    });
  });
});
