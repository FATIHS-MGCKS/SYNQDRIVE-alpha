import { OrgWorkflow } from '@prisma/client';
import { TasksService } from '@modules/tasks/tasks.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowExecutionMode } from './workflow-execution-mode';
import { makeRolloutServiceMock } from './rollout/workflow-runtime-rollout.test-util';
import { ConfigService } from '@nestjs/config';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function makeWorkflow(overrides: Partial<OrgWorkflow> = {}): OrgWorkflow {
  return {
    id: 'wf-1',
    organizationId: ORG_A,
    name: 'Matcher workflow',
    description: null,
    category: 'maintenance',
    trigger: { type: 'manual.test' },
    conditions: [],
    actions: [{ type: 'task.create', config: { title: 'From matcher' } }],
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OrgWorkflow;
}

function makePrisma() {
  const runs = new Map<string, unknown>();
  return {
    orgWorkflow: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    orgWorkflowRun: {
      findUnique: jest.fn(async ({
        where,
      }: {
        where: { organizationId_idempotencyKey: { organizationId: string; idempotencyKey: string } };
      }) => {
        const key = `${where.organizationId_idempotencyKey.organizationId}:${where.organizationId_idempotencyKey.idempotencyKey}`;
        return runs.get(key) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const idempotencyKey = data.idempotencyKey as string;
        const orgId = data.organizationId as string;
        const row = { id: `run-${runs.size + 1}`, ...data };
        runs.set(`${orgId}:${idempotencyKey}`, row);
        return row;
      }),
      update: jest.fn(),
    },
    orgWorkflowActionRun: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `ar-${data.actionIndex}`,
        ...data,
      })),
      update: jest.fn(),
    },
    orgWorkflowApproval: {
      create: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    _runs: runs,
  } as any;
}

function makeShadowDeps() {
  return {
    shadowGate: {
      resolve: jest.fn().mockResolvedValue({
        runShadow: false,
        runLive: true,
        legacyCompare: false,
        orgShadowEnabled: false,
      }),
      isOrgShadowEnabled: jest.fn().mockResolvedValue(false),
    },
    shadowService: {
      scheduleShadowEvaluation: jest.fn(),
    },
  };
}

function makeEngine(
  prisma: ReturnType<typeof makePrisma>,
  upsertByDedup: jest.Mock = jest.fn().mockResolvedValue({ id: 'task-1' }),
) {
  const shadow = makeShadowDeps();
  const rollout = makeRolloutServiceMock();
  const config = { get: jest.fn().mockReturnValue(20) } as unknown as ConfigService;
  const engine = new WorkflowEngineService(
    prisma,
    new WorkflowActionExecutorService(prisma, { upsertByDedup } as unknown as TasksService, rollout as never),
    shadow.shadowGate as never,
    shadow.shadowService as never,
    rollout as never,
    config,
  );
  return { engine, shadow, rollout };
}

