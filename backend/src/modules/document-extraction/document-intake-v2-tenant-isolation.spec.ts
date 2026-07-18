import { NotFoundException } from '@nestjs/common';
import { buildDocumentExtractionArchiveWhere } from './document-extraction-archive-query.util';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentUploadContextService } from './document-upload-context.service';
import { makeLifecycleMock, makeMalwareScanMock, makeRetentionMock } from './document-extraction-test.helpers';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('Document Intake V2 tenant isolation', () => {
  describe('DocumentUploadContextService', () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn(),
      },
      booking: { findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
      driver: { findFirst: jest.fn() },
      vendor: { findFirst: jest.fn() },
    };

    const service = new DocumentUploadContextService(prisma as any);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('rejects vehicle context from another organization', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveUploadTarget({
          organizationId: 'org-a',
          optionalContextType: 'VEHICLE',
          optionalContextId: 'veh-b',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('DocumentExtractionService org/vehicle guards', () => {
    function makeService() {
      const prisma = {
        vehicleDocumentExtraction: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-a' }),
          findUnique: jest.fn(),
        },
        vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
        user: { findMany: jest.fn().mockResolvedValue([]) },
      };

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
        { putObject: jest.fn(), getObject: jest.fn(), getObjectStream: jest.fn(), deleteObject: jest.fn() } as any,
        { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) } as any,
        { apply: jest.fn() } as any,
        { supportsExecutorPath: jest.fn(), executeConfirmedPlan: jest.fn(), buildPreviewPlan: jest.fn() } as any,
        { runChecks: jest.fn().mockReturnValue({ overallStatus: 'OK', checks: [] }) } as any,
        { identify: jest.fn() } as any,
        { assess: jest.fn(), claimContentAnchor: jest.fn(), loadBlockedAssessmentFromAnchor: jest.fn() } as any,
        { assertAllowed: jest.fn() } as any,
        makeMalwareScanMock() as any,
        makeLifecycleMock() as any,
        makeRetentionMock() as any,
        { resolveUploadTarget: jest.fn(), assertVehicleInOrganization: jest.fn() } as any,
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
        { buildForRecord: jest.fn() } as any,
        { buildForRecord: jest.fn() } as any,
        { listForRecord: jest.fn(), acceptSuggestion: jest.fn(), dismissSuggestion: jest.fn() } as any,
        { prepareContactDraft: jest.fn() } as any,
        { resyncAfterPlanChange: jest.fn() } as any,
        { syncAfterApply: jest.fn() } as any,
      );

      return { svc, prisma };
    }

    it('rejects vehicle detail lookup across organizations', async () => {
      const { svc, prisma } = makeService();
      prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue({
        id: 'ext-1',
        vehicleId: 'veh-1',
        organizationId: 'org-b',
        status: 'READY_FOR_REVIEW',
        vehicle: {
          id: 'veh-1',
          organizationId: 'org-a',
          licensePlate: 'B-AB 1',
          vin: null,
          make: null,
          model: null,
        },
        createdById: null,
        confirmedById: null,
        appliedById: null,
        cancelledById: null,
        fileDeletedById: null,
      });

      await expect(svc.getForVehicle('veh-1', 'ext-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects org detail lookup for extraction owned by another org', async () => {
      const { svc, prisma } = makeService();
      prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(null);

      await expect(svc.getForOrg('org-a', 'ext-foreign')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('archive query tenant scope', () => {
    it('always includes organizationId in archive where clause', () => {
      const where = buildDocumentExtractionArchiveWhere({
        organizationId: 'org-a',
        q: 'invoice',
      });

      expect(where.organizationId).toBe('org-a');
    });
  });
});
