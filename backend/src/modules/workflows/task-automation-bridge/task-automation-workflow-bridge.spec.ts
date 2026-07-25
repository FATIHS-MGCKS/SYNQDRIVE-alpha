import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TaskPriority, TaskType } from '@prisma/client';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import taskAutomationWorkflowRuntimeConfig, {
  resolveTaskAutomationWorkflowRuntimeMode,
} from '@config/task-automation-workflow-runtime.config';
import { getAutomationRuleByCatalogKey } from '@modules/tasks/automation/task-automation-rule.util';
import {
  WorkflowActionRegistryExecutorService,
  WorkflowActionRegistryService,
  WORKFLOW_ACTION_HANDLERS,
  createWorkflowActionPiiSafeLogger,
  WorkflowActionNoopSecretsResolver,
} from '../actions';
import {
  WORKFLOW_ACTION_HANDLER_PROVIDERS,
  workflowActionHandlersProvider,
} from '../actions/workflow-action-handlers.provider';
import { WorkflowActionPolicyService } from '../policies/workflow-action-policy.service';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';
import { TaskAutomationExecutionRouterService } from './task-automation-execution-router.service';
import { TaskAutomationWorkflowMaterializerService } from './task-automation-workflow-materializer.service';
import { TaskAutomationWorkflowTemplateService } from './task-automation-workflow-template.service';
import type { TaskAutomationMaterializationPayload } from './task-automation-workflow-bridge.types';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function basePayload(
  overrides: Partial<TaskAutomationMaterializationPayload> = {},
): TaskAutomationMaterializationPayload {
  const rule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');
  return {
    organizationId: ORG_A,
    catalogKey: 'BOOKING_PREPARATION',
    ruleId: rule.ruleId,
    dedupKey: 'booking:prep:b-test',
    title: rule.nameDe,
    description: rule.descriptionDe,
    category: rule.category,
    type: rule.taskType!,
    sourceType: rule.sourceType,
    source: rule.source,
    priority: 'NORMAL',
    vehicleId: 'veh-1',
    bookingId: 'b-test',
    customerId: 'cust-1',
    withChecklist: true,
    dueDate: new Date('2026-07-25T08:00:00.000Z'),
    activatesAt: new Date('2026-07-24T08:00:00.000Z'),
    entityType: 'BOOKING',
    entityId: 'b-test',
    ...overrides,
  };
}

function createPrismaMock() {
  const workflows = new Map<string, Record<string, unknown>>();
  let workflowSeq = 0;

  return {
    orgWorkflow: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of workflows.values()) {
          if (where.organizationId && row.organizationId !== where.organizationId) continue;
          if (where.isTemplate === true && row.isTemplate !== true) continue;
          if (where.category && row.category !== where.category) continue;
          const metaFilter = where.systemMetadata as { path?: string[]; equals?: string } | undefined;
          if (metaFilter?.path?.[0] === 'catalogKey') {
            const meta = row.systemMetadata as { catalogKey?: string } | null;
            if (meta?.catalogKey !== metaFilter.equals) continue;
          }
          return row;
        }
        return null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `wf-${++workflowSeq}`;
        const row = { id, ...data };
        workflows.set(id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = workflows.get(where.id);
        if (!row) throw new Error('not found');
        const updated = { ...row, ...data };
        workflows.set(where.id, updated);
        return updated;
      }),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue({ customerId: 'cust-1' }),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }),
    },
    _workflows: workflows,
  };
}

