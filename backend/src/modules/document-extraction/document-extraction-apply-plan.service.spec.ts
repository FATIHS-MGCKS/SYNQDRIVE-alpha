import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentExtractionApplyPlanService } from './document-extraction-apply-plan.service';
import { DocumentActionPlanRepository } from './document-action-plan.repository';
import { DocumentActionRepository } from './document-action.repository';
import { DocumentEntityCandidateRepository } from './document-entity-candidate.repository';
import { DocumentEntityLinkRepository } from './document-entity-link.repository';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

function makeService(deps: {
  prisma?: Record<string, unknown>;
  plausibility?: Partial<DocumentExtractionPlausibilityService>;
  entityLinks?: Partial<DocumentEntityLinkRepository>;
  entityCandidates?: Partial<DocumentEntityCandidateRepository>;
  actionPlanRepository?: Partial<DocumentActionPlanRepository>;
  actionRepository?: Partial<DocumentActionRepository>;
}) {
  const prisma = {
    vehicleDocumentExtraction: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    vehicleLatestState: {
      findUnique: jest.fn(),
    },
    vehicleServiceEvent: { create: jest.fn() },
    orgInvoice: { create: jest.fn() },
    fine: { create: jest.fn() },
    vehicleDamage: { create: jest.fn() },
    ...deps.prisma,
  };

  const plausibilityService = {
    runChecks: jest.fn().mockReturnValue({
      overallStatus: 'OK',
      checks: [],
      recommendedHumanReviewNotes: [],
    }),
    ...deps.plausibility,
  } as unknown as DocumentExtractionPlausibilityService;

  const entityLinkRepository = {
    listActiveByExtraction: jest.fn().mockResolvedValue([
      {
        entityType: 'VEHICLE',
        entityId: 'veh-1',
        status: 'ACTIVE',
      },
    ]),
    ...deps.entityLinks,
  } as unknown as DocumentEntityLinkRepository;

  const entityCandidateRepository = {
    listProposedByExtraction: jest.fn().mockResolvedValue([]),
    ...deps.entityCandidates,
  } as unknown as DocumentEntityCandidateRepository;

  const actionPlanRepository = {
    resolveOrCreatePlan: jest.fn(),
    ...deps.actionPlanRepository,
  } as unknown as DocumentActionPlanRepository;

  const actionRepository = {
    listByPlan: jest.fn().mockResolvedValue([]),
    createPlannedActions: jest.fn().mockResolvedValue({ created: [], deduplicatedKeys: [] }),
    ...deps.actionRepository,
  } as unknown as DocumentActionRepository;

  const service = new DocumentExtractionApplyPlanService(
    prisma as any,
    plausibilityService,
    entityLinkRepository,
    entityCandidateRepository,
    actionPlanRepository,
    actionRepository,
  );

  return {
    service,
    prisma,
    plausibilityService,
    entityLinkRepository,
    entityCandidateRepository,
    actionPlanRepository,
    actionRepository,
  };
}

const baseExtraction = {
  id: 'ext-1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  documentCategory: 'SERVICE',
  documentSubtype: 'STANDARD',
  effectiveDocumentType: 'SERVICE',
  documentType: 'SERVICE',
  confirmedData: {
    eventDate: '2026-01-15',
    odometerKm: 45000,
    workshopName: 'Werkstatt',
    description: 'Service',
    costCents: 19900,
  },
  vehicle: {
    id: 'veh-1',
    vin: 'VIN123',
    licensePlate: 'AB-CD-1',
    mileageKm: 44000,
    organizationId: 'org-1',
  },
};

