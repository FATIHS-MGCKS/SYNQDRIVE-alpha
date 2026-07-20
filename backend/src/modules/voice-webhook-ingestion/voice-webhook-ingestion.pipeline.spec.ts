import { NotFoundException } from '@nestjs/common';
import {
  VoiceControlPlaneProvider,
  VoiceConversationLifecycleState,
  VoiceConversationOutcome,
  VoiceConversationStatus,
  VoiceWebhookErrorClass,
} from '@prisma/client';
import { VoiceWebhookCorrelationService } from './voice-webhook-correlation.service';
import { VoiceConversationLifecycleService } from './voice-conversation-lifecycle.service';
import { VoiceWebhookIngestService } from './voice-webhook-ingest.service';
import { VoiceWebhookProcessingService } from './voice-webhook-processing.service';
import { VOICE_WEBHOOK_EVENT_TYPES } from './voice-webhook-ingestion.constants';

describe('Voice webhook ingestion pipeline', () => {
  const ORG = 'org-1';
  const EVENT_ID = 'evt-1';

  const events = {
    persistOrGet: jest.fn(),
    markQueued: jest.fn(),
    findById: jest.fn(),
    updateCorrelation: jest.fn(),
    markProcessed: jest.fn(),
    markFailed: jest.fn(),
    markDeadLetter: jest.fn(),
  };

  const queue = {
    enqueue: jest.fn(),
  };

  const rollout = {
    evaluateSurface: jest.fn().mockResolvedValue({ allowed: true, blockers: [] }),
  };

  let ingest: VoiceWebhookIngestService;
  let processing: VoiceWebhookProcessingService;
  let correlation: VoiceWebhookCorrelationService;
  let lifecycle: VoiceConversationLifecycleService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      voiceConversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      voiceAssistant: { findFirst: jest.fn() },
      voiceAgentDeployment: { findFirst: jest.fn() },
      voiceToolExecution: { findFirst: jest.fn() },
    };

    correlation = new VoiceWebhookCorrelationService(prisma);
    lifecycle = new VoiceConversationLifecycleService(prisma, {
      recordConversationUsage: jest.fn(),
    } as any, {
      onConversationProgress: jest.fn(),
      releaseConversationSlot: jest.fn(),
    } as any, {
      evaluateThresholds: jest.fn(),
    } as any);
    ingest = new VoiceWebhookIngestService(events as never, correlation, queue as never, rollout as never);
    processing = new VoiceWebhookProcessingService(
      events as never,
      lifecycle,
      correlation,
      queue as never,
    );

    process.env.VOICE_WEBHOOK_INGESTION_ENABLED = 'true';
  });

  it('ingests a new twilio event and queues processing', async () => {
    events.persistOrGet.mockResolvedValue({
      event: { id: EVENT_ID },
      created: true,
    });
    prisma.voiceConversation.findFirst.mockResolvedValue(null);
    prisma.voiceAssistant.findFirst.mockResolvedValue(null);

    const result = await ingest.ingestTwilioEvent({
      organizationId: ORG,
      externalEventId: 'CA1:status:ringing',
      eventType: VOICE_WEBHOOK_EVENT_TYPES.TWILIO_STATUS,
      form: { CallSid: 'CA1', CallStatus: 'ringing', To: '+49123' },
    });

    expect(result.duplicate).toBe(false);
    expect(result.queued).toBe(true);
    expect(events.markQueued).toHaveBeenCalledWith(EVENT_ID);
    expect(queue.enqueue).toHaveBeenCalledWith(EVENT_ID);
  });

  it('treats duplicate provider events as idempotent', async () => {
    events.persistOrGet.mockResolvedValue({
      event: { id: EVENT_ID },
      created: false,
    });

    const result = await ingest.ingestTwilioEvent({
      organizationId: ORG,
      externalEventId: 'CA1:status:ringing',
      eventType: VOICE_WEBHOOK_EVENT_TYPES.TWILIO_STATUS,
      form: { CallSid: 'CA1', CallStatus: 'ringing' },
    });

    expect(result.duplicate).toBe(true);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('applies out-of-order twilio status without regressing lifecycle', async () => {
    const conversation = {
      id: 'conv-1',
      organizationId: ORG,
      twilioCallSid: 'CA1',
      lifecycleState: VoiceConversationLifecycleState.CONNECTED,
      status: VoiceConversationStatus.ACTIVE,
      outcome: VoiceConversationOutcome.PENDING,
      durationSeconds: null,
      metadata: {},
      transcript: null,
    };

    events.findById.mockResolvedValue({
      id: EVENT_ID,
      organizationId: ORG,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.TWILIO_STATUS,
      status: 'QUEUED',
      retryCount: 0,
      redactedPayload: { CallSid: 'CA1', CallStatus: 'ringing' },
      voiceConversationId: 'conv-1',
      twilioCallSid: 'CA1',
      elevenLabsConversationId: null,
      agentDeploymentId: null,
      phoneNumberId: null,
      customerId: null,
      bookingId: null,
    });

    prisma.voiceConversation.findFirst.mockResolvedValue(conversation);
    prisma.voiceConversation.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...conversation,
      ...data,
      lifecycleState: data.lifecycleState ?? conversation.lifecycleState,
    }));

    await processing.processEventId(EVENT_ID);

    expect(prisma.voiceConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          lifecycleState: VoiceConversationLifecycleState.RINGING,
        }),
      }),
    );
    expect(events.markProcessed).toHaveBeenCalledWith(EVENT_ID);
  });

  it('rejects cross-tenant correlation during processing', async () => {
    events.findById.mockResolvedValue({
      id: EVENT_ID,
      organizationId: ORG,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.INTERNAL_CONVERSATION,
      status: 'QUEUED',
      retryCount: 0,
      redactedPayload: {
        voiceConversationId: 'conv-1',
        lifecycleState: VoiceConversationLifecycleState.AI_ACTIVE,
      },
      voiceConversationId: 'conv-1',
      twilioCallSid: null,
      elevenLabsConversationId: null,
      agentDeploymentId: null,
      phoneNumberId: null,
      customerId: null,
      bookingId: null,
    });

    prisma.voiceConversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-other',
      lifecycleState: VoiceConversationLifecycleState.CREATED,
    });

    jest.spyOn(correlation, 'resolveFromInternalEvent').mockResolvedValue({
      organizationId: 'org-other',
      voiceConversationId: 'conv-1',
    });

    await expect(processing.processEventId(EVENT_ID)).rejects.toThrow('Cross-tenant');
    expect(events.markFailed).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({ errorClass: VoiceWebhookErrorClass.TENANT_MISMATCH }),
    );
  });

  it('moves poison events to dead letter after retry budget', async () => {
    events.findById.mockResolvedValue({
      id: EVENT_ID,
      organizationId: ORG,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.TWILIO_STATUS,
      status: 'FAILED',
      retryCount: 4,
      redactedPayload: { CallSid: 'CA1', CallStatus: 'ringing' },
      voiceConversationId: null,
      twilioCallSid: 'CA1',
      elevenLabsConversationId: null,
      agentDeploymentId: null,
      phoneNumberId: null,
      customerId: null,
      bookingId: null,
    });

    jest.spyOn(lifecycle, 'applyWebhookEvent').mockRejectedValue(new Error('poison payload'));

    await processing.processEventId(EVENT_ID);

    expect(events.markDeadLetter).toHaveBeenCalled();
  });

  it('skips already processed events unless replayed', async () => {
    events.findById.mockResolvedValue({
      id: EVENT_ID,
      status: 'PROCESSED',
      retryCount: 0,
      redactedPayload: {},
    });

    await processing.processEventId(EVENT_ID, false);
    expect(events.markProcessed).not.toHaveBeenCalled();
  });

  it('throws when replay target is missing', async () => {
    events.findById.mockResolvedValue(null);
    await expect(processing.processEventId('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ingests MCP tool execution internal events', async () => {
    events.persistOrGet.mockResolvedValue({ event: { id: EVENT_ID }, created: true });
    prisma.voiceConversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      organizationId: ORG,
      lifecycleState: VoiceConversationLifecycleState.CONNECTED,
    });

    const result = await ingest.ingestMcpToolExecutionEvent({
      organizationId: ORG,
      externalEventId: 'exec-1:mcp-tool',
      payload: {
        voiceConversationId: 'conv-1',
        toolExecutionId: 'exec-1',
        toolName: 'get_customer_summary',
        status: 'SUCCEEDED',
      },
    });

    expect(result.accepted).toBe(true);
    expect(events.persistOrGet).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: VoiceControlPlaneProvider.MCP,
        eventType: VOICE_WEBHOOK_EVENT_TYPES.MCP_TOOL_EXECUTION,
      }),
    );
  });
});
