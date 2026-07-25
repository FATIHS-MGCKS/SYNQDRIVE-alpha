import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { SmsConsentService } from '@modules/sms/sms-consent.service';
import { SmsMessagingService } from '@modules/sms/sms-messaging.service';
import { OutboundSmsService } from '@modules/sms/outbound-sms.service';
import { SmsWebhookService } from '@modules/sms/sms-webhook.service';
import emailConfig from '@config/email.config';
import twilioConfig from '@config/twilio.config';
import {
  createWorkflowActionPiiSafeLogger,
  WorkflowActionNoopSecretsResolver,
  WorkflowActionRegistryExecutorService,
  WorkflowActionRegistryService,
  type WorkflowActionExecutionContext,
} from './index';
import {
  WORKFLOW_ACTION_HANDLER_PROVIDERS,
  workflowActionHandlersProvider,
} from './workflow-action-handlers.provider';
import { workflowEmailTestProviders, workflowWhatsAppTestProviders } from './workflow-action-test.providers';
import { WorkflowActionPolicyService } from '../policies/workflow-action-policy.service';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const orgSmsConfig = {
  organizationId: ORG,
  isActive: true,
  messagingServiceSid: 'MG_TEST',
  fromPhoneNumberSid: null,
  fromMaskedNumber: '+49***0000',
  defaultLocale: 'de',
};

function baseContext(
  overrides: Partial<WorkflowActionExecutionContext> = {},
): WorkflowActionExecutionContext {
  return {
    organizationId: ORG,
    workflowRunId: 'run-sms-1',
    actionRunId: 'action-sms-1',
    workflowId: 'wf-sms-1',
    actionIndex: 0,
    idempotencyKey: 'idem-sms-1',
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
    correlationId: 'corr-sms-1',
    secretsResolver: new WorkflowActionNoopSecretsResolver(),
    logger: createWorkflowActionPiiSafeLogger('sms-workflow-test'),
    ...overrides,
  };
}

const smsConfigBase = {
  templateKey: 'booking_follow_up',
  templateVersion: '1.0.0',
  locale: 'de',
  recipient: { type: 'booking', bookingId: 'booking-1' },
  params: { message: 'Test', name: 'Max' },
  respectQuietHours: false,
};

function createPrismaMock() {
  const outbound = new Map<string, Record<string, unknown>>();
  let seq = 0;

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
    orgSmsConfig: {
      findUnique: jest.fn().mockResolvedValue(orgSmsConfig),
    },
    whatsAppMessage: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    outboundSms: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of outbound.values()) {
          if (where.organizationId && row.organizationId !== where.organizationId) continue;
          if (where.sendIdempotencyKey && row.sendIdempotencyKey !== where.sendIdempotencyKey) continue;
          if (where.providerMessageSid && row.providerMessageSid !== where.providerMessageSid) continue;
          return row;
        }
        return null;
      }),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `sms-${++seq}`;
        const row = { id, ...data, providerMessageSid: null };
        outbound.set(id, row);
        return row;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = outbound.get(where.id);
        if (!row) throw new Error('not found');
        const updated = { ...row, ...data };
        outbound.set(where.id, updated);
        return updated;
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    outboundSmsEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    twilioWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    voiceProviderAccount: {
      findFirst: jest.fn().mockResolvedValue({ organizationId: ORG }),
    },
    _outbound: outbound,
  };
}

