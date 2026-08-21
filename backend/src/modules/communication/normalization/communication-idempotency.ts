import { createHash } from 'crypto';
import type {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from './communication-normalization.errors';

const MAX_IDEMPOTENCY_KEY_LENGTH = 512;
const IDEMPOTENCY_KEY_PREFIX = 'cc1';

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

type IdentityKind = 'evt' | 'msg' | 'state';

interface CanonicalIdempotencyPayload {
  v: 1;
  organizationId: string;
  channel: CommunicationChannel;
  providerIdentity: CommunicationProviderIdentity;
  eventType: CommunicationEventType;
  nativeConversationId: string;
  identityKind: IdentityKind;
  identityValue: string;
}

/**
 * Deterministic canonical idempotency key for C3+ projection adapters.
 *
 * Uses SHA-256 over a structured JSON payload so provider identifiers that may
 * contain ':' (e.g. Twilio externalEventId `CA1:status:ringing`) cannot create
 * ambiguous colon-delimited tuples. Keys are never parsed back — opaque digest only.
 */
export function buildCanonicalIdempotencyKey(input: CanonicalIdempotencyKeyInput): string {
  const payload = buildIdempotencyPayload(input);
  const digest = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
  const key = `${IDEMPOTENCY_KEY_PREFIX}:${digest}`;
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      `idempotency key exceeds maximum length of ${MAX_IDEMPOTENCY_KEY_LENGTH}`,
    );
  }
  return key;
}

function buildIdempotencyPayload(input: CanonicalIdempotencyKeyInput): CanonicalIdempotencyPayload {
  const identity = resolveIdentity(input);
  return {
    v: 1,
    organizationId: input.organizationId.trim(),
    channel: input.channel,
    providerIdentity: input.providerIdentity,
    eventType: input.eventType,
    nativeConversationId: input.nativeConversationId.trim(),
    identityKind: identity.kind,
    identityValue: identity.value,
  };
}

function resolveIdentity(input: CanonicalIdempotencyKeyInput): { kind: IdentityKind; value: string } {
  if (input.providerEventId?.trim()) {
    return { kind: 'evt', value: input.providerEventId.trim() };
  }
  if (input.providerMessageId?.trim()) {
    return { kind: 'msg', value: input.providerMessageId.trim() };
  }
  if (input.providerLifecycleState?.trim()) {
    return { kind: 'state', value: input.providerLifecycleState.trim() };
  }
  throw new CommunicationNormalizationError(
    CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
    'idempotency identity requires providerEventId, providerMessageId, or providerLifecycleState',
  );
}
