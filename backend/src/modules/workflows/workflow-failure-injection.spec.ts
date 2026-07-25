import { OrgWorkflow } from '@prisma/client';
import { WorkflowDryRunService } from './workflow-dry-run.service';
import { WorkflowActionPreviewService } from './workflow-action-preview.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowExecutionMode } from './workflow-execution-mode';

const ORG_A = 'org-failure-a';

function makePrisma() {
  return {
    orgWorkflow: { findFirst: jest.fn() },
    orgWorkflowRun: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    orgWorkflowActionRun: { create: jest.fn(), update: jest.fn() },
    orgWorkflowApproval: { create: jest.fn() },
    vehicle: { findFirst: jest.fn(), update: jest.fn() },
  } as any;
}

function makeWorkflow(overrides: Partial<OrgWorkflow> = {}): OrgWorkflow {
  return {
    id: 'wf-fail',
    organizationId: ORG_A,
    name: 'Failure test',
    description: null,
    category: 'maintenance',
    trigger: { type: 'manual.test' },
    conditions: [],
    actions: [],
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OrgWorkflow;
}

describe('Workflow failure injection', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let dryRun: WorkflowDryRunService;

  beforeEach(() => {
    prisma = makePrisma();
    dryRun = new WorkflowDryRunService(prisma, new WorkflowActionPreviewService(prisma));
  });

  it('unknown action surfaces ERROR in dry-run without side effects', async () => {
    const wf = makeWorkflow({
      actions: [{ type: 'channel.email.send' as 'task.create', config: {} }],
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(wf);

    const plan = await dryRun.buildExecutionPlan(ORG_A, wf.id, {});

    expect(plan.executed).toBe(false);
    expect(plan.plannedActions[0].status).toBe('ERROR');
    expect(prisma.orgWorkflowRun.create).not.toHaveBeenCalled();
  });

  it('action executor returns FAILED status on task service error', async () => {
    const tasksService = {
      upsertByDedup: jest.fn().mockRejectedValue(new Error('DB timeout')),
    };
    const executor = new WorkflowActionExecutorService(prisma, tasksService as any);

    const result = await executor.execute(
      { type: 'task.create', config: { title: 'Fail task' } },
      {
        organizationId: ORG_A,
        workflowId: 'wf-1',
        workflowRunId: 'run-1',
        actionRunId: 'ar-1',
        actionIndex: 0,
        eventType: 'manual.test',
        payload: {},
        idempotencyKey: 'fail-key',
        executionMode: WorkflowExecutionMode.LIVE,
      },
    );

    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toContain('DB timeout');
  });

  it('vehicle status action fails cleanly on invalid status (fallback path)', async () => {
    const tasksService = { upsertByDedup: jest.fn() };
    const executor = new WorkflowActionExecutorService(prisma, tasksService as any);

    const result = await executor.execute(
      { type: 'vehicle.status.update', config: { status: 'NOT_A_STATUS' } },
      {
        organizationId: ORG_A,
        workflowId: 'wf-1',
        workflowRunId: 'run-1',
        actionRunId: 'ar-1',
        actionIndex: 0,
        eventType: 'manual.test',
        payload: { vehicleId: 'veh-1' },
        idempotencyKey: 'veh-fail',
        executionMode: WorkflowExecutionMode.LIVE,
      },
    );

    expect(result.status).toBe('FAILED');
  });

  it('approval action documents expected fallback pause message', async () => {
    const wf = makeWorkflow({
      actions: [{ type: 'workflow.approval.request', config: { message: 'Manual gate' } }],
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(wf);

    const plan = await dryRun.buildExecutionPlan(ORG_A, wf.id, {});

    expect(plan.plannedActions[0].expectedFallback).toContain('pauses');
    expect(plan.plannedActions[0].policyBlockers).toContain(
      'Human approval required before execution',
    );
  });

  it('rejects LIVE execution without LIVE mode on executor guard', async () => {
    const tasksService = { upsertByDedup: jest.fn() };
    const executor = new WorkflowActionExecutorService(prisma, tasksService as any);

    await expect(
      executor.execute(
        { type: 'task.create', config: { title: 'Guarded' } },
        {
          organizationId: ORG_A,
          workflowId: 'wf-1',
          workflowRunId: 'run-1',
          actionRunId: 'ar-1',
          actionIndex: 0,
          eventType: 'manual.test',
          payload: {},
          idempotencyKey: 'guard-key',
          executionMode: WorkflowExecutionMode.DRY_RUN,
        },
      ),
    ).rejects.toThrow(/side effects are only permitted in LIVE execution mode/);
  });

  it('policy blockers accumulate when scope fails in dry-run', async () => {
    const wf = makeWorkflow({
      scope: { type: 'station', stationIds: [] },
      actions: [{ type: 'task.create', config: { title: 'Blocked' } }],
    });
    prisma.orgWorkflow.findFirst.mockResolvedValue(wf);

    const plan = await dryRun.buildExecutionPlan(ORG_A, wf.id, {
      payload: { stationId: 'st-1' },
    });

    expect(plan.policyBlockers.length).toBeGreaterThan(0);
    expect(plan.executed).toBe(false);
  });
});
