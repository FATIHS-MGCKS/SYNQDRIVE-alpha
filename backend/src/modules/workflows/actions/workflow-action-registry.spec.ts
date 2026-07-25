import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import emailConfig from '@config/email.config';
import {
  createWorkflowActionPiiSafeLogger,
  WorkflowActionNoopSecretsResolver,
  WorkflowActionRegistryExecutorService,
  WorkflowActionRegistryService,
  type WorkflowActionExecutionContext,
  type WorkflowActionHandler,
  WorkflowActionRegistryError,
} from './index';
import {
  WORKFLOW_ACTION_HANDLER_PROVIDERS,
  workflowActionHandlersProvider,
} from './workflow-action-handlers.provider';
import { WorkflowActionPolicyService } from '../policies/workflow-action-policy.service';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';
import { BaseWorkflowActionHandler } from './handlers/base-workflow-action.handler';
import type { WorkflowActionExecuteResult } from './workflow-action-registry.types';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const emailAdapterTestProviders = [
  { provide: GeneratedDocumentsService, useValue: { getById: jest.fn() } },
  { provide: DOCUMENTS_STORAGE, useValue: { getObject: jest.fn() } },
  {
    provide: OutboundEmailPolicyService,
    useValue: {
      resolveIdentity: jest.fn().mockResolvedValue({
        fromEmail: 'noreply@test.eu',
        fromName: 'Test',
        replyToEmail: 'support@test.eu',
      }),
      isValidEmail: (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
      validateRecipientEmails: jest.fn(),
    },
  },
  { provide: OutboundEmailService, useValue: { recordEvent: jest.fn() } },
  {
    provide: EmailProviderRegistry,
    useValue: {
      resolve: () => ({
        sendEmail: jest.fn().mockResolvedValue({
          provider: 'dev',
          providerMessageId: 'msg-1',
          status: 'SENT_SIMULATED',
        }),
      }),
    },
  },
];

const prismaMock = {
  vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }), update: jest.fn() },
  booking: { findFirst: jest.fn().mockResolvedValue({ id: 'booking-1', customerId: 'cust-1' }), update: jest.fn() },
  orgWorkflowApproval: { create: jest.fn(), findFirst: jest.fn() },
  organization: { findUnique: jest.fn().mockResolvedValue({ companyName: 'Test', timezone: 'Europe/Berlin', orgEmailSettings: null, emailSignature: null }) },
  customer: { findFirst: jest.fn() },
  generatedDocument: { findMany: jest.fn().mockResolvedValue([]) },
  billingEmailSuppression: { findFirst: jest.fn().mockResolvedValue(null) },
  outboundEmail: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
};

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
      imports: [ConfigModule.forRoot({ load: [emailConfig], ignoreEnvFile: true })],
      providers: [
        WorkflowActionPolicyService,
        WorkflowActionSafetyBlockService,
        ...WORKFLOW_ACTION_HANDLER_PROVIDERS,
        workflowActionHandlersProvider,
        WorkflowActionRegistryService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: TasksService,
          useValue: { upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }), findActiveByDedup: jest.fn().mockResolvedValue(null) },
        },
        { provide: NotificationCoreService, useValue: { ingestCandidate: jest.fn().mockResolvedValue({ enabled: true, operation: 'created', notification: { id: 'n1' } }) } },
        { provide: RentalHealthService, useValue: { isRentalBlocked: jest.fn().mockResolvedValue({ blocked: false, reasons: [] }) } },
        ...emailAdapterTestProviders,
      ],
    }).compile();

    registry = module.get(WorkflowActionRegistryService);
    registry.onModuleInit();
  });

  it('registers built-in handlers', () => {
    expect(registry.has('task.create')).toBe(true);
    expect(registry.has('email.send')).toBe(true);
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
  let tasksService: { upsertByDedup: jest.Mock; findActiveByDedup: jest.Mock };

  beforeEach(async () => {
    tasksService = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-99' }),
      findActiveByDedup: jest.fn().mockResolvedValue(null),
    };
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [emailConfig], ignoreEnvFile: true })],
      providers: [
        WorkflowActionPolicyService,
        WorkflowActionSafetyBlockService,
        ...WORKFLOW_ACTION_HANDLER_PROVIDERS,
        workflowActionHandlersProvider,
        WorkflowActionRegistryService,
        WorkflowActionRegistryExecutorService,
        WorkflowActionNoopSecretsResolver,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TasksService, useValue: tasksService },
        { provide: NotificationCoreService, useValue: { ingestCandidate: jest.fn().mockResolvedValue({ enabled: true, operation: 'created', notification: { id: 'n1' } }) } },
        { provide: RentalHealthService, useValue: { isRentalBlocked: jest.fn().mockResolvedValue({ blocked: false, reasons: [] }) } },
        ...emailAdapterTestProviders,
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

  it('execute uses stable dedup key for task.create', async () => {
    const ctx = baseContext({
      actor: { kind: 'system', permissions: ['WORKFLOW_EXECUTE'] },
    });
    tasksService.findActiveByDedup
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'task-99' });
    await executor.execute('task.create', { title: 'A' }, ctx);
    await executor.execute('task.create', { title: 'A' }, ctx);
    expect(tasksService.upsertByDedup).toHaveBeenCalledTimes(1);
    expect(tasksService.findActiveByDedup).toHaveBeenCalledTimes(2);
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
    const policyService = new WorkflowActionPolicyService(new WorkflowActionSafetyBlockService());
    const executor = new WorkflowActionRegistryExecutorService(registry, policyService);
    await expect(
      executor.execute('disabled.action', {}, baseContext()),
    ).rejects.toMatchObject({ code: 'CAPABILITY_DISABLED' });
  });
});
