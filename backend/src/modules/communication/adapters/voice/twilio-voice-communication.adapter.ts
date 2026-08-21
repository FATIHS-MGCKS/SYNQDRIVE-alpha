import { Injectable } from '@nestjs/common';
import {
  CommunicationActorType,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import type { NormalizedCommunicationInput } from '../../normalization/communication-normalization.types';
import type { TelephonyProviderNormalizationPort } from '../../ports/telephony-normalization.port';
import type { TwilioVoiceProjectionSource } from './voice-communication.types';
import {
  assertVoiceConversation,
  buildVoiceEnvelope,
  buildVoiceIdempotencyKey,
  resolveVoiceDirection,
  sanitizeVoiceFailureCode,
} from './voice-communication.shared';

@Injectable()
export class TwilioVoiceCommunicationAdapter implements TelephonyProviderNormalizationPort {
  normalizeCallStarted(source: unknown): NormalizedCommunicationInput {
    return this.fromCallStarted(this.assertSource(source));
  }

  normalizeCallConnected(source: unknown): NormalizedCommunicationInput {
    return this.fromCallConnected(this.assertSource(source));
  }

  normalizeCallEnded(source: unknown): NormalizedCommunicationInput {
    return this.fromCallEnded(this.assertSource(source));
  }

  normalizeCallFailed(source: unknown): NormalizedCommunicationInput {
    return this.fromCallFailed(this.assertSource(source));
  }

  fromCallStarted(source: TwilioVoiceProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    assertVoiceConversation(conversation);
    const providerEventId = source.providerEventId.trim();
    const occurredAt = source.occurredAt;

    return {
      envelope: buildVoiceEnvelope(conversation, {
        includeInitialStatus: source.includeInitialStatus ?? true,
      }),
      event: {
        eventType: CommunicationEventType.CALL_STARTED,
        occurredAt,
        direction: resolveVoiceDirection(conversation),
        providerIdentity: CommunicationProviderIdentity.TWILIO,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity: CommunicationProviderIdentity.TWILIO,
          eventType: CommunicationEventType.CALL_STARTED,
          providerEventId,
        }),
        actorType: CommunicationActorType.SYSTEM,
        metadata: source.telephonyStatusCode
          ? { providerLifecycleState: sanitizeVoiceFailureCode(source.telephonyStatusCode) }
          : undefined,
      },
    };
  }

  fromCallConnected(source: TwilioVoiceProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    assertVoiceConversation(conversation);
    const providerEventId = source.providerEventId.trim();
    const occurredAt = source.occurredAt;

    return {
      envelope: buildVoiceEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.CALL_CONNECTED,
        occurredAt,
        direction: resolveVoiceDirection(conversation),
        providerIdentity: CommunicationProviderIdentity.TWILIO,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity: CommunicationProviderIdentity.TWILIO,
          eventType: CommunicationEventType.CALL_CONNECTED,
          providerEventId,
        }),
        actorType: CommunicationActorType.SYSTEM,
        metadata: source.telephonyStatusCode
          ? { providerLifecycleState: sanitizeVoiceFailureCode(source.telephonyStatusCode) }
          : undefined,
      },
    };
  }

  fromCallEnded(source: TwilioVoiceProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    assertVoiceConversation(conversation);
    const providerEventId = source.providerEventId.trim();
    const occurredAt = source.occurredAt;

    return {
      envelope: buildVoiceEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.CALL_ENDED,
        occurredAt,
        direction: resolveVoiceDirection(conversation),
        providerIdentity: CommunicationProviderIdentity.TWILIO,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity: CommunicationProviderIdentity.TWILIO,
          eventType: CommunicationEventType.CALL_ENDED,
          providerEventId,
        }),
        actorType: CommunicationActorType.SYSTEM,
        metadata: {
          ...(source.durationSeconds && source.durationSeconds > 0
            ? { durationSeconds: source.durationSeconds }
            : {}),
          ...(source.outcomeCode ? { outcomeCode: sanitizeVoiceFailureCode(source.outcomeCode) } : {}),
          ...(source.telephonyStatusCode
            ? { providerLifecycleState: sanitizeVoiceFailureCode(source.telephonyStatusCode) }
            : {}),
        },
      },
    };
  }

  fromCallFailed(source: TwilioVoiceProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    assertVoiceConversation(conversation);
    const providerEventId = source.providerEventId.trim();
    const occurredAt = source.occurredAt;

    return {
      envelope: buildVoiceEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.CALL_FAILED,
        occurredAt,
        direction: resolveVoiceDirection(conversation),
        providerIdentity: CommunicationProviderIdentity.TWILIO,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity: CommunicationProviderIdentity.TWILIO,
          eventType: CommunicationEventType.CALL_FAILED,
          providerEventId,
        }),
        actorType: CommunicationActorType.SYSTEM,
        metadata: {
          ...(source.failureCode ? { failureCode: sanitizeVoiceFailureCode(source.failureCode) } : {}),
          ...(source.outcomeCode ? { outcomeCode: sanitizeVoiceFailureCode(source.outcomeCode) } : {}),
          ...(source.telephonyStatusCode
            ? { providerLifecycleState: sanitizeVoiceFailureCode(source.telephonyStatusCode) }
            : {}),
        },
      },
    };
  }

  private assertSource(source: unknown): TwilioVoiceProjectionSource {
    if (!source || typeof source !== 'object') {
      throw new Error('Twilio voice projection source must be an object');
    }
    const candidate = source as TwilioVoiceProjectionSource;
    if (!candidate.conversation?.id || !candidate.providerEventId) {
      throw new Error('Twilio voice projection source requires conversation and providerEventId');
    }
    return candidate;
  }
}
