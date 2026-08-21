import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
  PrismaClient,
  VoiceConversationDirection,
  VoiceConversationLifecycleState,
  VoiceConversationOutcome,
  VoiceConversationStatus,
  VoiceToolExecutionStatus,
} from '@prisma/client';
import communicationProjectionConfig from '@config/communication-projection.config';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationConversationRepository } from '../../communication-conversation.repository';
import { CommunicationEventRepository } from '../../communication-event.repository';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationTenantContextValidation } from '../../communication-tenant-context.validation';
import { TwilioVoiceCommunicationAdapter } from './twilio-voice-communication.adapter';
import { ElevenLabsVoiceCommunicationAdapter } from './elevenlabs-voice-communication.adapter';
import { VoiceCommunicationProjectionIntegration } from './voice-communication-projection.integration';
import { VOICE_WEBHOOK_EVENT_TYPES } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.constants';
import { VoiceMcpActionOrchestratorService } from '@modules/voice-mcp-gateway/voice-mcp-action-orchestrator.service';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Voice canonical projection postgres integration', () => {
  let prisma: PrismaClient;
  let integration: VoiceCommunicationProjectionIntegration;
  let orgId: string;
  let orgBId: string;
  let voiceConversationId: string;

  beforeAll(async () => {
    process.env.COMMUNICATION_CENTER_VOICE_PROJECTION_ENABLED = 'true';
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [communicationProjectionConfig] })],
      providers: [
        PrismaService,
        CommunicationTenantContextValidation,
        CommunicationConversationRepository,
        CommunicationEventRepository,
        CommunicationProjectionService,
        CommunicationProjectionFeatureService,
        TwilioVoiceCommunicationAdapter,
        ElevenLabsVoiceCommunicationAdapter,
        VoiceCommunicationProjectionIntegration,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    integration = moduleRef.get(VoiceCommunicationProjectionIntegration);
  });

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: {
        companyName: `Voice C4 PG ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgId = org.id;

    const orgB = await prisma.organization.create({
      data: {
        companyName: `Voice C4 PG B ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgBId = orgB.id;

    const voiceConvo = await prisma.voiceConversation.create({
      data: {
        organizationId: orgId,
        direction: VoiceConversationDirection.INBOUND,
        status: VoiceConversationStatus.ACTIVE,
        lifecycleState: VoiceConversationLifecycleState.CREATED,
        outcome: VoiceConversationOutcome.PENDING,
        twilioCallSid: `CA${Date.now()}`,
        metadata: {},
      },
    });
    voiceConversationId = voiceConvo.id;
  });

  afterEach(async () => {
    await prisma.communicationEvent.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.communicationConversation.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.voiceConversation.deleteMany({
      where: { organizationId: { in: [orgId, orgBId] } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, orgBId] } } });
  });

  afterAll(async () => {
    delete process.env.COMMUNICATION_CENTER_VOICE_PROJECTION_ENABLED;
    await prisma.$disconnect();
  });

  it('converges Twilio + ElevenLabs events into one canonical VOICE conversation', async () => {
    let conversation = await prisma.voiceConversation.findUniqueOrThrow({
      where: { id: voiceConversationId },
    });

    await integration.projectFromProcessedWebhook({
      organizationId: orgId,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.TWILIO_VOICE_INBOUND,
      externalEventId: `${conversation.twilioCallSid}:voice`,
      provider: 'TWILIO',
      conversation,
      payload: {},
    });

    await integration.projectFromProcessedWebhook({
      organizationId: orgId,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.TWILIO_STATUS,
      externalEventId: `${conversation.twilioCallSid}:status:ringing`,
      provider: 'TWILIO',
      conversation,
      payload: { CallStatus: 'ringing' },
    });

    conversation = await prisma.voiceConversation.update({
      where: { id: voiceConversationId },
      data: { lifecycleState: VoiceConversationLifecycleState.CONNECTED },
    });
    await integration.projectFromProcessedWebhook({
      organizationId: orgId,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.TWILIO_STATUS,
      externalEventId: `${conversation.twilioCallSid}:status:in-progress`,
      provider: 'TWILIO',
      conversation,
      payload: { CallStatus: 'in-progress' },
    });

    conversation = await prisma.voiceConversation.update({
      where: { id: voiceConversationId },
      data: { lifecycleState: VoiceConversationLifecycleState.AI_ACTIVE },
    });
    await integration.projectFromProcessedWebhook({
      organizationId: orgId,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.ELEVENLABS_CONVERSATION,
      externalEventId: 'el:conv:multi:1',
      provider: 'ELEVENLABS',
      conversation,
      payload: { status: 'in_progress' },
    });

    conversation = await prisma.voiceConversation.update({
      where: { id: voiceConversationId },
      data: {
        lifecycleState: VoiceConversationLifecycleState.FINALIZED,
        status: VoiceConversationStatus.COMPLETED,
        outcome: VoiceConversationOutcome.RESOLVED,
        durationSeconds: 120,
        summary: 'resolved',
        transcript: 'Customer confirmed pickup.',
      },
    });
    await integration.projectFromProcessedWebhook({
      organizationId: orgId,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.ELEVENLABS_POST_CALL,
      externalEventId: 'el:postcall:multi:1',
      provider: 'ELEVENLABS',
      conversation,
      payload: { status: 'done', transcript: 'Customer confirmed pickup.' },
    });

    const canonicalConversations = await prisma.communicationConversation.findMany({
      where: { organizationId: orgId, channel: CommunicationChannel.VOICE },
    });
    expect(canonicalConversations).toHaveLength(1);
    expect(canonicalConversations[0]?.nativeConversationId).toBe(voiceConversationId);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgId, conversationId: canonicalConversations[0]!.id },
      orderBy: { occurredAt: 'asc' },
    });
    const types = events.map((e) => e.eventType);
    expect(types.filter((t) => t === CommunicationEventType.CALL_STARTED)).toHaveLength(1);
    expect(types).toContain(CommunicationEventType.CALL_CONNECTED);
    expect(types).toContain(CommunicationEventType.CALL_ENDED);
    expect(types).not.toContain(CommunicationEventType.AI_INTENT_DETECTED);

    const providers = new Set(events.map((e) => e.providerIdentity));
    expect(providers.has(CommunicationProviderIdentity.TWILIO)).toBe(true);
    expect(providers.has(CommunicationProviderIdentity.ELEVENLABS)).toBe(true);

    expect(events.some((e) => JSON.stringify(e).includes('Customer confirmed'))).toBe(false);
  });

  it('replays HUMAN_REQUIRED per transition occurrence without duplicate on replay', async () => {
    const firstTransition = await prisma.voiceConversation.update({
      where: { id: voiceConversationId },
      data: {
        escalationReason: 'CALLBACK_REQUESTED',
        outcome: VoiceConversationOutcome.ESCALATED,
      },
    });

    await integration.projectEscalationTransition(firstTransition, 'CALLBACK_REQUESTED', null);
    await integration.projectEscalationTransition(firstTransition, 'CALLBACK_REQUESTED', null);

    const canonical = await prisma.communicationConversation.findFirst({
      where: { organizationId: orgId, nativeConversationId: voiceConversationId },
    });
    const hrEvents = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgId,
        conversationId: canonical!.id,
        eventType: CommunicationEventType.HUMAN_REQUIRED,
      },
    });
    expect(hrEvents).toHaveLength(1);
    expect(canonical?.status).toBe('HUMAN_REQUIRED');
  });

  it('allows a second HUMAN_REQUIRED for a distinct escalation transition', async () => {
    const firstTransition = await prisma.voiceConversation.update({
      where: { id: voiceConversationId },
      data: {
        escalationReason: 'CALLBACK_REQUESTED',
        outcome: VoiceConversationOutcome.ESCALATED,
      },
    });
    await integration.projectEscalationTransition(firstTransition, 'CALLBACK_REQUESTED', null);

    await prisma.voiceConversation.update({
      where: { id: voiceConversationId },
      data: { escalationReason: null },
    });

    const secondTransition = await prisma.voiceConversation.update({
      where: { id: voiceConversationId },
      data: {
        escalationReason: 'CALLBACK_REQUESTED',
        outcome: VoiceConversationOutcome.ESCALATED,
        updatedAt: new Date(Date.now() + 60_000),
      },
    });
    await integration.projectEscalationTransition(
      secondTransition,
      'CALLBACK_REQUESTED',
      null,
    );

    const canonical = await prisma.communicationConversation.findFirst({
      where: { organizationId: orgId, nativeConversationId: voiceConversationId },
    });
    const hrEvents = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgId,
        conversationId: canonical!.id,
        eventType: CommunicationEventType.HUMAN_REQUIRED,
      },
    });
    expect(hrEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('converges orchestrator and webhook tool completion into one AI_ACTION_COMPLETED', async () => {
    const conversation = await prisma.voiceConversation.findUniqueOrThrow({
      where: { id: voiceConversationId },
    });
    const executionId = `exec-${Date.now()}`;

    await integration.projectToolExecution({
      conversation,
      execution: {
        id: executionId,
        organizationId: orgId,
        voiceConversationId: voiceConversationId,
        toolName: 'get_customer_summary',
        status: VoiceToolExecutionStatus.SUCCEEDED,
        riskClass: 'READ_ONLY',
        requestHash: 'hash',
        idempotencyKey: `${voiceConversationId}:tool`,
        redactedInput: null,
        redactedOutput: null,
        errorCode: null,
        errorMessage: null,
        durationMs: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      occurredAt: new Date(),
    });

    await integration.projectFromProcessedWebhook({
      organizationId: orgId,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.MCP_TOOL_EXECUTION,
      externalEventId: `${executionId}:mcp-tool`,
      provider: 'MCP',
      conversation,
      payload: {
        toolExecutionId: executionId,
        toolName: 'get_customer_summary',
        status: 'SUCCEEDED',
      },
    });

    const canonical = await prisma.communicationConversation.findFirst({
      where: { organizationId: orgId, nativeConversationId: voiceConversationId },
    });
    const completedEvents = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgId,
        conversationId: canonical!.id,
        eventType: CommunicationEventType.AI_ACTION_COMPLETED,
      },
    });
    expect(completedEvents).toHaveLength(1);
  });

  it('rejects cross-org escalation mutation via tenant-scoped updateMany', async () => {
    const foreignConversation = await prisma.voiceConversation.create({
      data: {
        organizationId: orgBId,
        direction: VoiceConversationDirection.INBOUND,
        status: VoiceConversationStatus.ACTIVE,
        lifecycleState: VoiceConversationLifecycleState.AI_ACTIVE,
        outcome: VoiceConversationOutcome.PENDING,
        metadata: {},
      },
    });

    const result = await prisma.voiceConversation.updateMany({
      where: { id: foreignConversation.id, organizationId: orgId },
      data: {
        escalationReason: 'CALLBACK_REQUESTED',
        outcome: VoiceConversationOutcome.ESCALATED,
      },
    });
    expect(result.count).toBe(0);

    const unchanged = await prisma.voiceConversation.findUniqueOrThrow({
      where: { id: foreignConversation.id },
    });
    expect(unchanged.escalationReason).toBeNull();
    expect(unchanged.outcome).toBe(VoiceConversationOutcome.PENDING);
  });

  it('does not create canonical call events for dry-run outbound metadata only', async () => {
    await prisma.voiceConversation.create({
      data: {
        organizationId: orgId,
        direction: VoiceConversationDirection.OUTBOUND,
        status: VoiceConversationStatus.ACTIVE,
        lifecycleState: VoiceConversationLifecycleState.INITIATED,
        outcome: VoiceConversationOutcome.PENDING,
        metadata: { dryRun: true, outboundIdempotencyKey: `dry-${Date.now()}` },
      },
    });

    const canonical = await prisma.communicationConversation.findMany({
      where: { organizationId: orgId, channel: CommunicationChannel.VOICE },
    });
    expect(canonical).toHaveLength(0);
  });
});

