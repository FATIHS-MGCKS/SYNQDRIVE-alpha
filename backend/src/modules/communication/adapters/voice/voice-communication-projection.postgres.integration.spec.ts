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

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Voice canonical projection postgres integration', () => {
  let prisma: PrismaClient;
  let integration: VoiceCommunicationProjectionIntegration;
  let orgId: string;
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

    const voiceConvo = await prisma.voiceConversation.create({
      data: {
        organizationId: orgId,
        direction: VoiceConversationDirection.INBOUND,
        status: VoiceConversationStatus.ACTIVE,
        lifecycleState: VoiceConversationLifecycleState.CREATED,
        outcome: VoiceConversationOutcome.PENDING,
        twilioCallSid: `CA${Date.now()}`,
        metadata: { customerId: 'cust-1' },
      },
    });
    voiceConversationId = voiceConvo.id;
  });

  afterEach(async () => {
    await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.voiceConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
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
    expect(types).toContain(CommunicationEventType.CALL_STARTED);
    expect(types).toContain(CommunicationEventType.CALL_CONNECTED);
    expect(types).toContain(CommunicationEventType.AI_INTENT_DETECTED);
    expect(types).toContain(CommunicationEventType.CALL_ENDED);

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
        lifecycleState: VoiceConversationLifecycleState.TRANSFERRING,
      },
    });

    await integration.projectEscalationTransition(
      firstTransition,
      'CALLBACK_REQUESTED',
      null,
    );
    await integration.projectEscalationTransition(
      firstTransition,
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
    expect(hrEvents).toHaveLength(1);
    expect(canonical?.status).toBe('HUMAN_REQUIRED');
  });
});
