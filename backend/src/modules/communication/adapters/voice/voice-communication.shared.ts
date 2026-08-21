import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
  VoiceConversation,
  VoiceConversationLifecycleState,
  VoiceConversationOutcome,
} from '@prisma/client';
import { readConversationMetadata } from '@modules/voice-assistant/voice-conversation-lifecycle.util';
import { buildCanonicalIdempotencyKey } from '../../normalization/communication-idempotency';
import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from '../../normalization/communication-normalization.errors';
import type { ConversationContextPatch, NormalizedCommunicationInput } from '../../normalization/communication-normalization.types';

export function resolveVoiceDirection(conversation: VoiceConversation): CommunicationDirection {
  return conversation.direction === 'OUTBOUND'
    ? CommunicationDirection.OUTBOUND
    : CommunicationDirection.INBOUND;
}

export function readVoiceConversationContext(conversation: VoiceConversation): ConversationContextPatch {
  const metadata = readConversationMetadata(conversation.metadata);
  return {
    customerId: typeof metadata.customerId === 'string' ? metadata.customerId : null,
    bookingId: typeof metadata.bookingId === 'string' ? metadata.bookingId : null,
    vehicleId: typeof metadata.vehicleId === 'string' ? metadata.vehicleId : null,
    stationId: typeof metadata.stationId === 'string' ? metadata.stationId : null,
    assignedUserId: null,
  };
}

export function mapVoiceInitialStatus(
  conversation: VoiceConversation,
): CommunicationConversationStatus | undefined {
  if (
    conversation.lifecycleState === VoiceConversationLifecycleState.TRANSFERRING ||
    conversation.outcome === VoiceConversationOutcome.ESCALATED
  ) {
    return CommunicationConversationStatus.HUMAN_REQUIRED;
  }
  if (
    conversation.lifecycleState === VoiceConversationLifecycleState.FINALIZED &&
    conversation.outcome === VoiceConversationOutcome.RESOLVED
  ) {
    return CommunicationConversationStatus.RESOLVED;
  }
  if (
    conversation.outcome === VoiceConversationOutcome.FAILED ||
    conversation.lifecycleState === VoiceConversationLifecycleState.FAILED
  ) {
    return CommunicationConversationStatus.FAILED;
  }
  return CommunicationConversationStatus.AI_ACTIVE;
}

export function buildVoiceEnvelope(
  conversation: VoiceConversation,
  options: { includeInitialStatus: boolean },
): NormalizedCommunicationInput['envelope'] {
  return {
    organizationId: conversation.organizationId,
    channel: CommunicationChannel.VOICE,
    nativeConversationId: conversation.id,
    initialStatus: options.includeInitialStatus
      ? mapVoiceInitialStatus(conversation)
      : undefined,
    initialContext: readVoiceConversationContext(conversation),
  };
}

export function buildVoiceIdempotencyKey(input: {
  organizationId: string;
  nativeConversationId: string;
  providerIdentity: CommunicationProviderIdentity;
  eventType: CommunicationEventType;
  providerEventId: string;
}): string {
  return buildCanonicalIdempotencyKey({
    organizationId: input.organizationId,
    channel: CommunicationChannel.VOICE,
    providerIdentity: input.providerIdentity,
    eventType: input.eventType,
    nativeConversationId: input.nativeConversationId,
    providerEventId: input.providerEventId,
  });
}

export function resolveNativeTransitionVersion(conversation: VoiceConversation): string {
  if (!conversation.updatedAt) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'Voice transition projection requires persisted conversation.updatedAt',
    );
  }
  return conversation.updatedAt.toISOString();
}

export function buildVoiceTransitionProviderEventId(
  prefix: 'voice-human' | 'voice-resolved',
  conversation: VoiceConversation,
): string {
  return `${prefix}:${conversation.id}:${resolveNativeTransitionVersion(conversation)}`;
}

export function assertVoiceConversation(conversation: VoiceConversation): void {
  if (!conversation.id || !conversation.organizationId) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'Voice projection requires persisted VoiceConversation',
    );
  }
  if (conversation.id === conversation.twilioCallSid || conversation.id === conversation.elevenLabsConvId) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'nativeConversationId must not equal provider call/session id',
    );
  }
}

export function sanitizeVoiceFailureCode(code: string): string {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return normalized || 'VOICE_OPERATION_FAILED';
}

export function sanitizeHandoffReasonCode(reason: string): string {
  const normalized = reason
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return normalized || 'HUMAN_HANDOFF';
}