describePg('VoiceMcpActionOrchestratorService tenant escalation postgres', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('does not mutate foreign-org conversation on callback escalation path', async () => {
    const orgA = await prisma.organization.create({
      data: { companyName: `Esc A ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const orgB = await prisma.organization.create({
      data: { companyName: `Esc B ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const foreignConvo = await prisma.voiceConversation.create({
      data: {
        organizationId: orgB.id,
        direction: VoiceConversationDirection.INBOUND,
        status: VoiceConversationStatus.ACTIVE,
        lifecycleState: VoiceConversationLifecycleState.AI_ACTIVE,
        outcome: VoiceConversationOutcome.PENDING,
      },
    });

    const orchestrator = new VoiceMcpActionOrchestratorService(
      {
        createProposal: jest.fn(),
        consume: jest.fn().mockResolvedValue(undefined),
        summarizeAction: jest.fn(),
      } as never,
      { createPendingStaffApproval: jest.fn() } as never,
      {
        executeDomainAction: jest.fn().mockResolvedValue({ taskRef: 'ABCD1234' }),
      } as never,
      {
        persistOrGet: jest.fn().mockResolvedValue({
          execution: { id: 'exec-esc', status: 'PENDING' },
          created: true,
        }),
        markRunning: jest.fn(),
        complete: jest.fn().mockResolvedValue({
          id: 'exec-esc',
          status: 'SUCCEEDED',
          toolName: 'create_callback_request',
          updatedAt: new Date(),
        }),
      } as never,
      prisma as never,
    );

    const context = {
      organizationId: orgA.id,
      voiceAssistantId: 'assistant-1',
      agentDeploymentId: 'deploy-1',
      conversationId: foreignConvo.id,
      allowedTools: ['create_callback_request'],
      scopes: [],
      issuedAt: 1,
      expiresAt: 2,
      nonce: 'nonce',
      requestId: 'req-1',
      correlationId: 'corr-1',
    };

    await expect(
      orchestrator.executeWriteTool(context as never, 'create_callback_request', {
        preferredPhone: '+491701234567',
        confirmationToken: 'confirm-1',
      }),
    ).rejects.toMatchObject({ code: 'DataUnavailable' });

    const unchanged = await prisma.voiceConversation.findUniqueOrThrow({
      where: { id: foreignConvo.id },
    });
    expect(unchanged.escalationReason).toBeNull();

    await prisma.voiceConversation.delete({ where: { id: foreignConvo.id } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
  });
});
