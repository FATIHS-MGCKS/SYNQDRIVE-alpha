import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TaskPriority, TaskType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import taskAutomationWorkflowRuntimeConfig, {
  resolveTaskAutomationWorkflowRuntimeMode,
} from '@config/task-automation-workflow-runtime.config';
import { getAutomationRuleByCatalogKey, listMaterializationAutomationRules } from '@modules/tasks/automation/task-automation-rule.util';
import { TaskAutomationRuleResolverService } from '@modules/tasks/automation/task-automation-rule-resolver.service';
import { WorkflowActionExecutorService } from '../workflow-action-executor.service';
import { WorkflowActionPreviewService } from '../workflow-action-preview.service';
import { WorkflowDryRunService } from '../workflow-dry-run.service';
import { WorkflowShadowGateService } from '../shadow/workflow-shadow-gate.service';
import { WorkflowShadowService } from '../shadow/workflow-shadow.service';
import { TaskAutomationExecutionRouterService } from '../task-automation-bridge/task-automation-execution-router.service';
import { TaskAutomationWorkflowMaterializerService } from '../task-automation-bridge/task-automation-workflow-materializer.service';
import { TaskAutomationWorkflowTemplateService } from '../task-automation-bridge/task-automation-workflow-template.service';
import { TaskAutomationWorkflowMigrationService } from './task-automation-workflow-migration.service';
import type { TaskAutomationMaterializationPayload } from '../task-automation-bridge/task-automation-workflow-bridge.types';

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
  const migrationRecords = new Map<string, Record<string, unknown>>();
  const migrationRuns: Record<string, unknown>[] = [];
  const overrides = new Map<string, Record<string, unknown>>();
  let workflowSeq = 0;

  return {
    orgWorkflow: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of workflows.values()) {
          if (where.organizationId && row.organizationId !== where.organizationId) continue;
          if (where.isTemplate === true && row.isTemplate !== true) continue;
          if (where.category && row.category !== where.category) continue;
          if (where.id && row.id !== where.id) continue;
          const metaFilter = where.systemMetadata as { path?: string[]; equals?: string } | undefined;
          if (metaFilter?.path?.[0] === 'catalogKey') {
            const meta = row.systemMetadata as { catalogKey?: string } | null;
            if (meta?.catalogKey !== metaFilter.equals) continue;
          }
          return row;
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return [...workflows.values()].filter((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.isTemplate === false && row.isTemplate === true) return false;
          const categoryFilter = where.category as { not?: string } | string | undefined;
          if (categoryFilter && typeof categoryFilter === 'object' && categoryFilter.not) {
            if (row.category === categoryFilter.not) return false;
          }
          return true;
        });
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => workflows.get(where.id) ?? null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `wf-${++workflowSeq}`;
        const row = { id, version: 1, ...data };
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
    orgTaskAutomationRuleOverride: {
      findMany: jest.fn(async ({ where }: { where: { organizationId: string } }) =>
        [...overrides.values()].filter((row) => row.organizationId === where.organizationId),
      ),
    },
    organizationMembership: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    taskAutomationWorkflowMigrationRecord: {
      findUnique: jest.fn(async ({ where }: { where: { organizationId_legacyRuleId: { organizationId: string; legacyRuleId: string } } }) =>
        migrationRecords.get(`${where.organizationId_legacyRuleId.organizationId}:${where.organizationId_legacyRuleId.legacyRuleId}`) ?? null,
      ),
      upsert: jest.fn(async ({ where, create, update }: { where: { organizationId_legacyRuleId: { organizationId: string; legacyRuleId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = `${where.organizationId_legacyRuleId.organizationId}:${where.organizationId_legacyRuleId.legacyRuleId}`;
        const existing = migrationRecords.get(key);
        const row = existing ? { ...existing, ...update } : create;
        migrationRecords.set(key, row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: { where: { organizationId: string } }) =>
        [...migrationRecords.values()].filter((row) => row.organizationId === where.organizationId),
      ),
    },
    taskAutomationWorkflowMigrationRun: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        migrationRuns.push(data);
        return data;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    booking: { findFirst: jest.fn().mockResolvedValue({ customerId: 'cust-1' }) },
    vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }) },
    _workflows: workflows,
    _migrationRecords: migrationRecords,
    _overrides: overrides,
  };
}