describe('sms.send workflow action adapter', () => {
  let executor: WorkflowActionRegistryExecutorService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let messaging: {
    sendSms: jest.Mock;
    resolveSender: jest.Mock;
  };
  let consent: { assertCanSend: jest.Mock; getConsent: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    messaging = {
      resolveSender: jest.fn().mockResolvedValue({
        messagingServiceSid: 'MG_TEST',
        fromSenderRef: 'MG:MG_TEST',
        fromMasked: '+49***0000',
      }),
      sendSms: jest.fn().mockResolvedValue({
        providerMessageSid: 'SM_TEST_1',
        status: 'SENT_SIMULATED',
        segmentCount: 1,
      }),
    };
    consent = {
      assertCanSend: jest.fn().mockResolvedValue(undefined),
      getConsent: jest.fn().mockResolvedValue({
        optedInAt: new Date(),
        optedOutAt: null,
        marketingAllowed: false,
        transactionalAllowed: true,
      }),
    };

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [emailConfig, twilioConfig], ignoreEnvFile: true }),
      ],
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
        ...workflowEmailTestProviders,
        ...workflowWhatsAppTestProviders,
        { provide: SmsMessagingService, useValue: messaging },
        { provide: SmsConsentService, useValue: consent },
        { provide: OutboundSmsService, useValue: { recordEvent: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    module.get(WorkflowActionRegistryService).onModuleInit();
    executor = module.get(WorkflowActionRegistryExecutorService);
  });

  it('sends SMS successfully', async () => {
    const result = await executor.execute('sms.send', smsConfigBase, baseContext({ runApproved: true }));
    expect(result.status).toBe('SUCCESS');
    expect(result.output?.providerMessageSid).toBe('SM_TEST_1');
    expect(messaging.sendSms).toHaveBeenCalledTimes(1);
  });

  it('dry-run preview does not call provider', async () => {
    const preview = await executor.preview('sms.send', smsConfigBase, baseContext());
    expect(preview.sideEffectFree).toBe(true);
    expect(messaging.sendSms).not.toHaveBeenCalled();
  });

  it('returns idempotent replay on duplicate', async () => {
    await executor.execute('sms.send', smsConfigBase, baseContext({ runApproved: true }));
    messaging.sendSms.mockClear();
    const second = await executor.execute('sms.send', smsConfigBase, baseContext({ runApproved: true }));
    expect(second.idempotentReplay).toBe(true);
    expect(messaging.sendSms).not.toHaveBeenCalled();
  });

  it('fails when opt-out blocks send', async () => {
    consent.assertCanSend.mockRejectedValueOnce(new Error('opted out'));
    const result = await executor.execute('sms.send', smsConfigBase, baseContext({ runApproved: true }));
    expect(result.status).toBe('FAILED');
  });

  it('fails for invalid phone', async () => {
    prisma.booking.findFirst.mockResolvedValueOnce({
      id: 'booking-1',
      customerId: 'cust-1',
      customer: { id: 'cust-1', phone: 'bad' },
    });
    const result = await executor.execute('sms.send', smsConfigBase, baseContext({ runApproved: true }));
    expect(result.status).toBe('FAILED');
  });

  it('fails for foreign tenant', async () => {
    const result = await executor.execute(
      'sms.send',
      { ...smsConfigBase, recipient: { type: 'booking', bookingId: 'foreign' } },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
  });

  it('handles provider timeout', async () => {
    messaging.sendSms.mockRejectedValueOnce(new Error('SMS_PROVIDER_TIMEOUT'));
    const result = await executor.execute('sms.send', smsConfigBase, baseContext({ runApproved: true }));
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/TIMEOUT/i);
  });

  it('blocks without approval', async () => {
    const result = await executor.execute('sms.send', smsConfigBase, baseContext({ runApproved: false }));
    expect(result.status).toBe('FAILED');
    expect(messaging.sendSms).not.toHaveBeenCalled();
  });

  it('blocks risky content without approval when sensitiveFlags set', async () => {
    const result = await executor.execute(
      'sms.send',
      { ...smsConfigBase, sensitiveFlags: ['PAYMENT_PROBLEM'] },
      baseContext({ runApproved: false }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/approval/i);
  });

  it('blocks outside quiet hours when contact frequency exceeded', async () => {
    prisma.outboundSms.count.mockResolvedValue(3);
    const result = await executor.execute(
      'sms.send',
      { ...smsConfigBase, respectQuietHours: false },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/frequency/i);
  });
});

describe('SmsWebhookService status callbacks', () => {
  const prisma = {
    twilioWebhookEvent: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    outboundSms: { findFirst: jest.fn(), update: jest.fn() },
    outboundSmsEvent: { findFirst: jest.fn(), create: jest.fn() },
    voiceProviderAccount: { findFirst: jest.fn() },
  };
  const consent = { processInboundConsentKeywords: jest.fn() };
  let service: SmsWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.twilioWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.twilioWebhookEvent.create.mockResolvedValue({ id: 'evt-1' });
    prisma.outboundSms.findFirst.mockResolvedValue({ id: 'sms-1', organizationId: ORG });
    prisma.outboundSmsEvent.findFirst.mockResolvedValue(null);
    service = new SmsWebhookService(prisma as never, { get: () => 'test-token' } as never, consent as never);
  });

  it('applies delivery status from callback', async () => {
    await service.handleMessageStatus({
      body: {
        MessageSid: 'SM_123',
        MessageStatus: 'delivered',
        Timestamp: '123',
      },
      headers: { 'x-twilio-signature': 'sig' },
      requestUrl: 'https://app.test/webhooks/twilio/message-status',
    });
    expect(prisma.outboundSms.update).toHaveBeenCalled();
    expect(prisma.outboundSmsEvent.create).toHaveBeenCalled();
  });

  it('skips duplicate status webhook', async () => {
    prisma.twilioWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-existing',
      processedAt: new Date(),
    });
    await service.handleMessageStatus({
      body: { MessageSid: 'SM_123', MessageStatus: 'delivered' },
      headers: {},
      requestUrl: 'https://app.test/webhooks/twilio/message-status',
    });
    expect(prisma.outboundSms.update).not.toHaveBeenCalled();
  });

  it('rejects invalid signature in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await expect(
      service.handleMessageStatus({
        body: { MessageSid: 'SM_123', MessageStatus: 'sent' },
        headers: { 'x-twilio-signature': 'bad' },
        requestUrl: 'https://app.test/webhooks/twilio/message-status',
      }),
    ).rejects.toThrow(/signature/i);
    process.env.NODE_ENV = prev;
  });
});
