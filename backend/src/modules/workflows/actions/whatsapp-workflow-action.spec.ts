import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppTemplateProviderStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import { WhatsAppConsentService } from '@modules/whatsapp/whatsapp-consent.service';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import { WhatsAppProviderService } from '@modules/whatsapp/providers/whatsapp-provider.service';
import { WhatsAppTemplateService } from '@modules/whatsapp/whatsapp-template.service';
import { WhatsAppWebhookService } from '@modules/whatsapp/whatsapp-webhook.service';
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

function baseContext(
  overrides: Partial<WorkflowActionExecutionContext> = {},
): WorkflowActionExecutionContext {
  return {
    organizationId: ORG,
    workflowRunId: 'run-wa-1',
    actionRunId: 'action-wa-1',
    workflowId: 'wf-wa-1',
    actionIndex: 0,
    idempotencyKey: 'idem-wa-1',
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
    correlationId: 'corr-wa-1',
    secretsResolver: new WorkflowActionNoopSecretsResolver(),
    logger: createWorkflowActionPiiSafeLogger('whatsapp-workflow-test'),
    ...overrides,
  };
}

const templateConfigBase = {
  templateId: 'tpl-approved-1',
  recipient: { type: 'booking', bookingId: 'booking-1' },
  variables: { name: 'Max' },
  messageKind: 'transactional',
  respectQuietHours: false,
};

const approvedTemplate = {
  id: 'tpl-approved-1',
  organizationId: ORG,
  name: 'booking_follow_up',
  language: 'de',
  category: 'BOOKING_CONFIRMATION',
  bodyTemplate: 'Hallo {{name}}',
  providerStatus: WhatsAppTemplateProviderStatus.APPROVED,
};

const orgWhatsAppConfig = {
  organizationId: ORG,
  isConnected: true,
  isActive: true,
  phoneNumberId: 'pn-1',
  accessTokenConfigured: true,
  appSecretConfigured: true,
  serviceWindowOpen: false,
  metaApiVersion: 'v21.0',
};

function createPrismaMock() {
  const messages = new Map<string, Record<string, unknown>>();
  const conversations = new Map<string, Record<string, unknown>>();
  let msgSeq = 0;
  let convoSeq = 0;

  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Berlin' }),
    },
    booking: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string; organizationId: string } }) => {
        if (where.organizationId !== ORG) return null;
        if (where.id === 'booking-1') {
          return {
            id: 'booking-1',
            customerId: 'cust-1',
            customer: { id: 'cust-1', phone: '+491701234567' },
          };
        }
        return null;
      }),
    },
    customer: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string; organizationId: string } }) => {
        if (where.organizationId !== ORG) return null;
        return { id: where.id, phone: '+491701234567' };
      }),
    },
    orgWhatsAppConfig: {
      findUnique: jest.fn().mockResolvedValue(orgWhatsAppConfig),
    },
    whatsAppTemplate: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id?: string; organizationId: string } }) => {
        if (where.organizationId !== ORG) return null;
        if (where.id === 'tpl-approved-1') return approvedTemplate;
        if (where.id === 'tpl-pending-1') {
          return {
            ...approvedTemplate,
            id: 'tpl-pending-1',
            providerStatus: WhatsAppTemplateProviderStatus.PENDING_APPROVAL,
          };
        }
        return null;
      }),
    },
    whatsAppMessage: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of messages.values()) {
          if (where.organizationId && row.organizationId !== where.organizationId) continue;
          if (where.idempotencyKey && row.idempotencyKey !== where.idempotencyKey) continue;
          if (where.providerMessageId && row.providerMessageId !== where.providerMessageId) continue;
          return row;
        }
        return null;
      }),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `wa-msg-${++msgSeq}`;
        const row = {
          id,
          ...data,
          providerMessageId: null,
          conversation: { contactPhone: '+491701234567' },
        };
        messages.set(id, row);
        return row;
      }),
      update: jest.fn().mockImplementation(async ({ where, data, include }: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => {
        const row = messages.get(where.id);
        if (!row) throw new Error('not found');
        const updated = { ...row, ...data, conversation: { contactPhone: '+491701234567' } };
        messages.set(where.id, updated);
        return updated;
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    whatsAppConversation: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { organizationId_contactPhoneNormalized?: { organizationId: string; contactPhoneNormalized: string } } }) => {
        const key = where.organizationId_contactPhoneNormalized;
        if (!key) return null;
        for (const row of conversations.values()) {
          if (
            row.organizationId === key.organizationId
            && row.contactPhoneNormalized === key.contactPhoneNormalized
          ) {
            return row;
          }
        }
        return null;
      }),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `convo-${++convoSeq}`;
        const row = { id, ...data, lastCustomerMessageAt: null, status: 'OPEN' };
        conversations.set(id, row);
        return row;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = conversations.get(where.id) ?? { id: where.id };
        const updated = { ...row, ...data };
        conversations.set(where.id, updated);
        return updated;
      }),
    },
    _messages: messages,
  };
}

