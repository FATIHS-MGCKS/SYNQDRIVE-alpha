import { createHash } from 'crypto';
import { M3_3G_GROUND_TRUTH_FINGERPRINT_VERSION } from './ground-truth.constants';
import type { GroundTruthFingerprintInputV1 } from './ground-truth-admission.types';

function stableIso(date: Date): string {
  return date.toISOString();
}

/**
 * Deterministic canonical payload for admitted ground-truth identity (no PII / no numeric truth).
 */
export function buildGroundTruthFingerprintCanonicalPayloadV1(
  input: GroundTruthFingerprintInputV1,
): Record<string, unknown> {
  const confirmation =
    input.confirmedByUserId || input.confirmedAt
      ? {
          confirmedByUserId: input.confirmedByUserId ?? null,
          confirmedAt: input.confirmedAt ? stableIso(input.confirmedAt) : null,
        }
      : null;

  return {
    fingerprintVersion: M3_3G_GROUND_TRUTH_FINGERPRINT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    groundTruthType: input.groundTruthType,
    batteryScope: input.batteryScope,
    effectiveAt: stableIso(input.effectiveAt),
    sourceAuthority: input.sourceAuthority,
    sourceServiceEventId: input.sourceServiceEventId ?? null,
    sourceDocumentExtractionId: input.sourceDocumentExtractionId ?? null,
    sourceBatteryEvidenceId: input.sourceBatteryEvidenceId ?? null,
    sourceMeasurementId: input.sourceMeasurementId ?? null,
    confirmation,
    sourceIdentity: input.sourceIdentity,
  };
}

export function computeGroundTruthSourceContentFingerprintV1(
  input: GroundTruthFingerprintInputV1,
): string {
  const payload = buildGroundTruthFingerprintCanonicalPayloadV1(input);
  const json = JSON.stringify(payload);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}