describe('Task automation → workflow runtime bridge', () => {
  let router: TaskAutomationExecutionRouterService;
  let materializer: TaskAutomationWorkflowMaterializerService;
  let templateService: TaskAutomationWorkflowTemplateService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let tasksService: {
    upsertByDedup: jest.Mock;
    findActiveByDedup: jest.Mock;
  };
  let legacyExecute: jest.Mock;

  async function buildModule(mode: 'legacy' | 'shadow' | 'cutover') {
    process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE = mode;
    prisma = createPrismaMock();
    tasksService = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
      findActiveByDedup: jest.fn().mockResolvedValue(null),
    };
    legacyExecute = jest.fn().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [taskAutomationWorkflowRuntimeConfig],
          ignoreEnvFile: true,
        }),
      ],
      providers: [
        WorkflowActionPolicyService,
        WorkflowActionSafetyBlockService,
        ...WORKFLOW_ACTION_HANDLER_PROVIDERS,
        workflowActionHandlersProvider,
        WorkflowActionRegistryService,
        WorkflowActionRegistryExecutorService,
        TaskAutomationWorkflowTemplateService,
        TaskAutomationWorkflowMaterializerService,
        TaskAutomationExecutionRouterService,
        { provide: PrismaService, useValue: prisma },
        { provide: TasksService, useValue: tasksService },
        {
          provide: NotificationCoreService,
          useValue: { ingestCandidate: jest.fn().mockResolvedValue({ enabled: true }) },
        },
        {
          provide: RentalHealthService,
          useValue: {
            isRentalBlocked: jest.fn().mockResolvedValue({
              blocked: false,
              reasons: [],
              healthGateStatus: 'OK',
            }),
          },
        },
      ],
    }).compile();

    const registry = module.get(WorkflowActionRegistryService);
    registry.onModuleInit();
    router = module.get(TaskAutomationExecutionRouterService);
    materializer = module.get(TaskAutomationWorkflowMaterializerService);
    templateService = module.get(TaskAutomationWorkflowTemplateService);
  }

  afterEach(() => {
    delete process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE;
  });

  describe('runtime mode resolution', () => {
    it('defaults to legacy', () => {
      delete process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE;
      expect(resolveTaskAutomationWorkflowRuntimeMode()).toBe('legacy');
    });

    it('parses shadow and cutover', () => {
      expect(resolveTaskAutomationWorkflowRuntimeMode('shadow')).toBe('shadow');
      expect(resolveTaskAutomationWorkflowRuntimeMode('cutover')).toBe('cutover');
    });
  });

  describe('TaskAutomationExecutionRouterService', () => {
    it('legacy mode runs legacy only', async () => {
      await buildModule('legacy');
      await router.route({ payload: basePayload(), legacyExecute });
      expect(legacyExecute).toHaveBeenCalledTimes(1);
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
    });

    it('shadow mode runs legacy + workflow preview without task write', async () => {
      await buildModule('shadow');
      const previewSpy = jest.spyOn(materializer, 'materializeViaWorkflow');
      await router.route({ payload: basePayload(), legacyExecute });
      expect(legacyExecute).toHaveBeenCalledTimes(1);
      expect(previewSpy).toHaveBeenCalledWith(expect.any(Object), 'preview');
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
      const shadow = router.drainShadowLog();
      expect(shadow).toHaveLength(1);
      expect(shadow[0].catalogKey).toBe('BOOKING_PREPARATION');
    });

    it('cutover mode skips legacy and executes task.create', async () => {
      await buildModule('cutover');
      await router.route({ payload: basePayload(), legacyExecute });
      expect(legacyExecute).not.toHaveBeenCalled();
      expect(tasksService.upsertByDedup).toHaveBeenCalledTimes(1);
      expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
        ORG_A,
        'booking:prep:b-test',
        expect.objectContaining({
          title: expect.any(String),
          priority: 'NORMAL',
          checklist: expect.any(Array),
        }),
      );
    });

    it('rollback to legacy stops workflow writes', async () => {
      await buildModule('cutover');
      await router.route({ payload: basePayload(), legacyExecute });
      expect(tasksService.upsertByDedup).toHaveBeenCalledTimes(1);

      await buildModule('legacy');
      tasksService.upsertByDedup.mockClear();
      legacyExecute.mockClear();
      await router.route({ payload: basePayload(), legacyExecute });
      expect(legacyExecute).toHaveBeenCalledTimes(1);
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
    });
  });

  describe('system workflow templates', () => {
    beforeEach(async () => {
      await buildModule('legacy');
    });

    it('creates marked system templates per catalog rule', async () => {
      const links = await templateService.ensureSystemTemplates(ORG_A);
      expect(links.length).toBeGreaterThanOrEqual(13);
      expect(links[0].systemMetadata.systemTemplate).toBe(true);
      expect(links[0].workflowName).toMatch(/^\[System\]/);
    });

    it('maps catalog rule id to workflow template for traceability', async () => {
      const rule = getAutomationRuleByCatalogKey('BOOKING_PICKUP');
      await templateService.ensureSystemTemplates(ORG_A);
      const link = await templateService.findTemplateByCatalogKey(ORG_A, 'BOOKING_PICKUP');
      expect(link?.ruleId).toBe(rule.ruleId);
      expect(link?.catalogKey).toBe('BOOKING_PICKUP');
      expect(link?.systemMetadata.catalogRuleId).toBe(rule.ruleId);
    });

    it('isolates templates per tenant', async () => {
      await templateService.ensureSystemTemplates(ORG_A);
      await templateService.ensureSystemTemplates(ORG_B);
      const linkA = await templateService.findTemplateByCatalogKey(ORG_A, 'BOOKING_PREPARATION');
      const linkB = await templateService.findTemplateByCatalogKey(ORG_B, 'BOOKING_PREPARATION');
      expect(linkA?.workflowId).toBeDefined();
      expect(linkB?.workflowId).toBeDefined();
      expect(linkA?.workflowId).not.toBe(linkB?.workflowId);
    });
  });

  describe('task.create materialization', () => {
    beforeEach(async () => {
      await buildModule('cutover');
    });

    it('passes catalog dedup key (not workflow-scoped)', async () => {
      await materializer.materializeViaWorkflow(
        basePayload({ dedupKey: 'booking:pickup:b-42' }),
        'execute',
      );
      expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
        ORG_A,
        'booking:pickup:b-42',
        expect.any(Object),
      );
    });

    it('applies priority and due date from payload', async () => {
      await materializer.materializeViaWorkflow(
        basePayload({
          priority: 'HIGH',
          dueDate: new Date('2026-08-01T10:00:00.000Z'),
        }),
        'execute',
      );
      expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
        ORG_A,
        expect.any(String),
        expect.objectContaining({
          priority: 'HIGH',
          dueDate: new Date('2026-08-01T10:00:00.000Z'),
        }),
      );
    });

    it('materializes checklist when withChecklist is set', async () => {
      await materializer.materializeViaWorkflow(
        basePayload({ withChecklist: true, type: 'BOOKING_PREPARATION' as TaskType }),
        'execute',
      );
      expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
        ORG_A,
        expect.any(String),
        expect.objectContaining({
          checklist: expect.arrayContaining([
            expect.objectContaining({ title: expect.any(String) }),
          ]),
        }),
      );
    });

    it('uses explicit checklist items for document package rules', async () => {
      const docRule = getAutomationRuleByCatalogKey('DOCUMENT_PACKAGE_INCOMPLETE');
      await materializer.materializeViaWorkflow(
        basePayload({
          catalogKey: 'DOCUMENT_PACKAGE_INCOMPLETE',
          ruleId: docRule.ruleId,
          type: docRule.taskType!,
          withChecklist: false,
          checklist: [
            { title: 'Mietvertrag', description: 'documentSlot:RENTAL_CONTRACT', sortOrder: 0, isRequired: true },
          ],
        }),
        'execute',
      );
      expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
        ORG_A,
        expect.any(String),
        expect.objectContaining({
          checklist: [
            expect.objectContaining({ title: 'Mietvertrag' }),
          ],
        }),
      );
    });

    it('deduplicates via findActiveByDedup on repeat execute', async () => {
      tasksService.findActiveByDedup.mockResolvedValueOnce({ id: 'existing-task' });
      const result = await materializer.materializeViaWorkflow(basePayload(), 'execute');
      expect(result.taskId).toBe('existing-task');
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
    });

    it('rejects cross-tenant vehicle on execute', async () => {
      prisma.vehicle.findFirst.mockResolvedValueOnce(null);
      await expect(
        materializer.materializeViaWorkflow(basePayload({ vehicleId: 'foreign-veh' }), 'execute'),
      ).rejects.toThrow('Vehicle not found in organization');
    });
  });

  describe('org override values flow through payload', () => {
    it('honors overridden priority in cutover path', async () => {
      await buildModule('cutover');
      await materializer.materializeViaWorkflow(
        basePayload({ priority: 'CRITICAL' as TaskPriority }),
        'execute',
      );
      expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
        ORG_A,
        expect.any(String),
        expect.objectContaining({ priority: 'CRITICAL' }),
      );
    });
  });

  describe('parallel legacy + shadow', () => {
    it('does not double-write tasks in shadow mode', async () => {
      await buildModule('shadow');
      await router.route({ payload: basePayload(), legacyExecute });
      expect(legacyExecute).toHaveBeenCalledTimes(1);
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
    });
  });
});
