import { OrgWorkflow } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { TasksService } from '@modules/tasks/tasks.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowExecutionMode } from './workflow-execution-mode';
import { makeRolloutServiceMock } from './rollout/workflow-runtime-rollout.test-util';
import {
  buildNotificationActionIdempotencyKey,
  buildNotificationWorkflowRunIdempotencyKey,
  extractNotificationWorkflowContext,
  resolveWorkflowRunIdempotencyKey,
} from './workflow-notification-idempotency.util';

const ORG = 'org-a';
const WF_A = 'wf-a';
const WF_B = 'wf-b';
const NOTIF = 'notif-1';
const TRIGGER_OPEN = 'notification.opened:notif-1:gen:1';
const TRIGGER_REOPEN = 'notification.reopened:notif-1:reopen:1';

function notificationEvent(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    type: 'notification.opened',
    entityType: 'vehicle',
    entityId: 'veh-1',
    idempotencyKey: TRIGGER_OPEN,
    payload: {
      organizationId: ORG,
      notificationId: NOTIF,
      fingerprint: 'fp-1',
      lifecycleGeneration: 1,
      reopenCount: 0,
      eventType: 'TEST_EVENT',
      entityType: 'VEHICLE',
      entityId: 'veh-1',
      severity: 'WARNING',
      occurredAt: new Date().toISOString(),
      correlationId: 'corr-1',
      triggerEventId: TRIGGER_OPEN,
      ...overrides,
    },
  };
}

