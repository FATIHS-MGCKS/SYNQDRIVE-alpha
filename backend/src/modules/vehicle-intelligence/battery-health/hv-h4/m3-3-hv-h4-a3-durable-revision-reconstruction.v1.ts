import type {
  BatteryHvChargeSessionEvidenceAck,
  BatteryHvChargeSessionEvidenceRevision,
} from '@prisma/client';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  H4EvidenceAckIdentityMismatchError,
  H4EvidenceRevisionMirrorIncoherenceError,
  H4EvidenceRevisionMissingDurabilityAckError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
  H4EvidenceUnsupportedContractVersionError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1 } from './m3-3-hv-h4-a3-charge-session-evidence-mirror.v1';
import { scientificEvidenceJsonMatchesCanonicalFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  assertAckMirrorsRevisionV1,
  mirrorFromEvidenceRevisionRowV1,
  storedScientificProjectionFromRevisionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.persistence.verify.v1';
import {
  buildM3_3HvH4ScientificRowMetadataFromProjectionV1,
  type M3_3HvH4ChargeSessionScientificRowV1,
} from './m3-3-hv-h4-charge-session-scientific-row.v1';
import { decodeM3_3HvH4EnergyAddedKwhV1 } from './m3-3-hv-h4-a3-energy-encoding.v1';

export function verifyDurableEvidenceRevisionForModeALoaderV1(input: {
  revision: BatteryHvChargeSessionEvidenceRevision;
  ack: BatteryHvChargeSessionEvidenceAck | null | undefined;
}): void {
  const { revision, ack } = input;
  if (revision.evidenceContractVersion !== M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1) {
    throw new H4EvidenceUnsupportedContractVersionError();
  }
  if (
    !scientificEvidenceJsonMatchesCanonicalFingerprintV1({
      scientificEvidenceJson: revision.scientificEvidenceJson,
      sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
    })
  ) {
    throw new H4EvidenceRevisionStoredFingerprintMismatchError();
  }
  try {
    assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
      projection: storedScientificProjectionFromRevisionV1(revision),
      mirror: mirrorFromEvidenceRevisionRowV1(revision),
    });
  } catch {
    throw new H4EvidenceRevisionMirrorIncoherenceError();
  }
  if (!ack) {
    throw new H4EvidenceRevisionMissingDurabilityAckError();
  }
  if (ack.durabilityAckContractVersion !== M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1) {
    throw new H4EvidenceAckIdentityMismatchError();
  }
  assertAckMirrorsRevisionV1(ack, revision);
}

/** Reconstruct H4 scientific row from durable JSON authority (not Float mirror). */
export function reconstructM3_3HvH4ChargeSessionScientificRowFromRevisionV1(
  revision: BatteryHvChargeSessionEvidenceRevision,
): M3_3HvH4ChargeSessionScientificRowV1 {
  const projection = storedScientificProjectionFromRevisionV1(revision);
  return {
    id: projection.sourceHvChargeSessionId,
    organizationId: projection.organizationId,
    vehicleId: projection.vehicleId,
    segmentFingerprint: projection.segmentFingerprint,
    dimoSegmentId: projection.dimoSegmentId,
    source: projection.source,
    startAt: new Date(projection.startAt),
    endAt: projection.endAt ? new Date(projection.endAt) : null,
    isOngoing: projection.isOngoing,
    energyAddedKwh: decodeM3_3HvH4EnergyAddedKwhV1(projection.energyAddedKwh),
    providerObservedAt: projection.providerObservedAt
      ? new Date(projection.providerObservedAt)
      : null,
    metadata: buildM3_3HvH4ScientificRowMetadataFromProjectionV1({
      providerSegmentId: projection.providerSegmentId,
      addedEnergyProvenance: projection.addedEnergyProvenance,
      qualityStatus: projection.qualityStatus,
      supersededBySegmentFingerprint: projection.supersededBySegmentFingerprint,
      startedBeforeRange: projection.startedBeforeRange,
    }),
    createdAt: new Date(projection.sourceCreatedAt),
    receivedAt: new Date(projection.sourceReceivedAt),
    updatedAt: new Date(projection.sourceUpdatedAt),
  };
}
