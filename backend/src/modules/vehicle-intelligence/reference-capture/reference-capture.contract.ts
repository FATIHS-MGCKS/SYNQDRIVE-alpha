import {
  REFERENCE_CAPTURE_ENVELOPE_VERSION,
  REFERENCE_CAPTURE_RAW_IDENTITY_PREFIX,
} from './reference-capture.constants';
import type {
  ReferenceCaptureObservationEnvelope,
  ReferenceCaptureValidationIssue,
  ReferenceCaptureValidationResult,
} from './reference-capture.types';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function buildRawIdentity(providerField: string): string {
  return `${REFERENCE_CAPTURE_RAW_IDENTITY_PREFIX}${providerField}`;
}

export function validateReferenceCaptureObservationEnvelope(
  envelope: ReferenceCaptureObservationEnvelope,
): ReferenceCaptureValidationResult {
  const issues: ReferenceCaptureValidationIssue[] = [];

  if (!isNonEmptyString(envelope.envelopeVersion)) {
    issues.push({ code: 'MISSING_ENVELOPE_VERSION', message: 'envelopeVersion is required' });
  } else if (envelope.envelopeVersion !== REFERENCE_CAPTURE_ENVELOPE_VERSION) {
    issues.push({
      code: 'UNSUPPORTED_ENVELOPE_VERSION',
      message: `Unsupported envelopeVersion ${envelope.envelopeVersion}`,
    });
  }

  if (!isNonEmptyString(envelope.rawIdentity)) {
    issues.push({ code: 'MISSING_RAW_IDENTITY', message: 'rawIdentity is required' });
  }

  if (!isNonEmptyString(envelope.provider)) {
    issues.push({ code: 'MISSING_PROVIDER', message: 'provider is required' });
  }

  if (!isNonEmptyString(envelope.connectionProfile)) {
    issues.push({ code: 'MISSING_CONNECTION_PROFILE', message: 'connectionProfile is required' });
  }

  const synqReceivedAt = parseTimestamp(envelope.synqReceivedAt);
  if (!synqReceivedAt) {
    issues.push({
      code: 'MISSING_SYNQ_RECEIVED_AT',
      message: 'synqReceivedAt is required and must be a valid timestamp',
    });
  }

  if (envelope.providerTimestamp != null && !parseTimestamp(envelope.providerTimestamp)) {
    issues.push({
      code: 'INVALID_PROVIDER_TIMESTAMP',
      message: 'providerTimestamp must be a valid timestamp when set',
    });
  }

  if (envelope.canonicalKey != null && !isNonEmptyString(envelope.canonicalKey)) {
    issues.push({
      code: 'INVALID_CANONICAL_KEY',
      message: 'canonicalKey must be null or a non-empty string',
    });
  }

  if (
    envelope.canonicalKey == null &&
    envelope.providerField != null &&
    !envelope.rawIdentity.startsWith(REFERENCE_CAPTURE_RAW_IDENTITY_PREFIX)
  ) {
    issues.push({
      code: 'UNMAPPED_RAW_IDENTITY_FORMAT',
      message: 'Unmapped provider fields must use DIMO::<providerField> rawIdentity',
    });
  }

  if (envelope.rawValue === undefined) {
    issues.push({ code: 'MISSING_RAW_VALUE', message: 'rawValue must be retained (nullable ok)' });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true };
}

export function normalizeReferenceCaptureObservationEnvelope(
  envelope: ReferenceCaptureObservationEnvelope,
): ReferenceCaptureObservationEnvelope {
  const validation = validateReferenceCaptureObservationEnvelope(envelope);
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => `${i.code}: ${i.message}`).join('; '));
  }

  return {
    ...envelope,
    envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
    synqReceivedAt: parseTimestamp(envelope.synqReceivedAt)!,
    providerTimestamp: parseTimestamp(envelope.providerTimestamp),
    requestStartedAt: parseTimestamp(envelope.requestStartedAt),
    requestCompletedAt: parseTimestamp(envelope.requestCompletedAt),
  };
}