describe('DocumentExtractionApplyPlanService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs planner, persists plan/actions, and returns preview statuses', async () => {
    const resolveOrCreatePlan = jest.fn().mockResolvedValue({
      plan: {
        id: 'plan-1',
        organizationId: 'org-1',
        extractionId: 'ext-1',
        planVersion: 1,
        inputFingerprint: 'fp-1',
        status: 'DRAFT',
        applyMode: 'PREVIEW',
        supersedesPlanId: null,
        invalidatedAt: null,
      },
      created: true,
      deduplicated: false,
      supersededPlanId: null,
    });

    const { service, prisma, plausibilityService, actionRepository } = makeService({
      prisma: {
        vehicleDocumentExtraction: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'ext-1', organizationId: 'org-1' })
            .mockResolvedValueOnce(baseExtraction),
        },
        vehicle: {
          findUnique: jest.fn().mockResolvedValue(baseExtraction.vehicle),
        },
        vehicleLatestState: {
          findUnique: jest.fn().mockResolvedValue({ odometerKm: 44500 }),
        },
      },
      actionPlanRepository: { resolveOrCreatePlan },
    });

    const result = await service.dryRunActionPlan('org-1', 'ext-1', 'user-1');

    expect(plausibilityService.runChecks).toHaveBeenCalled();
    expect(resolveOrCreatePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        extractionId: 'ext-1',
        applyMode: 'PREVIEW',
        inputFingerprint: expect.any(String),
      }),
    );
    expect(actionRepository.createPlannedActions).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        extractionId: 'ext-1',
        actionPlanId: 'plan-1',
      }),
    );
    expect(result.created).toBe(true);
    expect(result.deduplicated).toBe(false);
    expect(result.actions.some((action) => action.previewStatus === 'WOULD_CREATE')).toBe(true);
    expect(prisma.vehicleServiceEvent.create).not.toHaveBeenCalled();
    expect(prisma.orgInvoice.create).not.toHaveBeenCalled();
    expect(prisma.fine.create).not.toHaveBeenCalled();
    expect(prisma.vehicleDamage.create).not.toHaveBeenCalled();
  });

  it('returns existing plan idempotently without creating actions again', async () => {
    const resolveOrCreatePlan = jest.fn().mockResolvedValue({
      plan: {
        id: 'plan-existing',
        organizationId: 'org-1',
        extractionId: 'ext-1',
        planVersion: 1,
        inputFingerprint: 'fp-stable',
        status: 'DRAFT',
        applyMode: 'PREVIEW',
        supersedesPlanId: null,
        invalidatedAt: null,
      },
      created: false,
      deduplicated: true,
      supersededPlanId: null,
    });

    const { service, actionRepository } = makeService({
      prisma: {
        vehicleDocumentExtraction: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'ext-1', organizationId: 'org-1' })
            .mockResolvedValueOnce(baseExtraction),
        },
        vehicle: { findUnique: jest.fn().mockResolvedValue(baseExtraction.vehicle) },
        vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
      },
      actionPlanRepository: { resolveOrCreatePlan },
      actionRepository: {
        listByPlan: jest.fn().mockResolvedValue([
          {
            id: 'action-1',
            actionType: 'CREATE_SERVICE_EVENT',
            requirement: 'REQUIRED',
            sequence: 1,
          },
        ]),
      },
    });

    const result = await service.dryRunActionPlan('org-1', 'ext-1');

    expect(result.deduplicated).toBe(true);
    expect(result.created).toBe(false);
    expect(actionRepository.createPlannedActions).not.toHaveBeenCalled();
  });

  it('rejects extractions outside tenant scope', async () => {
    const { service } = makeService({
      prisma: {
        vehicleDocumentExtraction: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    });

    await expect(service.dryRunActionPlan('org-2', 'ext-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires confirmed review data', async () => {
    const { service } = makeService({
      prisma: {
        vehicleDocumentExtraction: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'ext-1', organizationId: 'org-1' })
            .mockResolvedValueOnce({ ...baseExtraction, confirmedData: null }),
        },
      },
    });

    await expect(service.dryRunActionPlan('org-1', 'ext-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('marks downstream actions BLOCKED when plausibility blocks', async () => {
    const resolveOrCreatePlan = jest.fn().mockResolvedValue({
      plan: {
        id: 'plan-blocked',
        organizationId: 'org-1',
        extractionId: 'ext-1',
        planVersion: 1,
        inputFingerprint: 'fp-blocked',
        status: 'DRAFT',
        applyMode: 'PREVIEW',
        supersedesPlanId: null,
        invalidatedAt: null,
      },
      created: true,
      deduplicated: false,
      supersededPlanId: null,
    });

    const { service, actionRepository } = makeService({
      prisma: {
        vehicleDocumentExtraction: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'ext-1', organizationId: 'org-1' })
            .mockResolvedValueOnce(baseExtraction),
        },
        vehicle: { findUnique: jest.fn().mockResolvedValue(baseExtraction.vehicle) },
        vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
      },
      plausibility: {
        runChecks: jest.fn().mockReturnValue({
          overallStatus: 'BLOCKER',
          checks: [
            {
              code: 'PLATE_MISMATCH',
              status: 'BLOCKER',
              message: 'Plate mismatch',
              source: 'DOCUMENT',
            },
          ],
          recommendedHumanReviewNotes: [],
        }),
      },
      actionPlanRepository: { resolveOrCreatePlan },
    });

    const result = await service.dryRunActionPlan('org-1', 'ext-1');

    expect(result.isBlocked).toBe(true);
    expect(result.blockingReasons.some((reason) => reason.code === 'PLATE_MISMATCH')).toBe(true);
    expect(actionRepository.createPlannedActions).toHaveBeenCalled();
  });
});
