import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { WorkflowExecutionMode } from '../workflow-execution-mode';
import type { WorkflowExecutionPlan } from '../workflow-execution-plan.types';
import { WorkflowDryRunService } from '../workflow-dry-run.service';
import { compareLegacyTaskWithShadowPlan } from './workflow-shadow-comparison.util';
import { WorkflowShadowGateService } from './workflow-shadow-gate.service';
import { WorkflowShadowService } from './workflow-shadow.service';
import workflowShadowConfig from '@config/workflow-shadow.config';
import taskAutomationWorkflowRuntimeConfig from '@config/task-automation-workflow-runtime.config';
import { PrismaService } from '@shared/database/prisma.service';

const ORG_A = 'org-shadow-a';

function basePlan(overrides: Partial<WorkflowExecutionPlan> = {}): WorkflowExecutionPlan {
  return {
    executionMode: WorkflowExecutionMode.SHADOW,
    executed: false,
    message: 'shadow',
    requestId: 'req-1',
    correlationId: 'corr-1',
    assessedAt: new Date().toISOString(),
    riskClass: 'LOW',
    sourceRevision: { type: 'saved', version: 1 },
    workflowId: 'wf-1',
    workflowVersion: 1,
    workflowName: 'Test',
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
        preview: {
          title: 'Prep task',
          taskType: 'BOOKING_PREPARATION',
          priority: 'HIGH',
          dedupKey: 'booking:prep:1',
          activatesAt: '2026-07-24T08:00:00.000Z',
          dueDate: '2026-07-25T08:00:00.000Z',
        },
      },
    ],
    skippedActions: [],
    validationErrors: [],
    policyBlockers: [],
    wouldCreateApprovals: false,
    ...overrides,
  };
}

