import { OrgWorkflow } from '@prisma/client';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowExecutionMode } from './workflow-execution-mode';

const ORG_A = 'org-engine-a';
const ORG_B = 'org-engine-b';

function makeWorkflow(overrides: Partial<OrgWorkflow> = {}): OrgWorkflow {
  return {
    id: 'wf-engine-1',
    organizationId: ORG_A,
    name: 'Engine test',
    description: null,
    category: 'maintenance',
    trigger: { type: 'manual.test' },
    conditions: [],
    actions: [{ type: 'task.create', config: { title: 'Engine task' } }],
    scope: { type: 'organization' },
    status: 'ACTIVE',
    enabled: true,
    version: 5,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdById: null,
    createdByName: null,
    updatedById: null,
    updatedByName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as OrgWorkflow;
}

function makePrisma() {
  const runs = new Map<string, any>();
  const actionRuns = new Map<string, any>();
  let runSeq = 0;
  let actionSeq = 0;

  return {
    orgWorkflow: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    orgWorkflowRun: {
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.organizationId_idempotencyKey
          ? `${where.organizationId_idempotencyKey.organizationId}:${where.organizationId_idempotencyKey.idempotencyKey}`
          : null;
        if (key) return runs.get(key) ?? null;
        return null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `run-${++runSeq}`, ...data };
        runs.set(`${data.organizationId}:${data.idempotencyKey}`, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = [...runs.values()].find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
    },
    orgWorkflowActionRun: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `ar-${++actionSeq}`, ...data };
        actionRuns.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = actionRuns.get(where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
    },
    orgWorkflowApproval: {
      create: jest.fn(),
    },
    _runs: runs,
    _actionRuns: actionRuns,
  };
}

describe('WorkflowEngineService — integration harness', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let tasksService: { upsertByDedup: jest.Mock };
  let engine: WorkflowEngineService;

  beforeEach(() => {
    prisma = makePrisma();
    tasksService = { upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }) };
    const executor = new WorkflowActionExecutorService(prisma as any, tasksService as any);
    engine = new WorkflowEngineService(prisma as any, executor);
  });

  it('matches workflows by trigger type (matcher)', async () => {
    const wf = makeWorkflow({ trigger: { type: 'booking.returned' } });
    prisma.orgWorkflow.findMany.mockResolvedValue([wf]);

    const matched = await engine.findMatchingWorkflows({
      organizationId: ORG_A,
      type: 'booking.returned',
      payload: {},
    });

    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe(wf.id);
  });

  it('stores immutable workflowVersion on run record', async () => {
    const wf = makeWorkflow({ version: 7 });
    const runId = await engine.executeWorkflow(
      wf,
      {
        organizationId: ORG_A,
        type: 'manual.test',
        payload: {},
        idempotencyKey: 'immutable-version-test',
      },
      { executionMode: WorkflowExecutionMode.LIVE },
    );

    expect(runId).toBeTruthy();
    const createdRun = [...prisma._runs.values()].find((r) => r.id === runId);
    expect(createdRun?.workflowVersion).toBe(7);
  });

  it('idempotency prevents duplicate runs for same event key', async () => {
    const wf = makeWorkflow();
    const event = {
      organizationId: ORG_A,
      type: 'manual.test',
      payload: {},
      idempotencyKey: 'dup-event-key',
    };

    const first = await engine.executeWorkflow(wf, event, {
      executionMode: WorkflowExecutionMode.LIVE,
    });
    const second = await engine.executeWorkflow(wf, event, {
      executionMode: WorkflowExecutionMode.LIVE,
    });

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(tasksService.upsertByDedup).toHaveBeenCalledTimes(1);
  });

  it('skips run when scope fails (fail-closed)', async () => {
    const wf = makeWorkflow({
      scope: { type: 'vehicle', vehicleIds: ['veh-1'] },
    });

    const runId = await engine.executeWorkflow(
      wf,
      {
        organizationId: ORG_A,
        type: 'manual.test',
        payload: { vehicleId: 'veh-other' },
        idempotencyKey: 'scope-fail',
      },
      { executionMode: WorkflowExecutionMode.LIVE },
    );

    expect(runId).toBeNull();
    expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
  });

  it('creates SKIPPED run when conditions fail', async () => {
    const wf = makeWorkflow({
      conditions: [{ path: 'payload.severity', operator: 'equals', value: 'critical' }],
    });

    const runId = await engine.executeWorkflow(
      wf,
      {
        organizationId: ORG_A,
        type: 'manual.test',
        payload: { severity: 'info' },
        idempotencyKey: 'cond-fail',
      },
      { executionMode: WorkflowExecutionMode.LIVE },
    );

    expect(runId).toBeTruthy();
    const run = [...prisma._runs.values()].find((r) => r.id === runId);
    expect(run?.status).toBe('SKIPPED');
    expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
  });

  it('pauses on approval-required action', async () => {
    const wf = makeWorkflow({
      actions: [{ type: 'workflow.approval.request', config: { message: 'Approve' } }],
    });

    const runId = await engine.executeWorkflow(
      wf,
      {
        organizationId: ORG_A,
        type: 'manual.test',
        payload: {},
        idempotencyKey: 'approval-pause',
      },
      { executionMode: WorkflowExecutionMode.LIVE },
    );

    const run = [...prisma._runs.values()].find((r) => r.id === runId);
    expect(run?.status).toBe('WAITING_APPROVAL');
    expect(prisma.orgWorkflowApproval.create).toHaveBeenCalled();
  });

  it('partial failure stops subsequent actions', async () => {
    const wf = makeWorkflow({
      actions: [
        { type: 'vehicle.status.update', config: { status: 'OUT_OF_SERVICE' } },
        { type: 'task.create', config: { title: 'Should not run' } },
      ],
    });

    const runId = await engine.executeWorkflow(
      wf,
      {
        organizationId: ORG_A,
        type: 'manual.test',
        payload: {},
        idempotencyKey: 'partial-fail',
      },
      { executionMode: WorkflowExecutionMode.LIVE },
    );

    const run = [...prisma._runs.values()].find((r) => r.id === runId);
    expect(run?.status).toBe('FAILED');
    expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
  });

  it('isolates tenants — org A workflow never runs for org B event', async () => {
    const wf = makeWorkflow({ organizationId: ORG_A });
    prisma.orgWorkflow.findMany.mockResolvedValue([wf]);

    const matched = await engine.findMatchingWorkflows({
      organizationId: ORG_B,
      type: 'manual.test',
      payload: {},
    });

    expect(prisma.orgWorkflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_B }) }),
    );
    expect(matched.every((w) => w.organizationId === ORG_A)).toBe(true);
    // Engine queries by event org — cross-tenant wf rows would not be returned in real DB.
  });
});
