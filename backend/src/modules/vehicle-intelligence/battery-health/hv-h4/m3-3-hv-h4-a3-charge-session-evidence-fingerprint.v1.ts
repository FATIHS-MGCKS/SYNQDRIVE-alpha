import { createHash } from 'crypto';
import {
  M3_3_HV_H4_A3_SOURCE_REVISION_FINGERPRINT_HEX_PATTERN,
  M3_3_HV_H4_SOURCE_REVISION_FINGERPRINT_ALGORITHM,
} from './m3-3-hv-h4-a3.constants';
import { H4InvalidSourceRevisionFingerprintError } from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';

/**
 * Fixed semantic field order — byte authority is UTF-8 JSON of this tuple.
 * Do not rely on arbitrary object key insertion order.
 */
export function buildM3_3HvH4ChargeSessionEvidenceCanonicalPayloadTupleV1(
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
): readonly unknown[] {
  return [
    M3_3_HV_H4_SOURCE_REVISION_FINGERPRINT_ALGORITHM,
    projection.evidenceContractVersion,
    projection.organizationId,
    projection.vehicleId,
    projection.sourceHvChargeSessionId,
    projection.segmentFingerprint,
    projection.dimoSegmentId,
    projection.providerSegmentId,
    projection.source,
    projection.startAt,
    projection.endAt,
    projection.isOngoing,
    projection.energyAddedKwh,
    projection.providerObservedAt,
    projection.addedEnergyProvenance,
    projection.qualityStatus,
    projection.supersededBySegmentFingerprint,
    projection.startedBeforeRange,
    projection.sourceCreatedAt,
    projection.sourceReceivedAt,
    projection.sourceUpdatedAt,
  ];
}

export function buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
): string {
  const tuple = buildM3_3HvH4ChargeSessionEvidenceCanonicalPayloadTupleV1(projection);
  return JSON.stringify(tuple);
}

export function computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
): string {
  const utf8 = buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(projection);
  const hex = createHash('sha256').update(utf8, 'utf8').digest('hex');
  assertValidM3_3HvH4SourceRevisionFingerprintHexV1(hex);
  return hex;
}

export function assertValidM3_3HvH4SourceRevisionFingerprintHexV1(fingerprint: string): void {
  if (!M3_3_HV_H4_A3_SOURCE_REVISION_FINGERPRINT_HEX_PATTERN.test(fingerprint)) {
    throw new H4InvalidSourceRevisionFingerprintError();
  }
}

/** Future A3.2 idempotent insert verify — compare canonical bytes of stored JSON projection. */
export function canonicalUtf8FromStoredScientificEvidenceJsonV1(
  stored: unknown,
): string {
  const projection = stored as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
  return buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(projection);
}

export function scientificEvidenceJsonMatchesCanonicalFingerprintV1(input: {
  scientificEvidenceJson: unknown;
  sourceRevisionFingerprint: string;
}): boolean {
  const recomputed = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(
    input.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  );
  return recomputed === input.sourceRevisionFingerprint;
}