describe('WorkflowEngineService production scenarios', () => {
  describe('matcher (scenario 9)', () => {
    it('matches only ACTIVE enabled workflows with same normalized trigger', async () => {
      const prisma = makePrisma();
      const { engine } = makeEngine(prisma);

      prisma.orgWorkflow.findMany.mockResolvedValue([
        makeWorkflow({ id: 'wf-match', trigger: { type: 'manual.test' } }),
      ]);

      const matched = await engine.findMatchingWorkflows({
        organizationId: ORG_A,
        type: 'manual.test',
        payload: {},
      });

      expect(matched.map((wf) => wf.id)).toEqual(['wf-match']);
    });

    it('isolates tenants in findMany query', async () => {
      const prisma = makePrisma();
      const { engine } = makeEngine(prisma);
      prisma.orgWorkflow.findMany.mockResolvedValue([]);

      await engine.findMatchingWorkflows({
        organizationId: ORG_B,
        type: 'manual.test',
        payload: {},
      });

      expect(prisma.orgWorkflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_B }),
        }),
      );
    });
  });

  describe('idempotency (scenario 14)', () => {
    it('returns existing run id on duplicate idempotency key without second task write', async () => {
      const prisma = makePrisma();
      const upsertByDedup = jest.fn().mockResolvedValue({ id: 'task-1' });
      const { engine } = makeEngine(prisma, upsertByDedup);
      const wf = makeWorkflow();
      prisma.orgWorkflowActionRun.create.mockResolvedValue({ id: 'ar-0' });
      prisma.orgWorkflowActionRun.update.mockResolvedValue({});
      prisma.orgWorkflowRun.update.mockResolvedValue({});
      prisma.orgWorkflow.update.mockResolvedValue(wf);

      const event = {
        organizationId: ORG_A,
        type: 'manual.test',
        payload: {},
        idempotencyKey: 'evt:dup',
      };

      const first = await engine.executeWorkflow(wf, event, {
        executionMode: WorkflowExecutionMode.LIVE,
      });
      expect(first).toBe('run-1');

      prisma.orgWorkflowRun.create.mockClear();
      upsertByDedup.mockClear();

      const second = await engine.executeWorkflow(wf, event, {
        executionMode: WorkflowExecutionMode.LIVE,
      });
      expect(second).toBe('run-1');
      expect(prisma.orgWorkflowRun.create).not.toHaveBeenCalled();
      expect(upsertByDedup).not.toHaveBeenCalled();
    });
  });

  describe('approval pause (scenario 16)', () => {
    it('stops run at WAITING_APPROVAL without executing subsequent actions', async () => {
      const prisma = makePrisma();
      const upsertByDedup = jest.fn().mockResolvedValue({ id: 'task-1' });
      const { engine } = makeEngine(prisma, upsertByDedup);
      const wf = makeWorkflow({
        actions: [
          { type: 'workflow.approval.request', config: { message: 'Approve' } },
          { type: 'task.create', config: { title: 'Should not run' } },
        ],
      });

      prisma.orgWorkflowRun.create.mockResolvedValue({ id: 'run-approval' });
      prisma.orgWorkflowActionRun.create.mockImplementation(async ({ data }: { data: { actionIndex: number } }) => ({
        id: `ar-${data.actionIndex}`,
      }));
      prisma.orgWorkflowActionRun.update.mockResolvedValue({});
      prisma.orgWorkflowRun.update.mockResolvedValue({});
      prisma.orgWorkflow.update.mockResolvedValue(wf);
      prisma.orgWorkflowApproval.create.mockResolvedValue({ id: 'approval-1' });

      await engine.executeWorkflow(
        wf,
        { organizationId: ORG_A, type: 'manual.test', payload: {} },
        { executionMode: WorkflowExecutionMode.LIVE },
      );

      expect(prisma.orgWorkflowApproval.create).toHaveBeenCalled();
      expect(upsertByDedup).not.toHaveBeenCalled();
      expect(prisma.orgWorkflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'WAITING_APPROVAL' }),
        }),
      );
    });
  });

  describe('partial failure (scenario 20)', () => {
    it('marks run FAILED and stops after first failing action', async () => {
      const prisma = makePrisma();
      const upsertByDedup = jest
        .fn()
        .mockResolvedValueOnce({ id: 'task-ok' })
        .mockRejectedValueOnce(new Error('simulated failure'));
      const { engine } = makeEngine(prisma, upsertByDedup);
      const wf = makeWorkflow({
        actions: [
          { type: 'task.create', config: { title: 'First' } },
          { type: 'task.create', config: { title: 'Second' } },
        ],
      });

      prisma.orgWorkflowRun.create.mockResolvedValue({ id: 'run-partial' });
      prisma.orgWorkflowActionRun.create.mockImplementation(async ({ data }: { data: { actionIndex: number } }) => ({
        id: `ar-${data.actionIndex}`,
      }));
      prisma.orgWorkflowActionRun.update.mockResolvedValue({});
      prisma.orgWorkflowRun.update.mockResolvedValue({});
      prisma.orgWorkflow.update.mockResolvedValue(wf);

      await engine.executeWorkflow(
        wf,
        { organizationId: ORG_A, type: 'manual.test', payload: {} },
        { executionMode: WorkflowExecutionMode.LIVE },
      );

      expect(upsertByDedup).toHaveBeenCalledTimes(2);
      expect(prisma.orgWorkflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });

  describe('cancellation via scope/conditions (scenario 37)', () => {
    it('does not create a run when scope fails closed', async () => {
      const prisma = makePrisma();
      const { engine } = makeEngine(prisma);
      const wf = makeWorkflow({
        scope: { type: 'vehicle', vehicleIds: ['v-allowed'] },
      });

      const runId = await engine.executeWorkflow(
        wf,
        { organizationId: ORG_A, type: 'manual.test', payload: { vehicleId: 'v-other' } },
        { executionMode: WorkflowExecutionMode.LIVE },
      );

      expect(runId).toBeNull();
      expect(prisma.orgWorkflowRun.create).not.toHaveBeenCalled();
    });

    it('creates SKIPPED run when conditions fail', async () => {
      const prisma = makePrisma();
      const { engine } = makeEngine(prisma);
      const wf = makeWorkflow({
        conditions: [{ field: 'health_score', operator: 'gt', value: 90 }],
      });

      prisma.orgWorkflowRun.create.mockResolvedValue({ id: 'run-skipped' });
      prisma.orgWorkflowRun.update.mockResolvedValue({});

      const runId = await engine.executeWorkflow(
        wf,
        { organizationId: ORG_A, type: 'manual.test', payload: { healthScore: 10 } },
        { executionMode: WorkflowExecutionMode.LIVE },
      );

      expect(runId).toBe('run-skipped');
      expect(prisma.orgWorkflowRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SKIPPED' }),
        }),
      );
    });
  });
});
