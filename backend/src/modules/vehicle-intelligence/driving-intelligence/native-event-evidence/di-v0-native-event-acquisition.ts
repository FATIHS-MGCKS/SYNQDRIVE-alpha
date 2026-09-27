import type { NativeEventObservation } from '../core/types';
import { normalizeDiV0NativeEventEvidence } from './di-v0-native-event-normalizer';
import type {
  DiV0NativeEventEvidenceResult,
  DiV0NativeEventNormalizationRequest,
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

export function toDiV0S1NativeEventInput(result: DiV0NativeEventEvidenceResult): NativeEventObservation[] {
  return result.events.map((e) => e.observation);
}

export function wrapNativeEventEvidence(result: DiV0NativeEventEvidenceResult): NativeEventEvidence {
  return { channel: 'NATIVE_PROVIDER_EVENT', result };
}
