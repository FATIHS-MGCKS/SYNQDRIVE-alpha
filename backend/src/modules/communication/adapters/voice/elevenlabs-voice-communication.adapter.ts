import { Injectable } from '@nestjs/common';
import {
  CommunicationActorType,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
  VoiceToolExecutionStatus,
} from '@prisma/client';
import type { NormalizedCommunicationInput } from '../../normalization/communication-normalization.types';
import type { ConversationalVoiceProviderNormalizationPort } from '../../ports/conversational-voice-normalization.port';
import type {
  ElevenLabsVoiceProjectionSource,
  VoiceHumanRequiredProjectionSource,
  VoiceToolExecutionProjectionSource,
} from './voice-communication.types';
import {
  assertVoiceConversation,
  buildVoiceEnvelope,
  buildVoiceIdempotencyKey,
  buildVoiceTransitionProviderEventId,
  resolveVoiceDirection,
  sanitizeHandoffReasonCode,
  sanitizeVoiceFailureCode,
} from './voice-communication.shared';

@Injectable()
export class ElevenLabsVoiceCommunicationAdapter
  implements ConversationalVoiceProviderNormalizationPort
{
  normalizeAiIntent(source: unknown): NormalizedCommunicationInput {
    return this.fromAiIntentDetected(this.assertElevenLabsSource(source));
  }

  normalizeAiAction(source: unknown): NormalizedCommunicationInput {
    const typed = this.assertToolSource(source);
    if (typed.execution.status === VoiceToolExecutionStatus.RUNNING) {
      return this.fromAiActionStarted(typed);
    }
    if (typed.execution.status === VoiceToolExecutionStatus.SUCCEEDED) {
      return this.fromAiActionCompleted(typed);
    }
    return this.fromAiActionFailed(typed);
  }

  normalizeEscalationSignal(source: unknown): NormalizedCommunicationInput {
    return this.fromHumanRequired(this.assertHumanSource(source));
  }

  normalizeAgentLifecycle(source: unknown): NormalizedCommunicationInput {
    return this.fromCallEnded(this.assertElevenLabsSource(source));
  }

  fromAiIntentDetected(source: ElevenLabsVoiceProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    assertVoiceConversation(conversation);
    const providerEventId = source.providerEventId.trim();
    const occurredAt = source.occurredAt;

    return {
      envelope: buildVoiceEnvelope(conversation, {
        includeInitialStatus: source.includeInitialStatus ?? false,
      }),
      event: {
        eventType: CommunicationEventType.AI_INTENT_DETECTED,
        occurredAt,
        direction: CommunicationDirection.INTERNAL,
        providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
          eventType: CommunicationEventType.AI_INTENT_DETECTED,
          providerEventId,
        }),
        actorType: CommunicationActorType.AI_AGENT,
        metadata: source.intentCode ? { intentCode: sanitizeVoiceFailureCode(source.intentCode) } : undefined,
      },
    };
  }

  fromCallEnded(source: ElevenLabsVoiceProjectionSource): NormalizedCommunicationInput {
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
        providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
          eventType: CommunicationEventType.CALL_ENDED,
          providerEventId,
        }),
        actorType: CommunicationActorType.AI_AGENT,
        metadata: {
          ...(source.durationSeconds && source.durationSeconds > 0
            ? { durationSeconds: source.durationSeconds }
            : {}),
          ...(source.outcomeCode ? { outcomeCode: sanitizeVoiceFailureCode(source.outcomeCode) } : {}),
        },
      },
    };
  }

  fromConversationResolved(source: ElevenLabsVoiceProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    assertVoiceConversation(conversation);
    const providerEventId = source.providerEventId.trim();
    const occurredAt = source.occurredAt;

    return {
      envelope: buildVoiceEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.CONVERSATION_RESOLVED,
        occurredAt,
        direction: resolveVoiceDirection(conversation),
        providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
          eventType: CommunicationEventType.CONVERSATION_RESOLVED,
          providerEventId,
        }),
        actorType: CommunicationActorType.AI_AGENT,
        metadata: source.outcomeCode
          ? { outcomeCode: sanitizeVoiceFailureCode(source.outcomeCode) }
          : undefined,
      },
      projection: {
        status: CommunicationConversationStatus.RESOLVED,
      },
    };
  }

  fromHumanRequired(source: VoiceHumanRequiredProjectionSource): NormalizedCommunicationInput {
    const { conversation } = source;
    assertVoiceConversation(conversation);
    const providerIdentity =
      source.providerIdentity === 'TWILIO'
        ? CommunicationProviderIdentity.TWILIO
        : CommunicationProviderIdentity.ELEVENLABS;
    const providerEventId =
      source.providerEventId.trim() ||
      buildVoiceTransitionProviderEventId('voice-human', conversation);

    return {
      envelope: buildVoiceEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType: CommunicationEventType.HUMAN_REQUIRED,
        occurredAt: source.occurredAt,
        direction: CommunicationDirection.INTERNAL,
        providerIdentity,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity,
          eventType: CommunicationEventType.HUMAN_REQUIRED,
          providerEventId,
        }),
        actorType: CommunicationActorType.AI_AGENT,
        metadata: source.handoffReasonCode
          ? { handoffReasonCode: sanitizeHandoffReasonCode(source.handoffReasonCode) }
          : undefined,
      },
      projection: {
        status: CommunicationConversationStatus.HUMAN_REQUIRED,
      },
    };
  }

  fromAiActionStarted(source: VoiceToolExecutionProjectionSource): NormalizedCommunicationInput {
    return this.buildToolEvent(source, CommunicationEventType.AI_ACTION_STARTED);
  }

  fromAiActionCompleted(source: VoiceToolExecutionProjectionSource): NormalizedCommunicationInput {
    return this.buildToolEvent(source, CommunicationEventType.AI_ACTION_COMPLETED);
  }

  fromAiActionFailed(source: VoiceToolExecutionProjectionSource): NormalizedCommunicationInput {
    return this.buildToolEvent(source, CommunicationEventType.AI_ACTION_FAILED, {
      failureCode: source.execution.errorCode
        ? sanitizeVoiceFailureCode(source.execution.errorCode)
        : 'AI_ACTION_FAILED',
    });
  }

  private buildToolEvent(
    source: VoiceToolExecutionProjectionSource,
    eventType: CommunicationEventType,
    extraMetadata?: { failureCode?: string },
  ): NormalizedCommunicationInput {
    const { conversation, execution } = source;
    assertVoiceConversation(conversation);
    const providerEventId = `voice-tool:${execution.id}:${eventType.toLowerCase()}`;
    const occurredAt = source.occurredAt;

    return {
      envelope: buildVoiceEnvelope(conversation, { includeInitialStatus: false }),
      event: {
        eventType,
        occurredAt,
        direction: CommunicationDirection.INTERNAL,
        providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
        providerEventId,
        providerMessageId: null,
        idempotencyKey: buildVoiceIdempotencyKey({
          organizationId: conversation.organizationId,
          nativeConversationId: conversation.id,
          providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
          eventType,
          providerEventId,
        }),
        actorType: CommunicationActorType.AI_AGENT,
        metadata: {
          toolName: sanitizeVoiceFailureCode(execution.toolName),
          actionName: sanitizeVoiceFailureCode(execution.toolName),
          ...extraMetadata,
        },
      },
    };
  }

  private assertElevenLabsSource(source: unknown): ElevenLabsVoiceProjectionSource {
    if (!source || typeof source !== 'object') {
      throw new Error('ElevenLabs voice projection source must be an object');
    }
    const candidate = source as ElevenLabsVoiceProjectionSource;
    if (!candidate.conversation?.id || !candidate.providerEventId) {
      throw new Error('ElevenLabs voice projection source requires conversation and providerEventId');
    }
    return candidate;
  }

  private assertHumanSource(source: unknown): VoiceHumanRequiredProjectionSource {
    if (!source || typeof source !== 'object') {
      throw new Error('Voice human-required projection source must be an object');
    }
    const candidate = source as VoiceHumanRequiredProjectionSource;
    if (!candidate.conversation?.id || !candidate.providerIdentity) {
      throw new Error('Voice human-required projection source requires conversation and providerIdentity');
    }
    return candidate;
  }

  private assertToolSource(source: unknown): VoiceToolExecutionProjectionSource {
    if (!source || typeof source !== 'object') {
      throw new Error('Voice tool execution projection source must be an object');
    }
    const candidate = source as VoiceToolExecutionProjectionSource;
    if (!candidate.conversation?.id || !candidate.execution?.id) {
      throw new Error('Voice tool execution projection source requires conversation and execution');
    }
    return candidate;
  }
}