describe('Task automation workflow migration', () => {
  let router: TaskAutomationExecutionRouterService;
  let materializer: TaskAutomationWorkflowMaterializerService;
  let templateService: TaskAutomationWorkflowTemplateService;
  let migrationService: TaskAutomationWorkflowMigrationService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let tasksService: { upsertByDedup: jest.Mock; findActiveByDedup: jest.Mock };
  let legacyExecute: jest.Mock;
  let resolver: { resolveTaskAutomationRule: jest.Mock };

  async function buildModule(mode: 'legacy' | 'shadow' | 'cutover') {
    process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE = mode;
    prisma = createPrismaMock();
    tasksService = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
      findActiveByDedup: jest.fn().mockResolvedValue(null),
    };
    legacyExecute = jest.fn().mockResolvedValue(undefined);
    resolver = {
      resolveTaskAutomationRule: jest.fn(async (_orgId: string, ruleId: string) => {
        const rule = listMaterializationAutomationRules().find((entry) => entry.ruleId === ruleId)!;
        return {
          ruleId,
          catalogKey: rule.catalogKey,
          materializesTask: true,
          effectivelyEnabled: true,
          override: null,
          effective: {
            enabled: true,
            activationOffsetMinutes: 0,
            dueOffsetMinutes: 0,
            priority: 'NORMAL',
            assignmentStrategy: 'STATION_FROM_BOOKING',
            assignedUserId: null,
            assignedRoleKey: null,
            stationScope: null,
            escalationConfig: null,
            notificationConfig: null,
            checklistOverrides: null,
            ruleConfig: {},
          },
        };
      }),
    };

    const dryRun = {
      planWorkflow: jest.fn(async (_wf, _event) => ({
        executionMode: 'DRY_RUN',
        executed: false,
        message: 'dry',
        requestId: 'req',
        correlationId: 'corr',
        assessedAt: new Date().toISOString(),
        riskClass: 'LOW',
        sourceRevision: { type: 'saved', version: 1 },
        workflowId: 'wf-preview',
        workflowVersion: 1,
        workflowName: 'Preview',
        event: { type: 'task.automation.materialize', normalizedPayload: {} },
        scope: { passed: true, scopeType: 'organization' },
        conditions: { passed: true, results: [] },
        plannedActions: [
          {
            index: 0,
            actionType: 'task.create',
            riskClass: 'INTERNAL',
            requiresApproval: false,
            status: 'PLANNED',
            policyBlockers: [],
            validationErrors: [],
            preview: { title: 'Shadow task', dedupKey: 'booking:prep:b-test' },
          },
        ],
        skippedActions: [],
        validationErrors: [],
        policyBlockers: [],
        wouldCreateApprovals: false,
      })),
    };

    const shadowService = {
      legacySnapshotFromDedup: jest.fn().mockResolvedValue(null),
      persistBridgeEvaluation: jest.fn().mockResolvedValue('shadow-run-1'),
      recordLegacyComparison: jest.fn().mockResolvedValue('cmp-1'),
    };

    const shadowGate = {
      isOrgShadowEnabled: jest.fn().mockResolvedValue(true),
      isLegacyCompareEnabled: jest.fn().mockResolvedValue(true),
    };

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [taskAutomationWorkflowRuntimeConfig] })],
      providers: [
        TaskAutomationWorkflowTemplateService,
        WorkflowActionPreviewService,
        WorkflowActionExecutorService,
        { provide: WorkflowDryRunService, useValue: dryRun },
        TaskAutomationWorkflowMaterializerService,
        TaskAutomationExecutionRouterService,
        TaskAutomationWorkflowMigrationService,
        TaskAutomationRuleResolverService,
        { provide: WorkflowShadowService, useValue: shadowService },
        { provide: WorkflowShadowGateService, useValue: shadowGate },
        { provide: PrismaService, useValue: prisma },
        { provide: TasksService, useValue: tasksService },
        { provide: TaskAutomationRuleResolverService, useValue: resolver },
      ],
    }).compile();

    router = module.get(TaskAutomationExecutionRouterService);
    materializer = module.get(TaskAutomationWorkflowMaterializerService);
    templateService = module.get(TaskAutomationWorkflowTemplateService);
    migrationService = module.get(TaskAutomationWorkflowMigrationService);
  }

  describe('runtime router', () => {
    it('legacy mode runs legacy only', async () => {
      await buildModule('legacy');
      await router.route({ payload: basePayload(), legacyExecute });
      expect(legacyExecute).toHaveBeenCalledTimes(1);
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
    });

    it('shadow mode runs legacy + preview without task write', async () => {
      await buildModule('shadow');
      await router.route({ payload: basePayload(), legacyExecute });
      expect(legacyExecute).toHaveBeenCalledTimes(1);
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
      expect(router.drainShadowLog()).toHaveLength(1);
    });

    it('cutover mode skips legacy and executes task.create', async () => {
      await buildModule('cutover');
      await router.route({ payload: basePayload(), legacyExecute });
      expect(legacyExecute).not.toHaveBeenCalled();
      expect(tasksService.upsertByDedup).toHaveBeenCalledTimes(1);
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

  describe('migration backfill', () => {
    beforeEach(async () => {
      await buildModule('legacy');
    });

    it('migrates fresh organization catalog rules', async () => {
      const report = await migrationService.run({ organizationId: ORG_A, mode: 'execute' });
      expect(report.stats.migrated).toBeGreaterThanOrEqual(13);
      expect(report.rules.every((rule) => rule.workflowId)).toBe(true);
    });

    it('is idempotent on repeated migration', async () => {
      await migrationService.run({ organizationId: ORG_A, mode: 'execute' });
      const second = await migrationService.run({ organizationId: ORG_A, mode: 'execute' });
      expect(second.stats.alreadyMigrated).toBeGreaterThanOrEqual(13);
      expect(second.stats.migrated).toBe(0);
    });

    it('preserves org overrides in workflow enabled state', async () => {
      const rule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');
      resolver.resolveTaskAutomationRule.mockImplementation(async () => ({
        ruleId: rule.ruleId,
        catalogKey: rule.catalogKey,
        materializesTask: true,
        effectivelyEnabled: false,
        override: { version: 2, enabled: false },
        effective: {
          enabled: false,
          activationOffsetMinutes: 30,
          dueOffsetMinutes: -15,
          priority: 'HIGH',
          assignmentStrategy: 'STATION_FROM_BOOKING',
          assignedUserId: null,
          assignedRoleKey: null,
          stationScope: null,
          escalationConfig: null,
          notificationConfig: null,
          checklistOverrides: null,
          ruleConfig: {},
        },
      }));

      await migrationService.run({ organizationId: ORG_A, mode: 'execute' });
      const link = await templateService.findTemplateByCatalogKey(ORG_A, 'BOOKING_PREPARATION');
      const row = prisma._workflows.get(link!.workflowId);
      expect(row?.enabled).toBe(false);
      const actionConfig = (row?.actions as Array<{ config: Record<string, unknown> }>)[0].config;
      expect(actionConfig.priority).toBe('HIGH');
      expect(actionConfig.activationOffsetMinutes).toBe(30);
    });

    it('marks invalid override as requires remediation', async () => {
      const rule = getAutomationRuleByCatalogKey('INVOICE_PAYMENT_CHECK');
      resolver.resolveTaskAutomationRule.mockImplementation(async () => ({
        ruleId: rule.ruleId,
        catalogKey: rule.catalogKey,
        materializesTask: true,
        effectivelyEnabled: true,
        override: { assignedUserId: 'not-a-uuid' },
        effective: {
          enabled: true,
          activationOffsetMinutes: 0,
          dueOffsetMinutes: 0,
          priority: 'NORMAL',
          assignmentStrategy: 'UNASSIGNED',
          assignedUserId: 'not-a-uuid',
          assignedRoleKey: null,
          stationScope: null,
          escalationConfig: null,
          notificationConfig: null,
          checklistOverrides: null,
          ruleConfig: {},
        },
      }));

      const report = await migrationService.run({ organizationId: ORG_A, mode: 'execute' });
      const invoice = report.rules.find((row) => row.legacyRuleId === rule.ruleId);
      expect(invoice?.status).toBe('requires_remediation');
      expect(invoice?.remediationReason).toContain('UUID');
    });

    it('isolates templates per tenant', async () => {
      await migrationService.run({ organizationId: ORG_A, mode: 'execute' });
      await migrationService.run({ organizationId: ORG_B, mode: 'execute' });
      const linkA = await templateService.findTemplateByCatalogKey(ORG_A, 'BOOKING_PREPARATION');
      const linkB = await templateService.findTemplateByCatalogKey(ORG_B, 'BOOKING_PREPARATION');
      expect(linkA?.workflowId).not.toBe(linkB?.workflowId);
    });
  });

  describe('duplicate execution prevention', () => {
    beforeEach(async () => {
      await buildModule('cutover');
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

  describe('config', () => {
    it('defaults runtime mode to legacy', () => {
      delete process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE;
      expect(resolveTaskAutomationWorkflowRuntimeMode()).toBe('legacy');
    });
  });
});
