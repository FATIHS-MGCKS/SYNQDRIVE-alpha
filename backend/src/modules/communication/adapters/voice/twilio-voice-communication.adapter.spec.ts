import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
  VoiceConversationDirection,
  VoiceConversationLifecycleState,
  VoiceConversationOutcome,
  VoiceConversationStatus,
} from '@prisma/client';
import { TwilioVoiceCommunicationAdapter } from './twilio-voice-communication.adapter';
import { ElevenLabsVoiceCommunicationAdapter } from './elevenlabs-voice-communication.adapter';

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'voice-convo-native-1',
    organizationId: 'org-1',
    voiceAssistantId: 'assistant-1',
    providerConversationId: 'el-provider-1',
    elevenLabsConvId: 'el-provider-1',
    twilioCallSid: 'CA123',
    callerNumber: '+491701234567',
    direction: VoiceConversationDirection.INBOUND,
    durationSeconds: null,
    status: VoiceConversationStatus.ACTIVE,
    lifecycleState: VoiceConversationLifecycleState.INITIATED,
    outcome: VoiceConversationOutcome.PENDING,
    transcript: null,
    summary: null,
    escalationReason: null,
    actionsPerformed: [],
    errorMessage: null,
    metadata: { customerId: 'cust-1', bookingId: 'book-1' },
    startedAt: new Date('2026-08-21T10:00:00Z'),
    endedAt: null,
    createdAt: new Date('2026-08-21T10:00:00Z'),
    updatedAt: new Date('2026-08-21T10:00:00Z'),
    ...overrides,
  } as any;
}

describe('TwilioVoiceCommunicationAdapter', () => {
  const adapter = new TwilioVoiceCommunicationAdapter();

  it('uses VoiceConversation.id as nativeConversationId, not CallSid', () => {
    const result = adapter.fromCallStarted({
      conversation: conversation({ twilioCallSid: 'CA999' }),
      providerEventId: 'CA999:status:initiated',
      occurredAt: new Date('2026-08-21T10:00:00Z'),
    });
    expect(result.envelope.nativeConversationId).toBe('voice-convo-native-1');
    expect(result.envelope.nativeConversationId).not.toBe('CA999');
    expect(result.envelope.channel).toBe(CommunicationChannel.VOICE);
  });

  it('maps inbound call started with OUTBOUND/INBOUND direction', () => {
    const inbound = adapter.fromCallStarted({
      conversation: conversation({ direction: VoiceConversationDirection.INBOUND }),
      providerEventId: 'CA123:voice',
      occurredAt: new Date('2026-08-21T10:00:00Z'),
      includeInitialStatus: true,
    });
    expect(inbound.event.eventType).toBe(CommunicationEventType.CALL_STARTED);
    expect(inbound.event.direction).toBe(CommunicationDirection.INBOUND);
    expect(inbound.projection?.status).toBeUndefined();

    const outbound = adapter.fromCallConnected({
      conversation: conversation({ direction: VoiceConversationDirection.OUTBOUND }),
      providerEventId: 'CA123:status:in-progress',
      occurredAt: new Date('2026-08-21T10:01:00Z'),
    });
    expect(outbound.event.direction).toBe(CommunicationDirection.OUTBOUND);
  });

  it('does not patch status on connected lifecycle event', () => {
    const result = adapter.fromCallConnected({
      conversation: conversation({ lifecycleState: VoiceConversationLifecycleState.CONNECTED }),
      providerEventId: 'CA123:status:in-progress',
      occurredAt: new Date('2026-08-21T10:01:00Z'),
    });
    expect(result.event.eventType).toBe(CommunicationEventType.CALL_CONNECTED);
    expect(result.projection?.status).toBeUndefined();
    expect(result.envelope.initialStatus).toBeUndefined();
  });
});

describe('ElevenLabsVoiceCommunicationAdapter', () => {
  const adapter = new ElevenLabsVoiceCommunicationAdapter();

  it('maps AI intent without status regression patch', () => {
    const result = adapter.fromAiIntentDetected({
      conversation: conversation({ lifecycleState: VoiceConversationLifecycleState.AI_ACTIVE }),
      providerEventId: 'el:event:ai-active',
      occurredAt: new Date('2026-08-21T10:02:00Z'),
      intentCode: 'IN_PROGRESS',
    });
    expect(result.event.eventType).toBe(CommunicationEventType.AI_INTENT_DETECTED);
    expect(result.event.providerIdentity).toBe(CommunicationProviderIdentity.ELEVENLABS);
    expect(result.projection?.status).toBeUndefined();
  });

  it('scopes HUMAN_REQUIRED idempotency to transition occurrence', () => {
    const firstAt = new Date('2026-08-21T10:05:00.000Z');
    const secondAt = new Date('2026-08-21T11:00:00.000Z');
    const first = adapter.fromHumanRequired({
      conversation: conversation({ updatedAt: firstAt }),
      providerEventId: `voice-human:voice-convo-native-1:${firstAt.toISOString()}`,
      occurredAt: firstAt,
      handoffReasonCode: 'CALLBACK_REQUESTED',
      providerIdentity: 'ELEVENLABS',
    });
    const replay = adapter.fromHumanRequired({
      conversation: conversation({ updatedAt: firstAt }),
      providerEventId: `voice-human:voice-convo-native-1:${firstAt.toISOString()}`,
      occurredAt: firstAt,
      handoffReasonCode: 'CALLBACK_REQUESTED',
      providerIdentity: 'ELEVENLABS',
    });
    const later = adapter.fromHumanRequired({
      conversation: conversation({ updatedAt: secondAt }),
      providerEventId: `voice-human:voice-convo-native-1:${secondAt.toISOString()}`,
      occurredAt: secondAt,
      handoffReasonCode: 'CALLBACK_REQUESTED',
      providerIdentity: 'ELEVENLABS',
    });
    expect(first.event.idempotencyKey).toBe(replay.event.idempotencyKey);
    expect(first.event.idempotencyKey).not.toBe(later.event.idempotencyKey);
  });
});
