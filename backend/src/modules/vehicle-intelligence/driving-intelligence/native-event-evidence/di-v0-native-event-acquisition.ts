import type { NativeEventObservation } from '../core/types';
import { normalizeDiV0NativeEventEvidence } from './di-v0-native-event-normalizer';
import type {
  DiV0NativeEventEvidenceResult,
  DiV0NativeEventInputRecord,
  DiV0NativeEventNormalizationRequest,
  DiV0NativeEventSourceEnvelope,
  NativeEventEvidence,
} from './di-v0-native-event-evidence.types';

/**
 * S3B Channel B — normalizes already-ingested native events (library-only, dormant).
 */
export function acquireDiV0NativeEventEvidence(
  request: DiV0NativeEventNormalizationRequest,
): DiV0NativeEventEvidenceResult {
  return normalizeDiV0NativeEventEvidence(request);
}

/**
 * Boundary for the future S4 repository read: a read that resolves to an array (even `[]`)
 * is SOURCE_SUCCESS; a read that throws or resolves to a non-array is SOURCE_FAILURE.
 * The thrown error is not propagated into evidence (no messages, no secrets).
 */
export async function readDiV0NativeEventSource(
  read: () => Promise<DiV0NativeEventInputRecord[]>,
): Promise<DiV0NativeEventSourceEnvelope> {
  let rows: unknown;
  try {
    rows = await read();
  } catch {
    return { kind: 'SOURCE_FAILURE', failureCode: 'READ_THREW' };
  }
  if (!Array.isArray(rows) || !rows.every(isNativeEventInputRecordShape)) {
    return { kind: 'SOURCE_FAILURE', failureCode: 'MALFORMED_READ_RESULT' };
  }
  return { kind: 'SOURCE_SUCCESS', records: rows };
}

function isNativeEventInputRecordShape(value: unknown): value is DiV0NativeEventInputRecord {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.vehicleId === 'string' &&
    typeof r.providerEventName === 'string' &&
    typeof r.sourceFamily === 'string' &&
    (r.organizationId === null || typeof r.organizationId === 'string') &&
    (r.providerTimestamp === null || typeof r.providerTimestamp === 'string')
  );
}

export function toDiV0S1NativeEventInput(result: DiV0NativeEventEvidenceResult): NativeEventObservation[] {
  return result.events.map((e) => e.observation);
}

export function wrapNativeEventEvidence(result: DiV0NativeEventEvidenceResult): NativeEventEvidence {
  return { channel: 'NATIVE_PROVIDER_EVENT', result };
}
