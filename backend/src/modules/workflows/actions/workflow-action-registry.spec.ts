import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import {
  createWorkflowActionPiiSafeLogger,
  WorkflowActionNoopSecretsResolver,
  WorkflowActionRegistryExecutorService,
  WorkflowActionRegistryService,
  WORKFLOW_ACTION_HANDLERS,
  type WorkflowActionExecutionContext,
  type WorkflowActionHandler,
  WorkflowActionRegistryError,
} from './index';
import { WORKFLOW_ACTION_HANDLER_PROVIDERS } from './workflow-action-handlers.provider';
import { BaseWorkflowActionHandler } from './handlers/base-workflow-action.handler';
import type { WorkflowActionExecuteResult } from './workflow-action-registry.types';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function baseContext(overrides: Partial<WorkflowActionExecutionContext> = {}): WorkflowActionExecutionContext {
  return {
    organizationId: ORG,
    workflowRunId: 'run-1',
    actionRunId: 'action-1',
    workflowId: 'wf-1',
    actionIndex: 0,
    idempotencyKey: 'idem-1',
    event: {
      eventType: 'booking.returned',
      entityType: 'booking',
      entityId: 'booking-1',
      payload: { bookingId: 'booking-1', vehicleId: 'veh-1' },
    },
    workflowSnapshot: {},
    policySnapshot: {},
    actor: { kind: 'system', permissions: ['WORKFLOW_EXECUTE'] },
    correlationId: 'corr-1',
    secretsResolver: new WorkflowActionNoopSecretsResolver(),
    logger: createWorkflowActionPiiSafeLogger('test'),
    ...overrides,
  };
}

class StubHandler extends BaseWorkflowActionHandler {
  executeCount = 0;
  readonly definition = this.buildDefinition({
    type: 'test.stub',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'LOW',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: { label: { type: 'string', required: true } },
    },
  });

  async execute(
    config: Record<string, unknown>,
    _ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    this.executeCount += 1;
    return { status: 'SUCCESS', output: { label: config.label } };
  }
}

describe('WorkflowActionRegistryService', () => {
  let registry: WorkflowActionRegistryService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...WORKFLOW_ACTION_HANDLER_PROVIDERS,
        {
          provide: WORKFLOW_ACTION_HANDLERS,
          useFactory: (...handlers: WorkflowActionHandler[]) => handlers,
          inject: [...WORKFLOW_ACTION_HANDLER_PROVIDERS],
        },
        WorkflowActionRegistryService,
        { provide: PrismaService, useValue: { vehicle: { findFirst: jest.fn(), update: jest.fn() }, orgWorkflowApproval: { create: jest.fn() } } },
        {
          provide: TasksService,
          useValue: { upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }) },
        },
      ],
    }).compile();

    registry = module.get(WorkflowActionRegistryService);
    registry.onModuleInit();
  });

  it('registers built-in handlers', () => {
    expect(registry.has('task.create')).toBe(true);
    expect(registry.listTypes()).toContain('alert.create');
  });

  it('rejects unknown handler', () => {
    expect(() => registry.resolve('unknown.action')).toThrow(WorkflowActionRegistryError);
  });

  it('rejects duplicate registration', () => {
    const stub = new StubHandler();
    registry.register(stub);
    expect(() => registry.register(stub)).toThrow(WorkflowActionRegistryError);
  });
});

describe('WorkflowActionRegistryExecutorService', () => {
  let executor: WorkflowActionRegistryExecutorService;
  let tasksService: { upsertByDedup: jest.Mock };

  beforeEach(async () => {
    tasksService = { upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-99' }) };
    const module = await Test.createTestingModule({
      providers: [
        ...WORKFLOW_ACTION_HANDLER_PROVIDERS,
        {
          provide: WORKFLOW_ACTION_HANDLERS,
          useFactory: (...handlers: WorkflowActionHandler[]) => handlers,
          inject: [...WORKFLOW_ACTION_HANDLER_PROVIDERS],
        },
        WorkflowActionRegistryService,
        WorkflowActionRegistryExecutorService,
        WorkflowActionNoopSecretsResolver,
        { provide: PrismaService, useValue: { vehicle: { findFirst: jest.fn(), update: jest.fn() }, orgWorkflowApproval: { create: jest.fn() } } },
        { provide: TasksService, useValue: tasksService },
      ],
    }).compile();

    const registry = module.get(WorkflowActionRegistryService);
    registry.onModuleInit();
    executor = module.get(WorkflowActionRegistryExecutorService);
  });

  it('validates config', () => {
    const result = executor.validateConfig('task.create', {}, baseContext());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('title'))).toBe(true);
  });

  it('preview is side-effect free', async () => {
    const preview = await executor.preview(
      'task.create',
      { title: 'Check vehicle' },
      baseContext(),
    );
    expect(preview.sideEffectFree).toBe(true);
    expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
  });

  it('enforces permission on execute', async () => {
    const result = await executor.execute(
      'vehicle.status.update',
      { status: 'MAINTENANCE' },
      baseContext({ actor: { kind: 'user', permissions: ['WORKFLOW_EXECUTE'] } }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorCategory).toBe('AUTHORIZATION');
  });

  it('rejects risk class downgrade', async () => {
    await expect(
      executor.preview(
        'ai.suggest_action',
        { summary: 'test' },
        baseContext({
          clientRiskClass: 'LOW',
          actor: { kind: 'system', permissions: ['WORKFLOW_AI_SUGGEST'] },
        }),
      ),
    ).rejects.toMatchObject({ code: 'RISK_DOWNGRADE' });
  });

  it('execute is idempotent via task upsert dedup key', async () => {
    const ctx = baseContext({
      actor: { kind: 'system', permissions: ['WORKFLOW_EXECUTE'] },
    });
    await executor.execute('task.create', { title: 'A' }, ctx);
    await executor.execute('task.create', { title: 'A' }, ctx);
    expect(tasksService.upsertByDedup).toHaveBeenCalledTimes(2);
    expect(tasksService.upsertByDedup.mock.calls[0][1]).toBe(
      tasksService.upsertByDedup.mock.calls[1][1],
    );
  });
});

describe('WorkflowActionRegistryExecutorService — disabled capability', () => {
  it('throws CAPABILITY_DISABLED', async () => {
    const disabledHandler: WorkflowActionHandler = {
      definition: {
        type: 'disabled.action',
        version: '1.0.0',
        capabilityStatus: 'DISABLED',
        configSchema: { schemaVersion: '1', properties: {} },
        riskClass: 'LOW',
        requiresApproval: false,
        timeoutPolicy: { defaultMs: 1000, maxMs: 2000 },
        retryPolicy: { maxAttempts: 1, initialBackoffMs: 100, maxBackoffMs: 200 },
        idempotencyPolicy: { scope: 'action_run', keyField: 'idempotencyKey' },
      },
      validate: () => ({ valid: true, errors: [], normalizedConfig: {} }),
      authorize: async () => ({ authorized: true }),
      preview: async () => ({ sideEffectFree: true, summary: '', plannedEffects: [] }),
      execute: async () => ({ status: 'SUCCESS' }),
      classifyError: () => ({ category: 'UNKNOWN', message: '', retryable: false }),
    };
    const registry = new WorkflowActionRegistryService([disabledHandler]);
    registry.onModuleInit();
    const executor = new WorkflowActionRegistryExecutorService(registry);
    await expect(
      executor.execute('disabled.action', {}, baseContext()),
    ).rejects.toMatchObject({ code: 'CAPABILITY_DISABLED' });
  });
});
