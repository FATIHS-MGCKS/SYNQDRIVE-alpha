import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RecommendationIntegrationsService } from './recommendation-integrations.service';
import { OrgRecommendationsRepository } from './org-recommendations.repository';
import { RecommendationEntityValidationService } from './recommendation-entity-validation.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { ServiceCasesService } from '@modules/service-cases/service-cases.service';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('RecommendationIntegrationsService', () => {
  const recommendation = {
    id: 'rec-1',
    organizationId: 'org-1',
    sourceType: 'DASHBOARD_INSIGHT' as const,
    sourceId: 'insight-1',
    category: 'MAINTENANCE' as const,
    title: 'Bremsen prüfen',
    description: 'Verschleiß',
    rationale: 'Telemetrie-Trend über 14 Tage.',
    expectedBenefit: null,
    estimatedCost: null,
    expectedNetBenefit: null,
    confidence: 'HIGH' as const,
    priority: 60,
    affectedEntities: [{ entityType: 'vehicle' as const, entityId: 'veh-1', label: 'B-AB 1' }],
    ownerId: null,
    dueAt: null,
    status: 'NEW' as const,
    createdAt: '2026-07-24T10:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z',
    calculationVersion: 'recommendation-v1',
  };

  let repo: jest.Mocked<OrgRecommendationsRepository>;
  let entityValidation: RecommendationEntityValidationService;
  let tasks: jest.Mocked<TasksService>;
  let serviceCases: jest.Mocked<ServiceCasesService>;
  let workflows: jest.Mocked<WorkflowEventService>;
  let prisma: { serviceCase: { findFirst: jest.Mock }; organizationMembership: { findFirst: jest.Mock } };
  let service: RecommendationIntegrationsService;

  beforeEach(() => {
    repo = {
      findById: jest.fn(async () => recommendation),
      updateWithEvent: jest.fn(async () => recommendation),
    } as unknown as jest.Mocked<OrgRecommendationsRepository>;

    entityValidation = new RecommendationEntityValidationService({
      vehicle: { findFirst: jest.fn() },
      booking: { findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
      invoice: { findFirst: jest.fn() },
      station: { findFirst: jest.fn() },
      driver: { findFirst: jest.fn() },
    } as unknown as PrismaService);

    jest.spyOn(entityValidation, 'assertEntityInOrg').mockResolvedValue(undefined);
    jest.spyOn(entityValidation, 'assertRecommendationEntitiesInOrg').mockResolvedValue(undefined);
    jest.spyOn(entityValidation, 'assertSameOrganization').mockImplementation(() => undefined);

    tasks = {
      findActiveByDedup: jest.fn(async () => null),
      upsertByDedup: jest.fn(async () => ({ id: 'task-1' })),
    } as unknown as jest.Mocked<TasksService>;

    serviceCases = {
      create: jest.fn(async () => ({ id: 'sc-1' })),
    } as unknown as jest.Mocked<ServiceCasesService>;

    workflows = {
      emitEvent: jest.fn(async () => ['run-1']),
    } as unknown as jest.Mocked<WorkflowEventService>;

    prisma = {
      serviceCase: { findFirst: jest.fn(async () => null) },
      organizationMembership: { findFirst: jest.fn(async () => ({ userId: 'user-1' })) },
    };

    service = new RecommendationIntegrationsService(
      repo,
      entityValidation,
      tasks,
      serviceCases,
      workflows,
      prisma as unknown as PrismaService,
    );
  });

  it('lists integrations with duplicate task state', async () => {
    tasks.findActiveByDedup.mockResolvedValueOnce({ id: 'task-existing' } as never);
    const rows = await service.listIntegrations('org-1', 'rec-1', true);
    const createTask = rows.find((row) => row.action === 'CREATE_TASK');
    expect(createTask?.state).toBe('DUPLICATE');
    expect(createTask?.linkedTaskId).toBe('task-existing');
  });

  it('creates linked task with recommendation metadata', async () => {
    const result = await service.executeIntegration(
      'org-1',
      'rec-1',
      { action: 'CREATE_TASK' },
      'user-1',
      true,
    );
    expect((result as { taskId: string }).taskId).toBe('task-1');
    expect(tasks.upsertByDedup).toHaveBeenCalledWith(
      'org-1',
      'evaluations:recommendation:rec-1:task',
      expect.objectContaining({
        vehicleId: 'veh-1',
        source: 'evaluations-recommendation',
        metadata: expect.objectContaining({ recommendationId: 'rec-1' }),
      }),
    );
    expect(repo.updateWithEvent).toHaveBeenCalledWith(
      'org-1',
      'rec-1',
      {},
      expect.objectContaining({ eventType: 'TASK_LINKED' }),
    );
  });

  it('rejects duplicate task creation', async () => {
    tasks.findActiveByDedup.mockResolvedValueOnce({ id: 'task-existing' } as never);
    await expect(
      service.executeIntegration('org-1', 'rec-1', { action: 'CREATE_TASK' }, 'user-1', true),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects cross-tenant recommendation access', async () => {
    repo.findById.mockResolvedValueOnce({ ...recommendation, organizationId: 'org-2' });
    jest.spyOn(entityValidation, 'assertSameOrganization').mockImplementation(() => {
      throw new ForbiddenException();
    });
    await expect(service.listIntegrations('org-1', 'rec-1', true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects invalid entity references via validation service', async () => {
    jest.spyOn(entityValidation, 'assertRecommendationEntitiesInOrg').mockRejectedValueOnce(
      new NotFoundException(),
    );
    await expect(
      service.executeIntegration('org-1', 'rec-1', { action: 'CREATE_TASK' }, 'user-1', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates service case for maintenance recommendation', async () => {
    const result = await service.executeIntegration(
      'org-1',
      'rec-1',
      { action: 'OPEN_SERVICE_CASE' },
      'user-1',
      true,
    );
    expect((result as { serviceCaseId: string }).serviceCaseId).toBe('sc-1');
    expect(serviceCases.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ vehicleId: 'veh-1', source: 'HEALTH' }),
      'user-1',
    );
  });

  it('starts workflow and records cancelled runs when no workflow matches', async () => {
    repo.findById.mockResolvedValueOnce({
      ...recommendation,
      category: 'FLEET_UTILIZATION',
    });
    workflows.emitEvent.mockResolvedValueOnce([]);
    const result = await service.executeIntegration(
      'org-1',
      'rec-1',
      { action: 'START_WORKFLOW' },
      'user-1',
      true,
    );
    expect((result as { cancelled: boolean }).cancelled).toBe(true);
    expect((result as { workflowRunIds: string[] }).workflowRunIds).toEqual([]);
  });

  it('rejects execute when caller lacks manage permission', async () => {
    await expect(
      service.executeIntegration('org-1', 'rec-1', { action: 'CREATE_TASK' }, 'user-1', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects navigate-only actions on execute endpoint', async () => {
    await expect(
      service.executeIntegration(
        'org-1',
        'rec-1',
        { action: 'OPEN_VEHICLE' as never },
        'user-1',
        true,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
