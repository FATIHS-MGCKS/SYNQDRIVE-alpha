import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
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
  WORKFLOW_ACTION_HANDLERS,
  type WorkflowActionExecutionContext,
} from './index';
import {
  WORKFLOW_ACTION_HANDLER_PROVIDERS,
  workflowActionHandlersProvider,
} from './workflow-action-handlers.provider';
import { WorkflowActionPolicyService } from '../policies/workflow-action-policy.service';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function baseContext(
  overrides: Partial<WorkflowActionExecutionContext> = {},
): WorkflowActionExecutionContext {
  return {
    organizationId: ORG,
    workflowRunId: 'run-email-1',
    actionRunId: 'action-email-1',
    workflowId: 'wf-email-1',
    actionIndex: 0,
    idempotencyKey: 'idem-email-1',
    event: {
      eventType: 'booking.returned',
      entityType: 'booking',
      entityId: 'booking-1',
      payload: { bookingId: 'booking-1', customerId: 'cust-1' },
    },
    workflowSnapshot: {},
    policySnapshot: {},
    actor: {
      kind: 'system',
      permissions: ['WORKFLOW_EXECUTE', 'WORKFLOW_CUSTOMER_CONTACT'],
    },
    correlationId: 'corr-email-1',
    secretsResolver: new WorkflowActionNoopSecretsResolver(),
    logger: createWorkflowActionPiiSafeLogger('email-send-test'),
    ...overrides,
  };
}

const emailConfigBase = {
  templateId: 'booking_follow_up',
  templateVersion: '1.0.0',
  locale: 'de',
  recipient: { type: 'booking', bookingId: 'booking-1' },
  params: { message: 'Testnachricht' },
  respectSendWindow: false,
};

function createPrismaMock() {
  const outboundEmails = new Map<string, Record<string, unknown>>();
  let emailSeq = 0;

  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue({
        companyName: 'Test Org',
        timezone: 'Europe/Berlin',
        emailSignature: null,
        orgEmailSettings: { signatureHtml: null },
      }),
    },
    booking: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string; organizationId: string } }) => {
        if (where.organizationId !== ORG) return null;
        if (where.id === 'booking-1') {
          return {
            id: 'booking-1',
            customerId: 'cust-1',
            customer: { id: 'cust-1', email: 'customer@example.com' },
          };
        }
        return null;
      }),
    },
    customer: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string; organizationId: string } }) => {
        if (where.organizationId !== ORG) return null;
        return { id: where.id, email: 'customer@example.com' };
      }),
    },
    generatedDocument: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    billingEmailSuppression: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    outboundEmail: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of outboundEmails.values()) {
          if (where.organizationId && row.organizationId !== where.organizationId) continue;
          if (where.sendIdempotencyKey && row.sendIdempotencyKey !== where.sendIdempotencyKey) continue;
          return row;
        }
        return null;
      }),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `email-${++emailSeq}`;
        const row = { id, ...data, providerMessageId: null, status: 'QUEUED' };
        outboundEmails.set(id, row);
        return row;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = outboundEmails.get(where.id);
        if (!row) throw new Error('not found');
        const updated = { ...row, ...data };
        outboundEmails.set(where.id, updated);
        return updated;
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    _outboundEmails: outboundEmails,
  };
}

