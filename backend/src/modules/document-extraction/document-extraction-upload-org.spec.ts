import { NotFoundException } from '@nestjs/common';
import { DocumentExtractionService } from './document-extraction.service';
import {
  makeLifecycleMock,
  makeMalwareScanMock,
  makeRetentionMock,
  makeStorageMock,
  makeUploadContextMock,
  spreadDocumentExtractionExtendedServiceMocks,
} from './document-extraction-test.helpers';
import { AUTO_CLASSIFICATION_REQUEST } from './document-extraction.schemas';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('DocumentExtractionService org upload', () => {
  function makeService(overrides: {
    prisma?: Record<string, unknown>;
    storage?: ReturnType<typeof makeStorageMock>;
    uploadContext?: ReturnType<typeof makeUploadContextMock>;
  } = {}) {
    const storage = overrides.storage ?? makeStorageMock();
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'v1' }),
      },
      vehicleDocumentExtraction: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'ext-org-1',
          ...data,
        })),
        update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'ext-org-1',
          ...data,
        })),
        delete: jest.fn(),
      },
      ...overrides.prisma,
    };
    const uploadContext = overrides.uploadContext ?? makeUploadContextMock();
    const svc = new DocumentExtractionService(
      prisma as any,
      { get: jest.fn((_k: string, d?: unknown) => d) } as any,
      {
        queueEnabled: true,
        allowPendingWithoutQueue: false,
        jobAttempts: 4,
        jobBackoffMs: 5000,
        jobTimeoutMs: 120000,
      } as any,
      storage as any,
      { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) } as any,
      { apply: jest.fn() } as any,
      { supportsExecutorPath: jest.fn(), executeConfirmedPlan: jest.fn() } as any,
      {
        runChecks: jest.fn().mockReturnValue({ overallStatus: 'OK', checks: [], recommendedHumanReviewNotes: [] }),
      } as any,
      {
        identify: jest.fn().mockResolvedValue({
          detectedKind: 'pdf',
          detectedMime: 'application/pdf',
          clientMime: 'application/pdf',
          displayFileName: 'invoice.pdf',
          sizeBytes: 100,
        }),
      } as any,
      {
        assess: jest.fn().mockResolvedValue({ status: 'UNIQUE', blocked: false }),
        claimContentAnchor: jest.fn().mockResolvedValue('claimed'),
        loadBlockedAssessmentFromAnchor: jest.fn(),
      } as any,
      { assertAllowed: jest.fn().mockResolvedValue(undefined) } as any,
      makeMalwareScanMock(storage) as any,
      makeLifecycleMock() as any,
      makeRetentionMock() as any,
      uploadContext as any,
      {
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
      } as any,
      ...spreadDocumentExtractionExtendedServiceMocks(),
    );
    return { svc, prisma, storage, uploadContext };
  }

  const uploadInput = {
    organizationId: 'org-1',
    originalName: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
    userId: 'user-1',
  };

  it('creates org inbox upload without vehicle using AUTO default', async () => {
    const { svc, prisma, storage } = makeService();

    await svc.createFromOrgUpload(uploadInput);

    expect(prisma.vehicleDocumentExtraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          vehicleId: null,
          requestedDocumentType: AUTO_CLASSIFICATION_REQUEST,
          classificationMode: 'AUTO',
        }),
      }),
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: null,
      }),
    );
  });

  it('stores under vehicle path when optional VEHICLE context is authorized', async () => {
    const uploadContext = makeUploadContextMock();
    uploadContext.resolveUploadTarget.mockResolvedValue({
      organizationId: 'org-1',
      vehicleId: 'v1',
      contextCandidate: {
        entityType: 'VEHICLE',
        entityId: 'v1',
        sourceSurface: 'org_inbox',
        providedAt: '2026-07-17T12:00:00.000Z',
        providedByUserId: 'user-1',
        confirmationStatus: 'CANDIDATE',
      },
      searchScope: { entityType: 'VEHICLE', entityId: 'v1', narrowsSearch: true },
      uploadContextType: 'VEHICLE',
      uploadContextId: 'v1',
    });
    const { svc, prisma, storage } = makeService({ uploadContext });

    await svc.createFromOrgUpload({
      ...uploadInput,
      optionalContextType: 'VEHICLE',
      optionalContextId: 'v1',
    });

    expect(uploadContext.resolveUploadTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        optionalContextType: 'VEHICLE',
        optionalContextId: 'v1',
      }),
    );
    expect(prisma.vehicleDocumentExtraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: 'v1',
          uploadContextType: 'VEHICLE',
          uploadContextId: 'v1',
        }),
      }),
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: 'v1',
      }),
    );
  });

  it('vehicle compatibility wrapper still delegates with explicit vehicleId', async () => {
    const { svc, prisma } = makeService();

    await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'service.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF'),
    });

    expect(prisma.vehicle.findUnique).toHaveBeenCalledWith({
      where: { id: 'v1' },
      select: { organizationId: true },
    });
    expect(prisma.vehicleDocumentExtraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: 'v1',
          requestedDocumentType: 'SERVICE',
        }),
      }),
    );
  });

  it('propagates cross-tenant vehicle context failure', async () => {
    const uploadContext = makeUploadContextMock();
    uploadContext.resolveUploadTarget.mockRejectedValue(new NotFoundException('Vehicle not found'));
    const { svc } = makeService({ uploadContext });

    await expect(
      svc.createFromOrgUpload({
        ...uploadInput,
        optionalContextType: 'VEHICLE',
        optionalContextId: 'foreign-v',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
