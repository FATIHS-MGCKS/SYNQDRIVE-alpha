import { OrgWorkflow } from '@prisma/client';
import { WorkflowActionPreviewService } from './workflow-action-preview.service';
import { WorkflowDryRunService } from './workflow-dry-run.service';
import { WorkflowExecutionMode } from './workflow-execution-mode';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowTenantGuardService } from './workflow-tenant-guard.service';
import { TasksService } from '@modules/tasks/tasks.service';

const ORG_A = 'org-a';
const VEHICLE_A = 'vehicle-a';
const VEHICLE_B = 'vehicle-b';

function makeWorkflow(overrides: Partial<OrgWorkflow> = {}): OrgWorkflow {
  return {
    id: 'wf-1',
    organizationId: ORG_A,
    name: 'Test Workflow',
    description: null,
    category: 'maintenance',
    trigger: { type: 'manual.test' },
    conditions: [],
    actions: [],
    scope: { type: 'organization' },
    status: 'ACTIVE',
    enabled: true,
    version: 3,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdById: null,
    createdByName: null,
    updatedById: null,
    updatedByName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OrgWorkflow;
}

function makePrisma() {
  return {
    orgWorkflow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    orgWorkflowRun: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    orgWorkflowActionRun: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    orgWorkflowApproval: {
      create: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    station: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
  } as any;
}

function makeTenantGuard(prisma: ReturnType<typeof makePrisma>) {
  return new WorkflowTenantGuardService(prisma);
}

function makeDryRunStack(prisma: ReturnType<typeof makePrisma>) {
  const tenantGuard = makeTenantGuard(prisma);
  const preview = new WorkflowActionPreviewService(prisma, tenantGuard);
  const dryRun = new WorkflowDryRunService(prisma, preview, tenantGuard);
  return { tenantGuard, preview, dryRun };
}

describe('WorkflowDryRunService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let dryRun: WorkflowDryRunService;

  beforeEach(() => {
    prisma = makePrisma();
    ({ dryRun } = makeDryRunStack(prisma));
  });

  it('task.create produces a plan without creating a task', async () => {
    const wf = makeWorkflow({
      actions: [{ type: 'task.create', config: { title: 'Inspect brakes' } }],
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(wf);

    const plan = await dryRun.buildExecutionPlan(ORG_A, wf.id, {});

    expect(plan.executed).toBe(false);
    expect(plan.executionMode).toBe(WorkflowExecutionMode.DRY_RUN);
    expect(plan.plannedActions).toHaveLength(1);
    expect(plan.plannedActions[0].actionType).toBe('task.create');
    expect(prisma.orgWorkflowRun.create).not.toHaveBeenCalled();
  });

  it('vehicle.status.update previews without mutating the vehicle', async () => {
    const wf = makeWorkflow({
      actions: [{ type: 'vehicle.status.update', config: { status: 'OUT_OF_SERVICE' } }],
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(wf);
    prisma.vehicle.findFirst.mockResolvedValue({
      id: VEHICLE_A,
      status: 'AVAILABLE',
    });

    const plan = await dryRun.buildExecutionPlan(ORG_A, wf.id, {
      payload: { vehicleId: VEHICLE_A },
    });

    expect(plan.plannedActions[0].preview?.wouldUpdateTo).toBe('OUT_OF_SERVICE');
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('does not enqueue workflow runs or approvals', async () => {
    const wf = makeWorkflow({
      actions: [
        { type: 'task.create', config: { title: 'A' } },
        { type: 'workflow.approval.request', config: { message: 'Approve' } },
      ],
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(wf);

    await dryRun.buildExecutionPlan(ORG_A, wf.id, {});

    expect(prisma.orgWorkflowRun.create).not.toHaveBeenCalled();
    expect(prisma.orgWorkflowActionRun.create).not.toHaveBeenCalled();
    expect(prisma.orgWorkflowApproval.create).not.toHaveBeenCalled();
  });

  it('flags unknown actions as errors in dry run', async () => {
    const wf = makeWorkflow({
      actions: [{ type: 'channel.email.send', config: {} }],
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(wf);

    const plan = await dryRun.buildExecutionPlan(ORG_A, wf.id, {});

    expect(plan.plannedActions[0].status).toBe('ERROR');
    expect(plan.plannedActions[0].validationErrors[0]).toContain('Unknown or unsupported');
  });

  it('dry run with foreign vehicle skips actions with tenant validation error', async () => {
    const wf = makeWorkflow({
      actions: [{ type: 'vehicle.status.update', config: { status: 'IN_SERVICE' } }],
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(wf);
    prisma.vehicle.findFirst.mockResolvedValue(null);

    const plan = await dryRun.buildExecutionPlan(ORG_A, wf.id, {
      payload: { vehicleId: VEHICLE_B },
    });

    expect(plan.plannedActions).toHaveLength(0);
    expect(plan.skippedActions).toHaveLength(1);
    expect(plan.validationErrors[0]).toContain('not available in this organization');
    expect(plan.validationErrors[0]).not.toContain(VEHICLE_B);
  });

  it('returns not found for foreign workflow id without leaking org details', async () => {
    prisma.orgWorkflow.findFirst.mockResolvedValue(null);
    await expect(dryRun.buildExecutionPlan(ORG_A, 'wf-foreign', {})).rejects.toThrow(
      'Workflow not found',
    );
  });
});

describe('WorkflowActionExecutorService live guard', () => {
  it('refuses execution without LIVE mode', async () => {
    const prisma = makePrisma();
    const tenantGuard = makeTenantGuard(prisma);
    const tasksService = { upsertByDedup: jest.fn() } as unknown as TasksService;
    const executor = new WorkflowActionExecutorService(prisma, tasksService, tenantGuard);

    await expect(
      executor.execute(
        { type: 'task.create', config: { title: 'Live task' } },
        {
          organizationId: ORG_A,
          workflowId: 'wf-1',
          workflowRunId: 'run-1',
          actionRunId: 'ar-1',
          actionIndex: 0,
          eventType: 'manual.test',
          payload: {},
          idempotencyKey: 'key',
          executionMode: WorkflowExecutionMode.DRY_RUN,
        },
      ),
    ).rejects.toThrow(/side effects are only permitted in LIVE/);
  });
});

describe('WorkflowEngineService LIVE mode', () => {
  it('executes supported actions when LIVE mode is explicit', async () => {
    const prisma = makePrisma();
    const tenantGuard = makeTenantGuard(prisma);
    const tasksService = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
    } as unknown as TasksService;
    const actionExecutor = new WorkflowActionExecutorService(prisma, tasksService, tenantGuard);
    const engine = new WorkflowEngineService(prisma, actionExecutor, tenantGuard);

    const wf = makeWorkflow({
      actions: [{ type: 'task.create', config: { title: 'Live task' } }],
    });

    prisma.orgWorkflowRun.findUnique.mockResolvedValue(null);
    prisma.orgWorkflowRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.orgWorkflowActionRun.create.mockResolvedValue({ id: 'ar-1' });
    prisma.orgWorkflowActionRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.orgWorkflowRun.updateMany.mockResolvedValue({ count: 1 });
    prisma.orgWorkflow.updateMany.mockResolvedValue({ count: 1 });

    const runId = await engine.executeWorkflow(
      wf,
      {
        organizationId: ORG_A,
        type: 'manual.test',
        payload: {},
        idempotencyKey: 'live:test',
      },
      { executionMode: WorkflowExecutionMode.LIVE },
    );

    expect(runId).toBe('run-1');
    expect(tasksService.upsertByDedup).toHaveBeenCalled();
    expect(prisma.orgWorkflowRun.create).toHaveBeenCalled();
  });

  it('rejects executeWorkflow without LIVE mode', async () => {
    const prisma = makePrisma();
    const tenantGuard = makeTenantGuard(prisma);
    const actionExecutor = new WorkflowActionExecutorService(
      prisma,
      { upsertByDedup: jest.fn() } as unknown as TasksService,
      tenantGuard,
    );
    const engine = new WorkflowEngineService(prisma, actionExecutor, tenantGuard);
    const wf = makeWorkflow({
      actions: [{ type: 'task.create', config: { title: 'Blocked' } }],
    });

    await expect(
      engine.executeWorkflow(
        wf,
        { organizationId: ORG_A, type: 'manual.test', payload: {} },
        { executionMode: WorkflowExecutionMode.DRY_RUN },
      ),
    ).rejects.toThrow(/side effects are only permitted in LIVE/);
  });
});
