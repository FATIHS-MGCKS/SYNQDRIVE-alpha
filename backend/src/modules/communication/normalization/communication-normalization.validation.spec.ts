import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import { buildCanonicalIdempotencyKey } from './communication-idempotency';
import { CommunicationNormalizationErrorCode } from './communication-normalization.errors';
import { validateNormalizedCommunicationInput } from './communication-normalization.validation';
import type { NormalizedCommunicationInput } from './communication-normalization.types';

function whatsAppInput(
  overrides: {
    envelope?: Partial<NormalizedCommunicationInput['envelope']>;
    event?: Partial<NormalizedCommunicationInput['event']>;
    projection?: NormalizedCommunicationInput['projection'];
    persist?: boolean;
  } = {},
): NormalizedCommunicationInput {
  const envelope = {
    organizationId: 'org-1',
    channel: CommunicationChannel.WHATSAPP,
    nativeConversationId: 'wa-conv-native-1',
    ...overrides.envelope,
  };
  const baseEvent = {
    eventType: CommunicationEventType.MESSAGE_RECEIVED,
    occurredAt: new Date('2026-08-21T10:00:00Z'),
    direction: CommunicationDirection.INBOUND,
    providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
    providerMessageId: 'wamid-1',
    idempotencyKey: buildCanonicalIdempotencyKey({
      organizationId: envelope.organizationId,
      channel: envelope.channel,
      providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      nativeConversationId: envelope.nativeConversationId,
      providerMessageId: 'wamid-1',
    }),
  };
  const event = { ...baseEvent, ...overrides.event };
  return {
    envelope,
    event,
    projection: overrides.projection,
    persist: overrides.persist,
  };
}

