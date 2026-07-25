import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { SmsConsentService } from '@modules/sms/sms-consent.service';
import { VoiceCallOrchestrationService } from '@modules/voice-call-orchestration/voice-call-orchestration.service';
import { VoiceProtectionDeniedError, VOICE_PROTECTION_REASON_CODES } from '@modules/voice-protection/voice-protection-reason-codes';
import { VoiceWebhookIngestService } from '@modules/voice-webhook-ingestion/voice-webhook-ingest.service';
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
import {
  workflowActionAdapterTestProviders,
  workflowSmsTestProviders,
  workflowWhatsAppTestProviders,
  workflowEmailTestProviders,
  workflowAiCommunicationTestProviders,
} from './workflow-action-test.providers';
import { WorkflowActionPolicyService } from '../policies/workflow-action-policy.service';
import { WorkflowActionSafetyBlockService } from '../policies/workflow-action-safety-block.service';
import { WorkflowVoiceCallStartService } from './adapters/workflow-voice-call-start.service';
import { validateElevenLabsWebhookSignature } from '@modules/voice-webhook-ingestion/elevenlabs-signature.util';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEPLOYMENT_ID = 'dep-11111111-1111-4111-8111-111111111111';

const voiceAssistant = {
  id: 'asst-1',
  organizationId: ORG,
  status: 'ACTIVE',
  outboundEnabled: true,
  permContactCustomers: true,
  businessHours: { start: '09:00', end: '18:00', timezone: 'Europe/Berlin' },
  businessHoursStart: '09:00',
  businessHoursEnd: '18:00',
  businessHoursTimezone: 'Europe/Berlin',
  permAnswerQuestions: true,
  permManageBookings: false,
  permCreateBookingDrafts: false,
  permCancelBookings: false,
  permCreateTasks: true,
  permWorkshopHandling: false,
  permBreakdownSupport: false,
  permContactVendors: false,
  permModifyRecords: false,
  permCreateActions: false,
  permEmergencyHandling: true,
  toolPermissions: null,
};

function baseContext(
  overrides: Partial<WorkflowActionExecutionContext> = {},
): WorkflowActionExecutionContext {
  return {
    organizationId: ORG,
    workflowRunId: 'run-voice-1',
    actionRunId: 'action-voice-1',
    workflowId: 'wf-voice-1',
    actionIndex: 0,
    idempotencyKey: 'idem-voice-1',
    event: {
      eventType: 'invoice.overdue',
      entityType: 'booking',
      entityId: 'booking-1',
      payload: { bookingId: 'booking-1', customerId: 'cust-1' },
    },
    workflowSnapshot: {},
    policySnapshot: {},
    actor: {
      kind: 'system',
      permissions: ['WORKFLOW_EXECUTE', 'WORKFLOW_VOICE_CALL'],
    },
    correlationId: 'corr-voice-1',
    secretsResolver: new WorkflowActionNoopSecretsResolver(),
    logger: createWorkflowActionPiiSafeLogger('voice-workflow-test'),
    ...overrides,
  };
}

const voiceConfigBase = {
  scenarioKey: 'booking_follow_up',
  scenarioVersion: '1.0.0',
  callPurpose: 'transactional',
  recipient: { type: 'booking', bookingId: 'booking-1' },
  respectCallHours: false,
};

function createPrismaMock() {
  const conversations = new Map<string, Record<string, unknown>>();

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
    voiceAssistant: {
      findUnique: jest.fn().mockResolvedValue(voiceAssistant),
    },
    voiceAgentDeployment: {
      findFirst: jest.fn().mockResolvedValue({ id: DEPLOYMENT_ID, version: 3 }),
    },
    voiceConversation: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of conversations.values()) {
          if (where.organizationId && row.organizationId !== where.organizationId) continue;
          const metadata = row.metadata as Record<string, unknown> | undefined;
          const idem = (where.metadata as { path?: string[]; equals?: string })?.equals;
          if (idem && metadata?.outboundIdempotencyKey !== idem) continue;
          if (where.id && row.id !== where.id) continue;
          return row;
        }
        return null;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
        return conversations.get(where.id) ?? null;
      }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    _conversations: conversations,
  };
}

