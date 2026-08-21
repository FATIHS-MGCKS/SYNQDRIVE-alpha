import { CommunicationChannel, CommunicationProviderIdentity } from '@prisma/client';
import { sanitizeCanonicalMetadata } from './communication-metadata';
import {
  assertProviderSupportsChannel,
  isEmailConversationProjectionDeferred,
} from './communication-provider-capability.registry';
import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from './communication-normalization.errors';
import type {
  ConversationProjectionPatch,
  NormalizedCommunicationEnvelope,
  NormalizedCommunicationEvent,
  NormalizedCommunicationInput,
} from './communication-normalization.types';

function assertNonEmptyString(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      `${field} is required`,
    );
  }
  return trimmed;
}

function assertValidDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      `${field} must be a valid Date`,
    );
  }
  return value;
}

function validateEnvelope(envelope: NormalizedCommunicationEnvelope): NormalizedCommunicationEnvelope {
  return {
    ...envelope,
    organizationId: assertNonEmptyString(envelope.organizationId, 'envelope.organizationId'),
    nativeConversationId: assertNonEmptyString(
      envelope.nativeConversationId,
      'envelope.nativeConversationId',
    ),
  };
}

function validateEvent(event: NormalizedCommunicationEvent): NormalizedCommunicationEvent {
  const idempotencyKey = assertNonEmptyString(event.idempotencyKey, 'event.idempotencyKey');
  const occurredAt = assertValidDate(event.occurredAt, 'event.occurredAt');
  const metadata = sanitizeCanonicalMetadata(event.metadata);

  if (event.providerIdentity) {
    // Provider identity on event is optional but when present must be consistent with envelope channel checks later.
  }

  return {
    ...event,
    idempotencyKey,
    occurredAt,
    metadata,
  };
}

function validateProjectionPatch(
  patch: ConversationProjectionPatch | undefined,
): ConversationProjectionPatch | undefined {
  if (!patch) {
    return undefined;
  }

  if (patch.unreadDelta !== undefined && patch.unreadCountAbsolute !== undefined) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'projection cannot set both unreadDelta and unreadCountAbsolute',
    );
  }

  if (patch.unreadDelta !== undefined) {
    if (!Number.isInteger(patch.unreadDelta) || patch.unreadDelta <= 0) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        'projection.unreadDelta must be a positive integer',
      );
    }
  }

  if (patch.unreadCountAbsolute !== undefined && patch.unreadCountAbsolute < 0) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'projection.unreadCountAbsolute must be >= 0',
    );
  }

  if (patch.lastActivityAt) {
    assertValidDate(patch.lastActivityAt, 'projection.lastActivityAt');
  }

  return {
    ...patch,
    metadata: sanitizeCanonicalMetadata(patch.metadata),
  };
}

/**
 * Validates normalized input shape, metadata allowlist, and V1 provider/channel rules.
 * Does not perform tenant DB lookups — projection service handles those via C1.
 */
export function validateNormalizedCommunicationInput(
  input: NormalizedCommunicationInput,
): NormalizedCommunicationInput {
  const envelope = validateEnvelope(input.envelope);
  const event = validateEvent(input.event);
  const projection = validateProjectionPatch(input.projection);
  const persist = input.persist !== false;

  if (event.providerIdentity) {
    assertProviderSupportsChannel(event.providerIdentity, envelope.channel);
  }

  if (persist && isEmailConversationProjectionDeferred(envelope.channel)) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.EMAIL_CONVERSATION_DEFERRED,
      'Email V1 does not project CommunicationConversation — transactional OutboundEmail remains authoritative',
    );
  }

  if (
    envelope.channel === CommunicationChannel.SMS
    && event.providerIdentity
    && event.providerIdentity !== CommunicationProviderIdentity.SENT_DM
  ) {
    assertProviderSupportsChannel(event.providerIdentity, envelope.channel);
  }

  return {
    envelope,
    event,
    projection,
    persist,
  };
}