describe('validateNormalizedCommunicationInput', () => {
  it('accepts valid WhatsApp normalized event', () => {
    const result = validateNormalizedCommunicationInput(whatsAppInput());
    expect(result.envelope.channel).toBe(CommunicationChannel.WHATSAPP);
    expect(result.event.providerIdentity).toBe(CommunicationProviderIdentity.META_WHATSAPP);
  });

  it('accepts valid Voice/Twilio event', () => {
    const result = validateNormalizedCommunicationInput(
      whatsAppInput({
        envelope: {
          organizationId: 'org-1',
          channel: CommunicationChannel.VOICE,
          nativeConversationId: 'voice-native-1',
        },
        event: {
          eventType: CommunicationEventType.CALL_STARTED,
          occurredAt: new Date('2026-08-21T10:00:00Z'),
          providerIdentity: CommunicationProviderIdentity.TWILIO,
          providerEventId: 'CA123',
          idempotencyKey: buildCanonicalIdempotencyKey({
            organizationId: 'org-1',
            channel: CommunicationChannel.VOICE,
            providerIdentity: CommunicationProviderIdentity.TWILIO,
            eventType: CommunicationEventType.CALL_STARTED,
            nativeConversationId: 'voice-native-1',
            providerEventId: 'CA123',
          }),
        },
      }),
    );
    expect(result.event.eventType).toBe(CommunicationEventType.CALL_STARTED);
  });

  it('accepts valid Voice/ElevenLabs event', () => {
    const result = validateNormalizedCommunicationInput(
      whatsAppInput({
        envelope: {
          organizationId: 'org-1',
          channel: CommunicationChannel.VOICE,
          nativeConversationId: 'voice-native-1',
        },
        event: {
          eventType: CommunicationEventType.AI_INTENT_DETECTED,
          occurredAt: new Date('2026-08-21T10:01:00Z'),
          providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
          providerEventId: 'el-event-1',
          idempotencyKey: buildCanonicalIdempotencyKey({
            organizationId: 'org-1',
            channel: CommunicationChannel.VOICE,
            providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
            eventType: CommunicationEventType.AI_INTENT_DETECTED,
            nativeConversationId: 'voice-native-1',
            providerEventId: 'el-event-1',
          }),
        },
      }),
    );
    expect(result.event.providerIdentity).toBe(CommunicationProviderIdentity.ELEVENLABS);
  });

  it('accepts valid SMS/SENT_DM contract event', () => {
    const result = validateNormalizedCommunicationInput(
      whatsAppInput({
        envelope: {
          organizationId: 'org-1',
          channel: CommunicationChannel.SMS,
          nativeConversationId: 'sms-native-1',
        },
        event: {
          eventType: CommunicationEventType.MESSAGE_SENT,
          occurredAt: new Date('2026-08-21T10:02:00Z'),
          providerIdentity: CommunicationProviderIdentity.SENT_DM,
          providerEventId: 'sdm-evt-1',
          idempotencyKey: buildCanonicalIdempotencyKey({
            organizationId: 'org-1',
            channel: CommunicationChannel.SMS,
            providerIdentity: CommunicationProviderIdentity.SENT_DM,
            eventType: CommunicationEventType.MESSAGE_SENT,
            nativeConversationId: 'sms-native-1',
            providerEventId: 'sdm-evt-1',
          }),
        },
      }),
    );
    expect(result.envelope.channel).toBe(CommunicationChannel.SMS);
  });

  it('rejects invalid empty nativeConversationId', () => {
    expect(() =>
      validateNormalizedCommunicationInput(
        whatsAppInput({
          envelope: {
            organizationId: 'org-1',
            channel: CommunicationChannel.WHATSAPP,
            nativeConversationId: '   ',
          },
        }),
      ),
    ).toThrow(/nativeConversationId is required/);
  });

  it('rejects invalid metadata/raw payload field', () => {
    expect(() =>
      validateNormalizedCommunicationInput(
        whatsAppInput({
          event: {
            metadata: { messageBody: 'secret' } as any,
          },
        }),
      ),
    ).toThrow(/not permitted/);
  });

  it('rejects invalid provider/channel capability', () => {
    expect(() =>
      validateNormalizedCommunicationInput(
        whatsAppInput({
          event: {
            providerIdentity: CommunicationProviderIdentity.TWILIO,
          },
        }),
      ),
    ).toThrow(/does not support channel WHATSAPP/);
  });

  it('rejects Email conversation projection', () => {
    try {
      validateNormalizedCommunicationInput(
        whatsAppInput({
          envelope: {
            organizationId: 'org-1',
            channel: CommunicationChannel.EMAIL,
            nativeConversationId: 'email-1',
          },
          event: {
            eventType: CommunicationEventType.MESSAGE_SENT,
            occurredAt: new Date(),
            providerIdentity: CommunicationProviderIdentity.RESEND,
            providerEventId: 'resend-1',
            idempotencyKey: buildCanonicalIdempotencyKey({
              organizationId: 'org-1',
              channel: CommunicationChannel.EMAIL,
              providerIdentity: CommunicationProviderIdentity.RESEND,
              eventType: CommunicationEventType.MESSAGE_SENT,
              nativeConversationId: 'email-1',
              providerEventId: 'resend-1',
            }),
          },
        }),
      );
      fail('expected EMAIL_CONVERSATION_DEFERRED');
    } catch (error: any) {
      expect(error.code).toBe(CommunicationNormalizationErrorCode.EMAIL_CONVERSATION_DEFERRED);
    }
  });

  it('allows Email normalized contract validation when persist=false', () => {
    const result = validateNormalizedCommunicationInput(
      whatsAppInput({
        persist: false,
        envelope: {
          organizationId: 'org-1',
          channel: CommunicationChannel.EMAIL,
          nativeConversationId: 'outbound-email-1',
        },
        event: {
          eventType: CommunicationEventType.MESSAGE_DELIVERED,
          occurredAt: new Date(),
          providerIdentity: CommunicationProviderIdentity.RESEND,
          providerEventId: 'resend-1',
          idempotencyKey: buildCanonicalIdempotencyKey({
            organizationId: 'org-1',
            channel: CommunicationChannel.EMAIL,
            providerIdentity: CommunicationProviderIdentity.RESEND,
            eventType: CommunicationEventType.MESSAGE_DELIVERED,
            nativeConversationId: 'outbound-email-1',
            providerEventId: 'resend-1',
          }),
        },
      }),
    );
    expect(result.persist).toBe(false);
  });
});