describe('whatsapp workflow action adapters', () => {
  let executor: WorkflowActionRegistryExecutorService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let templateService: { sendTemplateMessage: jest.Mock };
  let providerService: { isConfigured: jest.Mock; sendTextMessage: jest.Mock };
  let consentService: {
    assertCanSend: jest.Mock;
    getConsent: jest.Mock;
    isOptedOut: jest.Mock;
  };
  let messagePolicy: WhatsAppMessagePolicyService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    templateService = {
      sendTemplateMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'wamid.template.1',
        status: 'SENT',
      }),
    };
    providerService = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendTextMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'wamid.text.1',
        status: 'SENT',
      }),
    };
    consentService = {
      assertCanSend: jest.fn().mockResolvedValue(undefined),
      getConsent: jest.fn().mockResolvedValue({
        optedInAt: new Date(),
        optedOutAt: null,
        marketingAllowed: false,
        transactionalAllowed: true,
      }),
      isOptedOut: jest.fn().mockReturnValue(false),
    };
    messagePolicy = new WhatsAppMessagePolicyService();

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
        { provide: OutboundEmailPolicyService, useValue: { resolveIdentity: jest.fn(), isValidEmail: jest.fn() } },
        { provide: OutboundEmailService, useValue: { recordEvent: jest.fn() } },
        { provide: EmailProviderRegistry, useValue: { resolve: () => ({ sendEmail: jest.fn() }) } },
        { provide: GeneratedDocumentsService, useValue: { getById: jest.fn() } },
        { provide: DOCUMENTS_STORAGE, useValue: { getObject: jest.fn() } },
        { provide: WhatsAppTemplateService, useValue: templateService },
        { provide: WhatsAppProviderService, useValue: providerService },
        { provide: WhatsAppConsentService, useValue: consentService },
        { provide: WhatsAppMessagePolicyService, useValue: messagePolicy },
      ],
    }).compile();

    module.get(WorkflowActionRegistryService).onModuleInit();
    executor = module.get(WorkflowActionRegistryExecutorService);
  });

  it('sends template successfully', async () => {
    const result = await executor.execute(
      'whatsapp.template.send',
      templateConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('SUCCESS');
    expect(result.output?.deliveryStatus).toBe('SENT');
    expect(result.output?.providerMessageId).toBe('wamid.template.1');
    expect(templateService.sendTemplateMessage).toHaveBeenCalledTimes(1);
  });

  it('dry-run preview does not call provider', async () => {
    const preview = await executor.preview(
      'whatsapp.template.send',
      templateConfigBase,
      baseContext(),
    );
    expect(preview.sideEffectFree).toBe(true);
    expect(templateService.sendTemplateMessage).not.toHaveBeenCalled();
    expect(preview.metadata?.maskedRecipient).toBeDefined();
  });

  it('fails when opt-in missing for support messages', async () => {
    consentService.getConsent.mockResolvedValueOnce({
      optedInAt: null,
      optedOutAt: null,
      marketingAllowed: false,
      transactionalAllowed: true,
    });
    const result = await executor.execute(
      'whatsapp.template.send',
      { ...templateConfigBase, messageKind: 'support' },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/opt-in/i);
  });

  it('fails for invalid phone number', async () => {
    prisma.booking.findFirst.mockResolvedValueOnce({
      id: 'booking-1',
      customerId: 'cust-1',
      customer: { id: 'cust-1', phone: 'invalid' },
    });
    const result = await executor.execute(
      'whatsapp.template.send',
      templateConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/invalid/i);
  });

  it('fails for foreign tenant booking', async () => {
    const result = await executor.execute(
      'whatsapp.template.send',
      {
        ...templateConfigBase,
        recipient: { type: 'booking', bookingId: 'foreign-booking' },
      },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
  });

  it('returns idempotent replay on duplicate idempotency key', async () => {
    await executor.execute(
      'whatsapp.template.send',
      templateConfigBase,
      baseContext({ runApproved: true }),
    );
    templateService.sendTemplateMessage.mockClear();
    const second = await executor.execute(
      'whatsapp.template.send',
      templateConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(second.idempotentReplay).toBe(true);
    expect(templateService.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('handles provider timeout', async () => {
    templateService.sendTemplateMessage.mockRejectedValueOnce(new Error('WHATSAPP_PROVIDER_TIMEOUT'));
    const result = await executor.execute(
      'whatsapp.template.send',
      templateConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/TIMEOUT/i);
  });

  it('rejects unapproved template', async () => {
    const result = await executor.execute(
      'whatsapp.template.send',
      { ...templateConfigBase, templateId: 'tpl-pending-1' },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/pending/i);
  });

  it('blocks when contact frequency limit exceeded', async () => {
    prisma.whatsAppMessage.count.mockResolvedValue(5);
    const result = await executor.execute(
      'whatsapp.template.send',
      templateConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/frequency/i);
  });

  it('whatsapp.ai_message.send is disabled by default', async () => {
    await expect(
      executor.execute(
        'whatsapp.ai_message.send',
        {
          recipient: { type: 'booking', bookingId: 'booking-1' },
          message: 'Test AI message',
        },
        baseContext({ runApproved: true }),
      ),
    ).rejects.toThrow(/disabled/i);
  });

  it('blocks without approval (policy REQUIRED)', async () => {
    const result = await executor.execute(
      'whatsapp.template.send',
      templateConfigBase,
      baseContext({ runApproved: false }),
    );
    expect(result.status).toBe('FAILED');
    expect(templateService.sendTemplateMessage).not.toHaveBeenCalled();
  });
});

describe('WhatsAppWebhookService status idempotency', () => {
  const prisma = {
    whatsAppWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orgWhatsAppConfig: {
      findFirst: jest.fn().mockResolvedValue({
        organizationId: ORG,
        phoneNumberId: 'pn-1',
        accessTokenConfigured: true,
        appSecretConfigured: true,
        webhookVerifyToken: 'tok',
        metaApiVersion: 'v21.0',
      }),
      update: jest.fn(),
    },
    whatsAppMessage: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    whatsAppConversation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const provider = {
    parseWebhook: jest.fn(),
    validateSignature: jest.fn(),
  };
  const matcher = { matchContext: jest.fn() };
  const consent = { processInboundConsentKeywords: jest.fn() };
  const audit = { record: jest.fn() };
  const whatsAppService = { processInboundAutoReply: jest.fn() };

  let service: WhatsAppWebhookService;

  const statusEntry = {
    externalEventId: 'status:wamid.out.1:delivered:123',
    eventType: 'statuses',
    statusUpdate: {
      providerMessageId: 'wamid.out.1',
      status: 'DELIVERED' as const,
      timestamp: new Date(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider.parseWebhook.mockReturnValue({
      phoneNumberId: 'pn-1',
      entries: [statusEntry],
    });
    provider.validateSignature.mockReturnValue(true);
    prisma.whatsAppWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.whatsAppWebhookEvent.create.mockResolvedValue({ id: 'evt-1' });
    prisma.whatsAppMessage.findFirst.mockResolvedValue({ id: 'msg-1', failureReason: null });

    service = new WhatsAppWebhookService(
      prisma as any,
      provider as any,
      matcher as any,
      consent as any,
      audit as any,
      whatsAppService as any,
    );
  });

  it('skips duplicate status webhook event', async () => {
    prisma.whatsAppWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-existing',
      processedAt: new Date(),
    });
    await service.receiveWebhook(Buffer.from('{}'), {}, {});
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
  });

  it('rejects invalid signature in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    provider.validateSignature.mockReturnValue(false);
    prisma.whatsAppWebhookEvent.findUnique.mockResolvedValue(null);

    await expect(service.receiveWebhook(Buffer.from('{}'), {}, {})).rejects.toThrow(/signature/i);
    process.env.NODE_ENV = prev;
  });
});