describe('email.send workflow action adapter', () => {
  let executor: WorkflowActionRegistryExecutorService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let provider: { sendEmail: jest.Mock; providerName: string; isSimulated: boolean };
  let policyService: OutboundEmailPolicyService;
  let outboundEmailService: { recordEvent: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    provider = {
      sendEmail: jest.fn().mockResolvedValue({
        provider: 'resend',
        providerMessageId: 'msg-123',
        status: 'SENT_SIMULATED',
      }),
      providerName: 'dev',
      isSimulated: true,
    };
    outboundEmailService = {
      recordEvent: jest.fn().mockResolvedValue({}),
    };
    policyService = {
      resolveIdentity: jest.fn().mockResolvedValue({
        fromEmail: 'noreply@synqdrive.eu',
        fromName: 'Test Org',
        replyToEmail: 'support@test.org',
      }),
      isValidEmail: jest.fn((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
      validateRecipientEmails: jest.fn(),
    } as unknown as OutboundEmailPolicyService;

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [emailConfig], ignoreEnvFile: true })],
      providers: [
        WorkflowActionPolicyService,
        WorkflowActionSafetyBlockService,
        ...WORKFLOW_ACTION_HANDLER_PROVIDERS,
        workflowActionHandlersProvider,
        WorkflowActionRegistryService,
        WorkflowActionRegistryExecutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: TasksService, useValue: { upsertByDedup: jest.fn(), findActiveByDedup: jest.fn() } },
        { provide: NotificationCoreService, useValue: { ingestCandidate: jest.fn() } },
        { provide: RentalHealthService, useValue: { isRentalBlocked: jest.fn().mockResolvedValue({ blocked: false }) } },
        { provide: OutboundEmailPolicyService, useValue: policyService },
        { provide: OutboundEmailService, useValue: outboundEmailService },
        { provide: EmailProviderRegistry, useValue: { resolve: () => provider } },
        { provide: GeneratedDocumentsService, useValue: { getById: jest.fn() } },
        { provide: DOCUMENTS_STORAGE, useValue: { getObject: jest.fn() } },
      ],
    }).compile();

    module.get(WorkflowActionRegistryService).onModuleInit();
    executor = module.get(WorkflowActionRegistryExecutorService);
  });

  it('sends email successfully with entity recipient', async () => {
    const result = await executor.execute(
      'email.send',
      emailConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('SUCCESS');
    expect(result.output?.deliveryStatus).toBe('SENT');
    expect(result.output?.maskedRecipient).toMatch(/c\*\*\*@example\.com/);
    expect(provider.sendEmail).toHaveBeenCalledTimes(1);
    expect(result.output?.auditId).toBeDefined();
  });

  it('dry-run preview does not call provider', async () => {
    const preview = await executor.preview('email.send', emailConfigBase, baseContext());
    expect(preview.sideEffectFree).toBe(true);
    expect(preview.plannedEffects.some((e) => e.includes('booking_follow_up'))).toBe(true);
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it('returns idempotent replay on duplicate idempotency key', async () => {
    await executor.execute('email.send', emailConfigBase, baseContext({ runApproved: true }));
    provider.sendEmail.mockClear();
    const second = await executor.execute(
      'email.send',
      emailConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(second.idempotentReplay).toBe(true);
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it('fails for invalid recipient email', async () => {
    prisma.booking.findFirst.mockResolvedValueOnce({
      id: 'booking-1',
      customerId: 'cust-1',
      customer: { id: 'cust-1', email: 'not-an-email' },
    });
    const result = await executor.execute(
      'email.send',
      emailConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/valid email/i);
  });

  it('fails for foreign tenant booking', async () => {
    const result = await executor.execute(
      'email.send',
      {
        ...emailConfigBase,
        recipient: { type: 'booking', bookingId: 'foreign-booking' },
      },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
  });

  it('rejects unknown template', async () => {
    const validation = executor.validateConfig(
      'email.send',
      { ...emailConfigBase, templateId: 'unknown_template' },
      baseContext(),
    );
    expect(validation.valid).toBe(false);
  });

  it('rejects template version mismatch', async () => {
    const validation = executor.validateConfig(
      'email.send',
      { ...emailConfigBase, templateVersion: '9.9.9' },
      baseContext(),
    );
    expect(validation.valid).toBe(false);
  });

  it('handles provider failure', async () => {
    provider.sendEmail.mockResolvedValueOnce({
      provider: 'resend',
      providerMessageId: null,
      status: 'FAILED',
      errorMessage: 'Provider rejected',
    });
    const result = await executor.execute(
      'email.send',
      emailConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
  });

  it('blocks without approval (policy REQUIRED)', async () => {
    const result = await executor.execute(
      'email.send',
      emailConfigBase,
      baseContext({ runApproved: false }),
    );
    expect(result.status).toBe('FAILED');
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it('blocks on safety policy for critical vehicle trigger without verifiedDiagnosis', async () => {
    const result = await executor.execute(
      'email.send',
      emailConfigBase,
      baseContext({
        runApproved: true,
        event: {
          eventType: 'vehicle.dtc.critical',
          entityType: 'vehicle',
          entityId: 'veh-1',
          payload: {},
        },
      }),
    );
    expect(result.status).toBe('FAILED');
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it('returns SUPPRESSED for billing suppression list', async () => {
    prisma.billingEmailSuppression.findFirst.mockResolvedValueOnce({
      reason: 'BOUNCED',
      emailNormalized: 'customer@example.com',
    });
    const result = await executor.execute(
      'email.send',
      emailConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.output?.deliveryStatus).toBe('SUPPRESSED');
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects attachment from foreign org document', async () => {
    prisma.generatedDocument.findMany.mockResolvedValueOnce([]);
    const result = await executor.execute(
      'email.send',
      { ...emailConfigBase, attachmentDocumentIds: ['doc-foreign'] },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
  });

  it('rejects disallowed attachment MIME type', async () => {
    prisma.generatedDocument.findMany.mockResolvedValueOnce([
      {
        id: 'doc-1',
        organizationId: ORG,
        bookingId: 'booking-1',
        status: 'GENERATED',
        mimeType: 'application/x-msdownload',
        objectKey: 'key-1',
        fileName: 'evil.exe',
        documentType: 'BOOKING_INVOICE',
      },
    ]);
    const result = await executor.execute(
      'email.send',
      { ...emailConfigBase, attachmentDocumentIds: ['doc-1'], respectSendWindow: false },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/MIME/i);
  });
});
