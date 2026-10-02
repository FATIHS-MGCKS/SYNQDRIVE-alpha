import {
  decodeM3_3HvH4EnergyAddedKwhV1,
  energyAddedKwhMirrorMatchesTaggedV1,
} from './m3-3-hv-h4-a3-energy-encoding.v1';
import type {
  M3_3HvH4ChargeSessionEvidenceMirrorV1,
  M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';

function isoEqual(a: Date, bIso: string): boolean {
  return a.toISOString() === bIso;
}

/** Validates mirrored DB columns against scientific projection (A3.2 writer contract). */
export function assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1(input: {
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
  mirror: M3_3HvH4ChargeSessionEvidenceMirrorV1;
}): void {
  const { projection, mirror } = input;
  const errors: string[] = [];

  const check = (field: string, ok: boolean) => {
    if (!ok) errors.push(field);
  };

  check('organizationId', mirror.organizationId === projection.organizationId);
  check('vehicleId', mirror.vehicleId === projection.vehicleId);
  check(
    'sourceHvChargeSessionId',
    mirror.sourceHvChargeSessionId === projection.sourceHvChargeSessionId,
  );
  check('segmentFingerprint', mirror.segmentFingerprint === projection.segmentFingerprint);
  check('dimoSegmentId', mirror.dimoSegmentId === projection.dimoSegmentId);
  check('providerSegmentId', mirror.providerSegmentId === projection.providerSegmentId);
  check('source', mirror.source === projection.source);
  check('startAt', isoEqual(mirror.startAt, projection.startAt));
  check(
    'endAt',
    projection.endAt == null
      ? mirror.endAt == null
      : mirror.endAt != null && isoEqual(mirror.endAt, projection.endAt),
  );
  check('isOngoing', mirror.isOngoing === projection.isOngoing);
  check(
    'energyAddedKwh',
    energyAddedKwhMirrorMatchesTaggedV1(mirror.energyAddedKwh, projection.energyAddedKwh),
  );
  check(
    'providerObservedAt',
    projection.providerObservedAt == null
      ? mirror.providerObservedAt == null
      : mirror.providerObservedAt != null &&
          isoEqual(mirror.providerObservedAt, projection.providerObservedAt),
  );
  check(
    'addedEnergyProvenance',
    mirror.addedEnergyProvenance === projection.addedEnergyProvenance,
  );
  check('qualityStatus', mirror.qualityStatus === projection.qualityStatus);
  check(
    'supersededBySegmentFingerprint',
    mirror.supersededBySegmentFingerprint === projection.supersededBySegmentFingerprint,
  );
  check('startedBeforeRange', mirror.startedBeforeRange === projection.startedBeforeRange);
  check('sourceCreatedAt', isoEqual(mirror.sourceCreatedAt, projection.sourceCreatedAt));
  check('sourceReceivedAt', isoEqual(mirror.sourceReceivedAt, projection.sourceReceivedAt));
  check('sourceUpdatedAt', isoEqual(mirror.sourceUpdatedAt, projection.sourceUpdatedAt));

  if (errors.length > 0) {
    throw new Error(
      `M3_3_HV_H4_A3 mirror incoherent fields: ${errors.join(', ')}`,
    );
  }
}

export function mirrorCoherentWithStoredJsonV1(input: {
  scientificEvidenceJson: unknown;
  mirror: M3_3HvH4ChargeSessionEvidenceMirrorV1;
}): boolean {
  try {
    assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
      projection: input.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
      mirror: input.mirror,
    });
    return true;
  } catch {
    return false;
  }
}

/** Round-trip energy semantic through tagged JSON (not used for fingerprint authority on float column). */
export function decodeMirrorEnergyFromProjectionV1(
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
): number | null {
  return decodeM3_3HvH4EnergyAddedKwhV1(projection.energyAddedKwh);
}
