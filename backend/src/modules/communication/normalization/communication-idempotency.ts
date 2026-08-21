import type {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from './communication-normalization.errors';

const MAX_IDEMPOTENCY_KEY_LENGTH = 512;

export interface CanonicalIdempotencyKeyInput {
  organizationId: string;
  channel: CommunicationChannel;
  providerIdentity: CommunicationProviderIdentity;
  eventType: CommunicationEventType;
  nativeConversationId: string;
  providerEventId?: string | null;
  providerMessageId?: string | null;
  providerLifecycleState?: string | null;
}

/**
 * Deterministic canonical idempotency key for C3+ projection adapters.
 * No PII, no message content, bounded length.
 */
export function buildCanonicalIdempotencyKey(input: CanonicalIdempotencyKeyInput): string {
  const segments = [
    input.organizationId,
    input.channel,
    input.providerIdentity,
    input.eventType,
    input.nativeConversationId,
  ];

  if (input.providerEventId?.trim()) {
    segments.push(`evt:${input.providerEventId.trim()}`);
  } else if (input.providerMessageId?.trim()) {
    segments.push(`msg:${input.providerMessageId.trim()}`);
  } else if (input.providerLifecycleState?.trim()) {
    segments.push(`state:${input.providerLifecycleState.trim()}`);
  } else {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'idempotency identity requires providerEventId, providerMessageId, or providerLifecycleState',
    );
  }

  const key = segments.join(':');
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      `idempotency key exceeds maximum length of ${MAX_IDEMPOTENCY_KEY_LENGTH}`,
    );
  }
  if (key.includes('\n') || key.includes('\r')) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'idempotency key must not contain line breaks',
    );
  }

  return key;
}