describe('voice.call.start workflow action adapter', () => {
  let executor: WorkflowActionRegistryExecutorService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let orchestration: { orchestrateOutboundCall: jest.Mock };
  let consent: { assertCanSend: jest.Mock; getConsent: jest.Mock; isOptedOut: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    orchestration = {
      orchestrateOutboundCall: jest.fn().mockImplementation(async () => {
        const id = 'conv-test-1';
        prisma._conversations.set(id, {
          id,
          organizationId: ORG,
          elevenLabsConvId: 'el_conv_123',
          twilioCallSid: 'CA123',
          callerNumber: '+491701234567',
          lifecycleState: 'INITIATED',
          outcome: 'PENDING',
          summary: null,
          metadata: {
            outboundIdempotencyKey: `workflow:${ORG}:idem-voice-1:action:0:voice`,
            agentDeploymentId: DEPLOYMENT_ID,
            workflowScenarioKey: 'booking_follow_up',
            workflowScenarioVersion: '1.0.0',
          },
        });
        return {
          conversationId: id,
          maskedConversationRef: 'conv_***',
          maskedCallRef: 'CA_***',
          status: 'started',
          dryRun: false,
          idempotentReplay: false,
        };
      }),
    };
    consent = {
      assertCanSend: jest.fn().mockResolvedValue(undefined),
      getConsent: jest.fn().mockResolvedValue({
        optedInAt: new Date(),
        optedOutAt: null,
      }),
      isOptedOut: jest.fn().mockReturnValue(false),
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
        ...workflowSmsTestProviders.filter((p) => (p as { provide?: unknown }).provide !== SmsConsentService),
        ...workflowAiCommunicationTestProviders,
        { provide: SmsConsentService, useValue: consent },
        { provide: VoiceCallOrchestrationService, useValue: orchestration },
      ],
    }).compile();

    module.get(WorkflowActionRegistryService).onModuleInit();
    executor = module.get(WorkflowActionRegistryExecutorService);
  });

  it('starts voice call request via orchestrator', async () => {
    const result = await executor.execute(
      'voice.call.start',
      voiceConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('SUCCESS');
    expect(result.output?.twilioCallSid).toBe('CA123');
    expect(orchestration.orchestrateOutboundCall).toHaveBeenCalledTimes(1);
    expect(orchestration.orchestrateOutboundCall.mock.calls[0][0].workflowSource?.scenarioKey).toBe(
      'booking_follow_up',
    );
  });

  it('returns idempotent replay on duplicate', async () => {
    await executor.execute('voice.call.start', voiceConfigBase, baseContext({ runApproved: true }));
    orchestration.orchestrateOutboundCall.mockResolvedValueOnce({
      conversationId: 'conv-test-1',
      maskedConversationRef: 'conv_***',
      maskedCallRef: 'CA_***',
      status: 'already_requested',
      dryRun: false,
      idempotentReplay: true,
    });
    const second = await executor.execute(
      'voice.call.start',
      voiceConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(second.idempotentReplay).toBe(true);
  });

  it('fails when opt-out blocks call', async () => {
    consent.assertCanSend.mockRejectedValueOnce(new Error('opted out'));
    const result = await executor.execute(
      'voice.call.start',
      voiceConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(orchestration.orchestrateOutboundCall).not.toHaveBeenCalled();
  });

  it('fails outside allowed call hours', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValueOnce({
      ...voiceAssistant,
      businessHours: { start: '23:59', end: '23:59', timezone: 'Europe/Berlin' },
    });
    const result = await executor.execute(
      'voice.call.start',
      { ...voiceConfigBase, respectCallHours: true },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/call hours/i);
  });

  it('fails when budget limit blocks orchestrator', async () => {
    orchestration.orchestrateOutboundCall.mockRejectedValueOnce(
      new VoiceProtectionDeniedError({
        reasonCode: VOICE_PROTECTION_REASON_CODES.MONTHLY_BUDGET_HARD_LIMIT,
        message: 'Monthly voice budget exceeded',
      }),
    );
    const result = await executor.execute(
      'voice.call.start',
      voiceConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorCategory).toBe('AUTHORIZATION');
  });

  it('fails for foreign tenant', async () => {
    const result = await executor.execute(
      'voice.call.start',
      { ...voiceConfigBase, recipient: { type: 'booking', bookingId: 'foreign' } },
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
  });

  it('fails when orchestrator unavailable', async () => {
    orchestration.orchestrateOutboundCall.mockRejectedValueOnce(
      new ForbiddenException('Native ElevenLabs-Twilio outbound calls are not enabled'),
    );
    const result = await executor.execute(
      'voice.call.start',
      voiceConfigBase,
      baseContext({ runApproved: true }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorCategory).toBe('TRANSIENT');
  });

  it('fails on orchestrator timeout', async () => {
    jest.useFakeTimers();
    orchestration.orchestrateOutboundCall.mockImplementation(
      () => new Promise(() => undefined),
    );
    const pending = executor.execute(
      'voice.call.start',
      voiceConfigBase,
      baseContext({ runApproved: true }),
    );
    await jest.advanceTimersByTimeAsync(31_000);
    const result = await pending;
    jest.useRealTimers();
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/timed out/i);
  }, 15_000);

  it('dry-run preview produces call plan only', async () => {
    const preview = await executor.preview('voice.call.start', voiceConfigBase, baseContext());
    expect(preview.sideEffectFree).toBe(true);
    expect(preview.metadata?.callPlan).toBeDefined();
    expect(orchestration.orchestrateOutboundCall).not.toHaveBeenCalled();
  });

  it('blocks without approval for sensitive scenario', async () => {
    const result = await executor.execute(
      'voice.call.start',
      {
        ...voiceConfigBase,
        scenarioKey: 'complaint_resolution',
        scenarioVersion: '1.0.0',
        callPurpose: 'support',
      },
      baseContext({ runApproved: false }),
    );
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/approval/i);
    expect(orchestration.orchestrateOutboundCall).not.toHaveBeenCalled();
  });

  it('resolves post-call result summary without transcript', async () => {
    prisma._conversations.set('conv-final', {
      id: 'conv-final',
      organizationId: ORG,
      lifecycleState: 'FINALIZED',
      outcome: 'RESOLVED',
      summary: 'Customer confirmed pickup time.',
      durationSeconds: 95,
      escalationReason: null,
      metadata: {},
    });
    const service = new WorkflowVoiceCallStartService(
      prisma as never,
      orchestration as never,
      { evaluate: jest.fn() } as never,
      { assertSendPermitted: jest.fn() } as never,
      consent as never,
    );
    const postCall = await service.resolvePostCallResult(ORG, 'conv-final');
    expect(postCall.resultSummary).toContain('pickup');
    expect(postCall.transcriptStored).toBe(false);
  });
});

