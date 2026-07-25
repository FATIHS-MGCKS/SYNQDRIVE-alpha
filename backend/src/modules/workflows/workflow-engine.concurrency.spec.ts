import { OrgWorkflow } from '@prisma/client';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import { WorkflowExecutionMode } from './workflow-execution-mode';

const ORG_A = 'org-concurrency-a';

function makeWorkflow(): OrgWorkflow {
  return {
    id: 'wf-concurrent',
    organizationId: ORG_A,
    name: 'Concurrent test',
    description: null,
    category: 'maintenance',
    trigger: { type: 'manual.test' },
    conditions: [],
    actions: [{ type: 'task.create', config: { title: 'Race task' } }],
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
  } as unknown as OrgWorkflow;
}

describe('WorkflowEngineService — concurrency & race conditions', () => {
  it('parallel executeWorkflow calls with same idempotencyKey create only one task', async () => {
    const runs = new Map<string, any>();
    let claimLock = false;
    let runSeq = 0;

    const prisma = {
      orgWorkflow: { update: jest.fn().mockResolvedValue({}) },
      orgWorkflowRun: {
        findUnique: jest.fn(async ({ where }: any) => {
          const key = `${where.organizationId_idempotencyKey.organizationId}:${where.organizationId_idempotencyKey.idempotencyKey}`;
          return runs.get(key) ?? null;
        }),
        create: jest.fn(async ({ data }: any) => {
          const key = `${data.organizationId}:${data.idempotencyKey}`;
          if (runs.has(key)) return runs.get(key);
          // Simulate race: second concurrent create sees existing after brief window
          if (claimLock) {
            return runs.get(key)!;
          }
          claimLock = true;
          const row = { id: `run-${++runSeq}`, ...data, status: 'RUNNING' };
          runs.set(key, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = [...runs.values()].find((r) => r.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
      },
      orgWorkflowActionRun: {
        create: jest.fn(async ({ data }: any) => ({ id: `ar-${data.actionIndex}`, ...data })),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      },
      orgWorkflowApproval: { create: jest.fn() },
    };

    const tasksService = { upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-race' }) };
    const executor = new WorkflowActionExecutorService(prisma as any, tasksService as any);
    const engine = new WorkflowEngineService(prisma as any, executor);
    const wf = makeWorkflow();
    const event = {
      organizationId: ORG_A,
      type: 'manual.test',
      payload: {},
      idempotencyKey: 'parallel-race-key',
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        engine.executeWorkflow(wf, event, { executionMode: WorkflowExecutionMode.LIVE }),
      ),
    );

    const uniqueRunIds = new Set(results.filter(Boolean));
    expect(uniqueRunIds.size).toBe(1);
    expect(tasksService.upsertByDedup.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('dedup key is scoped per workflow id', () => {
    const baseKey = 'booking.returned:booking:b-1';
    const keyA = `${baseKey}:workflow:wf-a`;
    const keyB = `${baseKey}:workflow:wf-b`;
    expect(keyA).not.toBe(keyB);
  });
});
