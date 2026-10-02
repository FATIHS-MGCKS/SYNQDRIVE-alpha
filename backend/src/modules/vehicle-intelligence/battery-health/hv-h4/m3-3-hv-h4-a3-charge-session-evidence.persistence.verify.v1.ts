import type {
  BatteryHvChargeSessionEvidenceAck,
  BatteryHvChargeSessionEvidenceRevision,
} from '@prisma/client';
import {
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  canonicalUtf8FromStoredScientificEvidenceJsonV1,
  computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1,
  scientificEvidenceJsonMatchesCanonicalFingerprintV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  H4EvidenceAckIdentityMismatchError,
  H4EvidenceRevisionMirrorIncoherenceError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
  H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1 } from './m3-3-hv-h4-a3-charge-session-evidence-mirror.v1';
import type {
  M3_3HvH4ChargeSessionEvidenceMirrorV1,
  M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import type { M3_3HvH4ChargeSessionEvidencePersistenceInputV1 } from './m3-3-hv-h4-a3-charge-session-evidence.persistence.types.v1';

function isoEqual(a: Date, bIso: string): boolean {
  return a.toISOString() === bIso;
}

export function mirrorFromEvidenceRevisionRowV1(
  revision: BatteryHvChargeSessionEvidenceRevision,
): M3_3HvH4ChargeSessionEvidenceMirrorV1 {
  return {
    organizationId: revision.organizationId,
    vehicleId: revision.vehicleId,
    sourceHvChargeSessionId: revision.sourceHvChargeSessionId,
    segmentFingerprint: revision.segmentFingerprint,
    dimoSegmentId: revision.dimoSegmentId,
    providerSegmentId: revision.providerSegmentId,
    source: revision.source,
    startAt: revision.startAt,
    endAt: revision.endAt,
    isOngoing: revision.isOngoing,
    energyAddedKwh: revision.energyAddedKwh,
    providerObservedAt: revision.providerObservedAt,
    addedEnergyProvenance: revision.addedEnergyProvenance,
    qualityStatus: revision.qualityStatus,
    supersededBySegmentFingerprint: revision.supersededBySegmentFingerprint,
    startedBeforeRange: revision.startedBeforeRange,
    sourceCreatedAt: revision.sourceCreatedAt,
    sourceReceivedAt: revision.sourceReceivedAt,
    sourceUpdatedAt: revision.sourceUpdatedAt,
  };
}

export function storedScientificProjectionFromRevisionV1(
  revision: BatteryHvChargeSessionEvidenceRevision,
): M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 {
  return revision.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
}

export function assertAckMirrorsRevisionV1(
  ack: BatteryHvChargeSessionEvidenceAck,
  revision: BatteryHvChargeSessionEvidenceRevision,
): void {
  const ok =
    ack.organizationId === revision.organizationId &&
    ack.vehicleId === revision.vehicleId &&
    ack.segmentFingerprint === revision.segmentFingerprint &&
    ack.evidenceContractVersion === revision.evidenceContractVersion &&
    ack.sourceRevisionFingerprint === revision.sourceRevisionFingerprint &&
    ack.revisionId === revision.id &&
    ack.durabilityAckContractVersion === M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1;

  if (!ok) {
    throw new H4EvidenceAckIdentityMismatchError();
  }
}

export function assertRevisionMirrorsPersistenceInputV1(
  revision: BatteryHvChargeSessionEvidenceRevision,
  expected: M3_3HvH4ChargeSessionEvidencePersistenceInputV1,
): void {
  const mirror = expected.mirror;
  const mismatches: string[] = [];
  const check = (field: string, ok: boolean) => {
    if (!ok) mismatches.push(field);
  };

  check('organizationId', revision.organizationId === expected.projection.organizationId);
  check('vehicleId', revision.vehicleId === expected.projection.vehicleId);
  check(
    'segmentFingerprint',
    revision.segmentFingerprint === expected.projection.segmentFingerprint,
  );
  check(
    'evidenceContractVersion',
    revision.evidenceContractVersion === expected.projection.evidenceContractVersion,
  );
  check(
    'sourceRevisionFingerprint',
    revision.sourceRevisionFingerprint === expected.sourceRevisionFingerprint,
  );
  check(
    'sourceHvChargeSessionId',
    revision.sourceHvChargeSessionId === mirror.sourceHvChargeSessionId,
  );
  check('dimoSegmentId', revision.dimoSegmentId === mirror.dimoSegmentId);
  check('providerSegmentId', revision.providerSegmentId === mirror.providerSegmentId);
  check('source', revision.source === mirror.source);
  check('startAt', isoEqual(revision.startAt, mirror.startAt.toISOString()));
  check(
    'endAt',
    mirror.endAt == null
      ? revision.endAt == null
      : revision.endAt != null && isoEqual(revision.endAt, mirror.endAt.toISOString()),
  );
  check('isOngoing', revision.isOngoing === mirror.isOngoing);
  check(
    'energyAddedKwh',
    revision.energyAddedKwh == null
      ? mirror.energyAddedKwh == null
      : mirror.energyAddedKwh != null &&
          Object.is(revision.energyAddedKwh, mirror.energyAddedKwh),
  );
  check(
    'providerObservedAt',
    mirror.providerObservedAt == null
      ? revision.providerObservedAt == null
      : revision.providerObservedAt != null &&
          isoEqual(revision.providerObservedAt, mirror.providerObservedAt.toISOString()),
  );
  check(
    'addedEnergyProvenance',
    revision.addedEnergyProvenance === mirror.addedEnergyProvenance,
  );
  check('qualityStatus', revision.qualityStatus === mirror.qualityStatus);
  check(
    'supersededBySegmentFingerprint',
    revision.supersededBySegmentFingerprint === mirror.supersededBySegmentFingerprint,
  );
  check('startedBeforeRange', revision.startedBeforeRange === mirror.startedBeforeRange);
  check(
    'sourceCreatedAt',
    isoEqual(revision.sourceCreatedAt, mirror.sourceCreatedAt.toISOString()),
  );
  check(
    'sourceReceivedAt',
    isoEqual(revision.sourceReceivedAt, mirror.sourceReceivedAt.toISOString()),
  );
  check(
    'sourceUpdatedAt',
    isoEqual(revision.sourceUpdatedAt, mirror.sourceUpdatedAt.toISOString()),
  );

  if (mismatches.length > 0) {
    throw new H4EvidenceRevisionMirrorIncoherenceError(
      `Persisted revision mirror columns drift: ${mismatches.join(', ')}`,
    );
  }
}

export function assertStoredEvidenceRevisionMatchesPersistenceInputV1(
  revision: BatteryHvChargeSessionEvidenceRevision,
  expected: M3_3HvH4ChargeSessionEvidencePersistenceInputV1,
): void {
  if (
    !scientificEvidenceJsonMatchesCanonicalFingerprintV1({
      scientificEvidenceJson: revision.scientificEvidenceJson,
      sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
    })
  ) {
    throw new H4EvidenceRevisionStoredFingerprintMismatchError();
  }

  const incomingCanonical = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(
    expected.projection,
  );
  if (incomingCanonical !== expected.sourceRevisionFingerprint) {
    throw new H4EvidenceRevisionStoredFingerprintMismatchError(
      'Incoming persistence input fingerprint incoherent with projection',
    );
  }

  const storedCanonical = canonicalUtf8FromStoredScientificEvidenceJsonV1(
    revision.scientificEvidenceJson,
  );
  const expectedCanonical = canonicalUtf8FromStoredScientificEvidenceJsonV1(expected.projection);
  if (storedCanonical !== expectedCanonical) {
    throw new H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError();
  }

  assertRevisionMirrorsPersistenceInputV1(revision, expected);

  try {
    assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
      projection: storedScientificProjectionFromRevisionV1(revision),
      mirror: mirrorFromEvidenceRevisionRowV1(revision),
    });
  } catch {
    throw new H4EvidenceRevisionMirrorIncoherenceError();
  }
}