describe('Workflow shadow mode', () => {
  describe('compareLegacyTaskWithShadowPlan', () => {
    it('detects trigger mismatch when legacy ran but workflow would not', () => {
      const result = compareLegacyTaskWithShadowPlan(
        { taskId: 't-1', dedupKey: 'd-1', type: 'BOOKING_PREPARATION', priority: 'NORMAL' },
        basePlan({
          scope: { passed: false, scopeType: 'organization', reason: 'blocked' },
          plannedActions: [],
        }),
      );
      expect(result.hasDeviation).toBe(true);
      expect(result.deviationReasons).toContain('legacy_executed_but_workflow_would_not_trigger');
    });

    it('detects priority and timing deviations', () => {
      const result = compareLegacyTaskWithShadowPlan(
        {
          taskId: 't-1',
          dedupKey: 'booking:prep:1',
          type: 'BOOKING_PREPARATION',
          priority: 'NORMAL',
          activatesAt: '2026-07-24T07:00:00.000Z',
          dueDate: '2026-07-25T07:00:00.000Z',
        },
        basePlan(),
      );
      expect(result.hasDeviation).toBe(true);
      expect(result.deviationReasons).toContain('priority_mismatch');
      expect(result.triggerAtDeltaMs).toBe(3_600_000);
    });
  });

  describe('WorkflowShadowService persistence', () => {
    const shadowRuns = new Map<string, Record<string, unknown>>();
    const comparisons: Record<string, unknown>[] = [];
    let seq = 0;

    const prisma = {
      orgWorkflowShadowSettings: {
        findUnique: jest.fn().mockResolvedValue({ enabled: true, legacyCompareEnabled: true, retentionDays: 30 }),
        upsert: jest.fn(),
      },
      orgWorkflowShadowRun: {
        findUnique: jest.fn(async ({ where }: { where: { organizationId_eventIdempotencyKey_workflowId: { organizationId: string; eventIdempotencyKey: string; workflowId: string } } }) => {
          const key = `${where.organizationId_eventIdempotencyKey_workflowId.organizationId}:${where.organizationId_eventIdempotencyKey_workflowId.workflowId}:${where.organizationId_eventIdempotencyKey_workflowId.eventIdempotencyKey}`;
          return shadowRuns.get(key) ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = `shadow-${++seq}`;
          const row = { id, ...data };
          const key = `${data.organizationId}:${data.workflowId}:${data.eventIdempotencyKey}`;
          shadowRuns.set(key, row);
          return row;
        }),
        deleteMany: jest.fn(),
      },
      orgWorkflowShadowComparison: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          comparisons.push(data);
          return { id: `cmp-${++seq}`, ...data };
        }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      orgTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-legacy',
          dedupKey: 'booking:prep:1',
          type: 'BOOKING_PREPARATION',
          priority: 'NORMAL',
          title: 'Legacy',
          activatesAt: new Date('2026-07-24T07:00:00.000Z'),
          dueDate: new Date('2026-07-25T07:00:00.000Z'),
          metadata: { automationCatalogKey: 'BOOKING_PREPARATION' },
        }),
      },
    };

    const dryRun = {
      planWorkflow: jest.fn().mockResolvedValue(basePlan()),
    };

    const gate = {
      isOrgShadowEnabled: jest.fn().mockResolvedValue(true),
      isLegacyCompareEnabled: jest.fn().mockResolvedValue(true),
      getRetentionDays: jest.fn().mockResolvedValue(30),
      invalidateOrgCache: jest.fn(),
      resolve: jest.fn().mockResolvedValue({ runShadow: true, runLive: false, legacyCompare: true }),
    };

    let service: WorkflowShadowService;

    beforeEach(async () => {
      shadowRuns.clear();
      comparisons.length = 0;
      seq = 0;
      jest.clearAllMocks();

      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            load: [workflowShadowConfig, taskAutomationWorkflowRuntimeConfig],
          }),
        ],
        providers: [
          WorkflowShadowService,
          { provide: PrismaService, useValue: prisma },
          { provide: WorkflowDryRunService, useValue: dryRun },
          { provide: WorkflowShadowGateService, useValue: gate },
        ],
      }).compile();

      service = module.get(WorkflowShadowService);
    });

    it('persists shadow evaluation without live workflow runs', async () => {
      const id = await service.persistBridgeEvaluation({
        organizationId: ORG_A,
        workflowId: 'wf-1',
        workflowVersion: 1,
        event: {
          organizationId: ORG_A,
          type: 'task.automation.materialize',
          payload: {},
          idempotencyKey: 'evt-1',
        },
        plan: basePlan(),
      });

      expect(id).toBeTruthy();
      expect(prisma.orgWorkflowShadowRun.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.orgWorkflowShadowRun.create.mock.calls[0][0].data;
      expect(createArg.wouldTrigger).toBe(true);
      expect(createArg.plannedActionCount).toBe(1);
    });

    it('is idempotent on repeated shadow persistence', async () => {
      const input = {
        organizationId: ORG_A,
        workflowId: 'wf-1',
        workflowVersion: 1,
        event: {
          organizationId: ORG_A,
          type: 'task.automation.materialize',
          payload: {},
          idempotencyKey: 'evt-dup',
        },
        plan: basePlan(),
      };
      const first = await service.persistBridgeEvaluation(input);
      const second = await service.persistBridgeEvaluation(input);
      expect(first).toBe(second);
      expect(prisma.orgWorkflowShadowRun.create).toHaveBeenCalledTimes(1);
    });

    it('records legacy comparison deviations', async () => {
      await service.persistBridgeEvaluation({
        organizationId: ORG_A,
        workflowId: 'wf-1',
        workflowVersion: 1,
        event: {
          organizationId: ORG_A,
          type: 'task.automation.materialize',
          payload: {},
          idempotencyKey: 'evt-cmp',
        },
        plan: basePlan(),
      });

      await service.recordLegacyComparison({
        organizationId: ORG_A,
        workflowId: 'wf-1',
        event: {
          organizationId: ORG_A,
          type: 'task.automation.materialize',
          payload: {},
          idempotencyKey: 'evt-cmp',
        },
        plan: basePlan(),
        legacy: {
          taskId: 'task-legacy',
          dedupKey: 'booking:prep:1',
          type: 'BOOKING_PREPARATION',
          priority: 'NORMAL',
          activatesAt: '2026-07-24T07:00:00.000Z',
          dueDate: '2026-07-25T07:00:00.000Z',
        },
        catalogKey: 'BOOKING_PREPARATION',
      });

      expect(comparisons).toHaveLength(1);
      expect(comparisons[0]?.hasDeviation).toBe(true);
    });

    it('enforces tenant isolation on settings reads', async () => {
      await service.getSettings(ORG_A);
      expect(prisma.orgWorkflowShadowSettings.findUnique).toHaveBeenCalledWith({
        where: { organizationId: ORG_A },
      });
    });
  });

  describe('feature flag gate', () => {
    it('shadow runtime mode enables org shadow without DB settings', async () => {
      process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE = 'shadow';
      const gate = new WorkflowShadowGateService(
        { orgWorkflowShadowSettings: { findUnique: jest.fn().mockResolvedValue(null) } } as unknown as PrismaService,
        { get: jest.fn().mockReturnValue(false) } as never,
      );
      await expect(gate.isOrgShadowEnabled(ORG_A)).resolves.toBe(true);
      delete process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE;
    });
  });
});