describe('VoiceWebhookIngestService replay protection', () => {
  const events = {
    persistOrGet: jest.fn(),
    markQueued: jest.fn(),
  };
  const correlation = {
    resolveFromElevenLabsPayload: jest.fn().mockResolvedValue({ organizationId: ORG }),
    assertOrganizationMatch: jest.fn(),
  };
  const queue = { enqueue: jest.fn() };
  let service: VoiceWebhookIngestService;

  beforeEach(() => {
    jest.clearAllMocks();
    events.persistOrGet.mockResolvedValue({
      event: { id: 'evt-1' },
      created: true,
    });
    service = new VoiceWebhookIngestService(
      events as never,
      correlation as never,
      queue as never,
    );
  });

  it('accepts first post-call webhook', async () => {
    const result = await service.ingestElevenLabsEvent({
      organizationId: ORG,
      externalEventId: 'pc-1',
      eventType: 'elevenlabs.post_call',
      payload: { conversation_id: 'el_conv_123', summary: 'Done' },
      rawBody: Buffer.from('{}'),
    });
    expect(result.duplicate).toBe(false);
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('skips duplicate post-call webhook', async () => {
    events.persistOrGet.mockResolvedValueOnce({
      event: { id: 'evt-existing' },
      created: false,
    });
    const result = await service.ingestElevenLabsEvent({
      organizationId: ORG,
      externalEventId: 'pc-1',
      eventType: 'elevenlabs.post_call',
      payload: { conversation_id: 'el_conv_123' },
      rawBody: Buffer.from('{}'),
    });
    expect(result.duplicate).toBe(true);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe('ElevenLabs webhook signature validation', () => {
  it('rejects invalid signature for post-call webhook', () => {
    expect(
      validateElevenLabsWebhookSignature({
        rawBody: Buffer.from('{"conversation_id":"x"}'),
        signatureHeader: 't=1,v0=deadbeef',
        secret: 'test-secret',
      }),
    ).toBe(false);
  });
});
