import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from './communication-normalization.errors';

/** Approved cross-channel operational metadata keys (no content/PII). */
export const CANONICAL_COMMUNICATION_METADATA_KEYS = [
  'durationSeconds',
  'outcomeCode',
  'intentCode',
  'toolName',
  'actionName',
  'failureCode',
  'handoffReasonCode',
  'templateName',
  'languageCode',
  'providerLifecycleState',
] as const;

export type CanonicalCommunicationMetadataKey =
  (typeof CANONICAL_COMMUNICATION_METADATA_KEYS)[number];

export type CanonicalCommunicationMetadata = Partial<
  Record<CanonicalCommunicationMetadataKey, string | number | boolean | null>
>;

const FORBIDDEN_METADATA_KEY_PATTERN =
  /(?:^|_)(?:body|text|content|transcript|recording|prompt|payload|raw|phone|email|message)$/i;

const FORBIDDEN_METADATA_KEYS = new Set([
  'payload',
  'rawPayload',
  'webhookBody',
  'messageBody',
  'smsBody',
  'transcript',
  'recordingUrl',
  'mediaUrl',
  'prompt',
  'toolInput',
  'toolOutput',
]);

function isAllowedMetadataValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  );
}

/**
 * Validates and returns only allowlisted metadata fields.
 * Rejects raw provider objects and sensitive/content keys.
 */
export function sanitizeCanonicalMetadata(
  metadata: unknown,
): CanonicalCommunicationMetadata | undefined {
  if (metadata === undefined || metadata === null) {
    return undefined;
  }
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      'metadata must be a plain object when provided',
    );
  }

  const input = metadata as Record<string, unknown>;
  const output: CanonicalCommunicationMetadata = {};

  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_METADATA_KEYS.has(key) || FORBIDDEN_METADATA_KEY_PATTERN.test(key)) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        `metadata key "${key}" is not permitted on canonical communication records`,
      );
    }
    if (!(CANONICAL_COMMUNICATION_METADATA_KEYS as readonly string[]).includes(key)) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        `metadata key "${key}" is not in the canonical allowlist`,
      );
    }
    if (!isAllowedMetadataValue(value)) {
      throw new CommunicationNormalizationError(
        CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
        `metadata key "${key}" must be string, number, boolean, or null`,
      );
    }
    output[key as CanonicalCommunicationMetadataKey] = value;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}