function makeWorkflow(overrides: Partial<OrgWorkflow> = {}): OrgWorkflow {
  return {
    id: WF_A,
    organizationId: ORG,
    name: 'Notification workflow',
    description: null,
    category: 'maintenance',
    trigger: { type: 'notification.opened' },
    conditions: [],
    actions: [{ type: 'task.create', config: { title: 'Follow-up task' } }],
    scope: { type: 'organization' },
    status: 'ACTIVE',
    enabled: true,
    version: 1,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdById: null,
    createdByName: null,
    updatedById: null,
    updatedByName: null,
    isTemplate: false,
    systemMetadata: null,
    shadowEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OrgWorkflow;
}

function makePrisma(workflows: OrgWorkflow[] = [makeWorkflow()]) {
  const runs = new Map<string, Record<string, unknown>>();
  const actionRuns = new Map<string, Record<string, unknown>>();

  const prisma = {
    orgWorkflow: {
      findMany: jest.fn(async ({ where }: { where: { organizationId: string } }) =>
        workflows.filter(
          (wf) => wf.organizationId === where.organizationId && wf.status === 'ACTIVE' && wf.enabled,
        ),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    orgWorkflowRun: {
      findUnique: jest.fn(async ({ where }: { where: { organizationId_idempotencyKey: { organizationId: string; idempotencyKey: string } } }) => {
        const key = `${where.organizationId_idempotencyKey.organizationId}:${where.organizationId_idempotencyKey.idempotencyKey}`;
        const row = runs.get(key);
        if (!row) return null;
        const relatedActions = [...actionRuns.values()].filter(
          (ar) => ar.workflowRunId === row.id,
        );
        return { ...row, actionRuns: relatedActions };
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `run-${runs.size + 1}`,
          status: data.status ?? 'RUNNING',
          actionRuns: [],
          ...data,
        };
        runs.set(`${data.organizationId}:${data.idempotencyKey}`, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = [...runs.values()].find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
    },
    orgWorkflowActionRun: {
      findUnique: jest.fn(async ({ where }: { where: { organizationId_idempotencyKey: { organizationId: string; idempotencyKey: string } } }) => {
        const key = `${where.organizationId_idempotencyKey.organizationId}:${where.organizationId_idempotencyKey.idempotencyKey}`;
        return actionRuns.get(key) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `ar-${actionRuns.size + 1}`,
          status: data.status ?? 'RUNNING',
          ...data,
        };
        actionRuns.set(`${data.organizationId}:${data.idempotencyKey}`, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = [...actionRuns.values()].find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
    },
    orgWorkflowApproval: { create: jest.fn() },
    vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }), update: jest.fn() },
    booking: { findFirst: jest.fn() },
    _runs: runs,
    _actionRuns: actionRuns,
  };

  return prisma;
}

function makeEngine(prisma: ReturnType<typeof makePrisma>) {
  const upsertByDedup = jest.fn().mockResolvedValue({ id: 'task-1' });
  const findActiveByDedup = jest.fn().mockResolvedValue(null);
  const rollout = makeRolloutServiceMock();
  const config = { get: jest.fn().mockReturnValue(20) } as unknown as ConfigService;
  const shadowGate = {
    resolve: jest.fn().mockResolvedValue({ runShadow: false, runLive: true, legacyCompare: false, orgShadowEnabled: false }),
    isOrgShadowEnabled: jest.fn().mockResolvedValue(false),
  };
  const shadowService = { scheduleShadowEvaluation: jest.fn() };

  const engine = new WorkflowEngineService(
    prisma as never,
    new WorkflowActionExecutorService(
      prisma as never,
      { upsertByDedup, findActiveByDedup } as unknown as TasksService,
      rollout as never,
    ),
    shadowGate as never,
    shadowService as never,
    rollout as never,
    config,
  );

  return { engine, upsertByDedup, findActiveByDedup, prisma };
}

describe('workflow-notification-idempotency', () => {
  describe('key builders', () => {
    it('builds stable notification run and action keys', () => {
      const event = notificationEvent();
      const ctx = extractNotificationWorkflowContext(event)!;

      expect(resolveWorkflowRunIdempotencyKey(event, WF_A)).toBe(
        buildNotificationWorkflowRunIdempotencyKey({
          organizationId: ORG,
          workflowId: WF_A,
          triggerEventId: TRIGGER_OPEN,
        }),
      );

      expect(
        buildNotificationActionIdempotencyKey({
          organizationId: ORG,
          workflowId: WF_A,
          notificationId: ctx.notificationId,
          notificationGeneration: ctx.notificationGeneration,
          actionDefinitionId: 'task.create:0',
        }),
      ).toBe(`notification-action:${ORG}:${WF_A}:${NOTIF}:gen:1:action:task.create:0`);
    });
  });

  describe('duplicate trigger', () => {
    it('does not create a second workflow run or task on duplicate lifecycle event', async () => {
      const prisma = makePrisma();
      const { engine, upsertByDedup } = makeEngine(prisma);
      const wf = makeWorkflow();
      const event = notificationEvent();

      const first = await engine.executeWorkflow(wf, event, { executionMode: WorkflowExecutionMode.LIVE });
      upsertByDedup.mockClear();
      prisma.orgWorkflowRun.create.mockClear();
      prisma.orgWorkflowActionRun.create.mockClear();

      const second = await engine.executeWorkflow(wf, event, { executionMode: WorkflowExecutionMode.LIVE });

      expect(first).toBe(second);
      expect(prisma.orgWorkflowRun.create).not.toHaveBeenCalled();
      expect(prisma.orgWorkflowActionRun.create).not.toHaveBeenCalled();
      expect(upsertByDedup).not.toHaveBeenCalled();
    });
  });

  describe('worker retry after process abort', () => {
    it('resumes failed run without creating duplicate action run or task', async () => {
      const prisma = makePrisma();
      const { engine, upsertByDedup } = makeEngine(prisma);
      const wf = makeWorkflow();
      const event = notificationEvent();
      const runKey = resolveWorkflowRunIdempotencyKey(event, WF_A);

      prisma._runs.set(`${ORG}:${runKey}`, {
        id: 'run-1',
        organizationId: ORG,
        idempotencyKey: runKey,
        status: 'FAILED',
        workflowId: WF_A,
      });

      const actionKey = buildNotificationActionIdempotencyKey({
        organizationId: ORG,
        workflowId: WF_A,
        notificationId: NOTIF,
        notificationGeneration: 1,
        actionDefinitionId: 'task.create:0',
      });
      prisma._actionRuns.set(`${ORG}:${actionKey}`, {
        id: 'ar-1',
        organizationId: ORG,
        workflowRunId: 'run-1',
        workflowId: WF_A,
        actionIndex: 0,
        actionDefinitionId: 'task.create:0',
        idempotencyKey: actionKey,
        status: 'FAILED',
      });

      await engine.executeWorkflow(wf, event, { executionMode: WorkflowExecutionMode.LIVE });

      expect(prisma.orgWorkflowRun.create).not.toHaveBeenCalled();
      expect(prisma.orgWorkflowActionRun.create).not.toHaveBeenCalled();
      expect(upsertByDedup).toHaveBeenCalledTimes(1);
    });
  });

  describe('parallel workers', () => {
    it('unique constraint race returns single action run', async () => {
      const prisma = makePrisma();
      const { engine } = makeEngine(prisma);
      const wf = makeWorkflow();
      const event = notificationEvent();

      const actionKey = buildNotificationActionIdempotencyKey({
        organizationId: ORG,
        workflowId: WF_A,
        notificationId: NOTIF,
        notificationGeneration: 1,
        actionDefinitionId: 'task.create:0',
      });

      prisma.orgWorkflowActionRun.create.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => {
        prisma._actionRuns.set(`${data.organizationId}:${data.idempotencyKey}`, {
          id: 'ar-existing',
          status: 'RUNNING',
          ...data,
        });
        const err = new Error('unique') as Error & { code: string };
        err.code = 'P2002';
        throw err;
      });

      const runId = await engine.executeWorkflow(wf, event, { executionMode: WorkflowExecutionMode.LIVE });
      expect(runId).toBeTruthy();
      expect(prisma.orgWorkflowActionRun.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_idempotencyKey: {
              organizationId: ORG,
              idempotencyKey: actionKey,
            },
          },
        }),
      );
    });
  });

  describe('reopen new generation', () => {
    it('allows new action when notification generation changes', async () => {
      const prisma = makePrisma();
      const { engine, upsertByDedup } = makeEngine(prisma);
      const wf = makeWorkflow();

      await engine.executeWorkflow(wf, notificationEvent(), {
        executionMode: WorkflowExecutionMode.LIVE,
      });
      upsertByDedup.mockClear();

      const reopened = notificationEvent({
        lifecycleGeneration: 2,
        triggerEventId: 'notification.opened:notif-1:gen:2',
      });
      reopened.idempotencyKey = 'notification.opened:notif-1:gen:2';

      await engine.executeWorkflow(wf, reopened, { executionMode: WorkflowExecutionMode.LIVE });

      expect(upsertByDedup).toHaveBeenCalledTimes(1);
      const dedupKey = upsertByDedup.mock.calls[0][1];
      expect(dedupKey).toContain(':gen:2:');
    });
  });

  describe('two workflow definitions', () => {
    it('runs separate actions per workflow definition for same notification generation', async () => {
      const wfA = makeWorkflow({ id: WF_A });
      const wfB = makeWorkflow({ id: WF_B, name: 'Second workflow' });
      const prisma = makePrisma([wfA, wfB]);
      const { engine, upsertByDedup } = makeEngine(prisma);
      const event = notificationEvent();

      await engine.processEvent(event);

      expect(upsertByDedup).toHaveBeenCalledTimes(2);
      const keys = upsertByDedup.mock.calls.map((call) => call[1] as string);
      expect(keys[0]).toContain(`:${WF_A}:`);
      expect(keys[1]).toContain(`:${WF_B}:`);
      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  describe('idempotent task replay', () => {
    it('reuses existing task on retry without second upsert write', async () => {
      const prisma = makePrisma();
      const { engine, upsertByDedup, findActiveByDedup } = makeEngine(prisma);
      const wf = makeWorkflow();
      const event = notificationEvent();
      const actionKey = buildNotificationActionIdempotencyKey({
        organizationId: ORG,
        workflowId: WF_A,
        notificationId: NOTIF,
        notificationGeneration: 1,
        actionDefinitionId: 'task.create:0',
      });

      findActiveByDedup.mockResolvedValue({ id: 'task-existing' });

      const runKey = resolveWorkflowRunIdempotencyKey(event, WF_A);
      prisma._runs.set(`${ORG}:${runKey}`, {
        id: 'run-1',
        organizationId: ORG,
        idempotencyKey: runKey,
        status: 'FAILED',
        workflowId: WF_A,
      });
      prisma._actionRuns.set(`${ORG}:${actionKey}`, {
        id: 'ar-1',
        organizationId: ORG,
        workflowRunId: 'run-1',
        workflowId: WF_A,
        actionIndex: 0,
        actionDefinitionId: 'task.create:0',
        idempotencyKey: actionKey,
        status: 'FAILED',
      });

      await engine.executeWorkflow(wf, event, { executionMode: WorkflowExecutionMode.LIVE });

      expect(upsertByDedup).not.toHaveBeenCalled();
      expect(findActiveByDedup).toHaveBeenCalledWith(ORG, actionKey);
    });
  });
});
