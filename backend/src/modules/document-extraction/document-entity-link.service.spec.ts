import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentActionPlanError } from './document-action.errors';
import { DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS } from './document-action-plan.types';
import { readDocumentActionPlanState } from './document-action-plan.store';
import { readPipelinePayload, readPublicActionAudit } from './document-content-cache.util';
import { DocumentEntityLinkService } from './document-entity-link.service';
import { readSupersededEntityLinks } from './document-entity-link.util';
import { readAcceptedEntityLinks } from './document-fine-extraction.rules';

describe('DocumentEntityLinkService', () => {
  const extractionId = 'ext-1';
  const orgId = 'org-1';
  const vehicleId = 'veh-1';
  const userId = 'user-1';

  function makeRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: extractionId,
      status: 'READY_FOR_REVIEW',
      organizationId: orgId,
      vehicleId,
      confirmedData: null,
      createdAt: new Date('2026-07-17T10:00:00.000Z'),
      updatedAt: new Date('2026-07-17T10:00:00.000Z'),
      plausibility: {
        _pipeline: {
          actionPlan: {
            planId: 'plan-1',
            planVersion: 1,
            fingerprint: 'fp-1',
            status: 'CONFIRMED',
            extractionId,
            organizationId: orgId,
            vehicleId,
            documentType: 'FINE',
            planOutcome: 'CREATE_FINE',
            actions: [],
            confirmedAt: new Date().toISOString(),
          },
          actionPlanApplyLifecycle: {
            status: 'READY_FOR_ACTION_PREVIEW',
            updatedAt: new Date().toISOString(),
          },
        },
      },
      ...overrides,
    };
  }

  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    let currentRecord = makeRecord();
    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
      },
      booking: {
        findFirst: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
      },
      vendor: {
        findFirst: jest.fn(),
      },
      ...prismaOverrides,
    };
    prisma.vehicleDocumentExtraction.findFirst.mockImplementation(async () => currentRecord);
    prisma.vehicleDocumentExtraction.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      currentRecord = { ...currentRecord, ...data };
      return currentRecord;
    });
    prisma.vehicleDocumentExtraction.findUniqueOrThrow.mockImplementation(async () => currentRecord);
    return {
      service: new DocumentEntityLinkService(prisma as never, {
        resyncAfterPlanChange: jest.fn().mockResolvedValue(undefined),
      } as never, {
        upsertForRecord: jest.fn().mockResolvedValue(undefined),
      } as never),
      prisma,
      setRecord: (record: ReturnType<typeof makeRecord>) => {
        currentRecord = record;
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects updates when extraction is not editable', async () => {
    const { service, prisma } = makeService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(
      makeRecord({ status: 'APPLIED' }),
    );

    await expect(
      service.updateForVehicle(vehicleId, extractionId, [
        { operation: 'confirm', entityType: 'customer', entityId: 'cust-1' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects updates when action plan is locked during apply', async () => {
    const { service, prisma } = makeService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(
      makeRecord({
        plausibility: {
          _pipeline: {
            actionPlan: {
              planId: 'plan-1',
              status: 'CONFIRMED',
            },
            actionPlanApplyLifecycle: {
              status: 'APPLYING',
              updatedAt: new Date().toISOString(),
            },
          },
        },
      }),
    );

    await expect(
      service.updateForVehicle(vehicleId, extractionId, [
        { operation: 'confirm', entityType: 'customer', entityId: 'cust-1' },
      ]),
    ).rejects.toBeInstanceOf(DocumentActionPlanError);
  });

  it('supersedes prior link and invalidates action plan on change', async () => {
    const { service, prisma, setRecord } = makeService();
    const record = makeRecord({
      confirmedData: {
        acceptedEntityLinks: [{ entityType: 'customer', entityId: 'cust-old', label: 'Old' }],
      },
    });
    setRecord(record);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-new' });

    const result = await service.updateForVehicle(
      vehicleId,
      extractionId,
      [
        {
          operation: 'change',
          entityType: 'customer',
          entityId: 'cust-new',
          previousEntityId: 'cust-old',
          label: 'New',
        },
      ],
      userId,
    );

    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalled();
    const updateArg = prisma.vehicleDocumentExtraction.update.mock.calls[0][0];
    const confirmedData = updateArg.data.confirmedData as Record<string, unknown>;
    const links = readAcceptedEntityLinks(confirmedData);
    expect(links).toEqual([
      { entityType: 'customer', entityId: 'cust-new', label: 'New' },
    ]);

    const pipeline = readPipelinePayload(updateArg.data.plausibility);
    expect(pipeline.actionPlan?.status).toBe('INVALIDATED');
    expect(pipeline.actionPlan?.invalidationReason).toBe(
      DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS.CONFIRMED_DATA_CHANGED,
    );
    expect(readSupersededEntityLinks(updateArg.data.plausibility)).toEqual([
      expect.objectContaining({
        entityType: 'customer',
        entityId: 'cust-old',
        supersededReason: 'changed',
        replacedByEntityId: 'cust-new',
        supersededByUserId: userId,
      }),
    ]);
    expect(readPublicActionAudit(updateArg.data.plausibility).at(-1)).toEqual(
      expect.objectContaining({ action: 'update_entity_links', userId }),
    );
    expect(result).toBeTruthy();
  });

  it('does not delete downstream entities when removing a link', async () => {
    const { service, prisma, setRecord } = makeService();
    const record = makeRecord({
      confirmedData: {
        acceptedEntityLinks: [{ entityType: 'driver', entityId: 'driver-1' }],
      },
      plausibility: {},
    });
    setRecord(record);

    await service.updateForVehicle(
      vehicleId,
      extractionId,
      [{ operation: 'remove', entityType: 'driver' }],
      userId,
    );

    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalledTimes(1);
    const deleteCalls = [
      ...(prisma.customer as { delete?: jest.Mock }).delete?.mock?.calls ?? [],
      ...(prisma.booking as { delete?: jest.Mock }).delete?.mock?.calls ?? [],
      ...(prisma.vendor as { delete?: jest.Mock }).delete?.mock?.calls ?? [],
    ];
    expect(deleteCalls).toHaveLength(0);
    const updateArg = prisma.vehicleDocumentExtraction.update.mock.calls[0][0];
    expect(readAcceptedEntityLinks(updateArg.data.confirmedData as Record<string, unknown>)).toEqual(
      [],
    );
    expect(readSupersededEntityLinks(updateArg.data.plausibility)).toEqual([
      expect.objectContaining({
        entityType: 'driver',
        entityId: 'driver-1',
        supersededReason: 'removed',
      }),
    ]);
  });

  it('returns not found for cross-vehicle access', async () => {
    const { service, prisma } = makeService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(null);

    await expect(
      service.updateForVehicle('other-veh', extractionId, [
        { operation: 'confirm', entityType: 'customer', entityId: 'cust-1' },
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows org-scoped general document without vehicle link', async () => {
    const { service, prisma, setRecord } = makeService();
    const record = makeRecord({ vehicleId: null, plausibility: {} });
    setRecord(record);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });

    await service.updateForOrg(
      orgId,
      extractionId,
      [{ operation: 'confirm', entityType: 'customer', entityId: 'cust-1' }],
      userId,
    );

    const updateArg = prisma.vehicleDocumentExtraction.update.mock.calls[0][0];
    expect(updateArg.data.vehicleId).toBeNull();
    expect(readAcceptedEntityLinks(updateArg.data.confirmedData as Record<string, unknown>)).toEqual(
      [{ entityType: 'customer', entityId: 'cust-1', label: null }],
    );
  });

  it('does not invoke action orchestration on link-only update', async () => {
    const { service, prisma, setRecord } = makeService();
    const record = makeRecord({ plausibility: {} });
    setRecord(record);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });

    await service.updateForVehicle(
      vehicleId,
      extractionId,
      [{ operation: 'confirm', entityType: 'customer', entityId: 'cust-1' }],
      userId,
    );

    const pipeline = readPipelinePayload(
      prisma.vehicleDocumentExtraction.update.mock.calls[0][0].data.plausibility,
    );
    expect(pipeline.actionPlan).toBeUndefined();
    expect(readDocumentActionPlanState({}).actionPlan).toBeNull();
  });
});
