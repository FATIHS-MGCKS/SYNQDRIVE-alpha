import type { HvChargeSession } from '@prisma/client';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 } from './m3-3-hv-h4-a3.constants';
import {
  deriveEnergyAddedKwhDbMirrorFromTaggedV1,
  encodeM3_3HvH4EnergyAddedKwhV1,
} from './m3-3-hv-h4-a3-energy-encoding.v1';
import type {
  M3_3HvH4ChargeSessionEvidenceMirrorV1,
  M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';

function stableIso(date: Date): string {
  return date.toISOString();
}

/**
 * Projects one live `HvChargeSession` row into H4 V1 durable source evidence.
 * Pure — no DB, clock injection, provider calls, lifecycle, or eligibility.
 */
export function buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(
  session: HvChargeSession,
  evidenceContractVersion: string = M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
): M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 {
  const meta = (session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
  return {
    evidenceContractVersion,
    organizationId: session.organizationId,
    vehicleId: session.vehicleId,
    sourceHvChargeSessionId: session.id,
    segmentFingerprint: session.segmentFingerprint,
    dimoSegmentId: session.dimoSegmentId,
    providerSegmentId: meta.providerSegmentId ?? null,
    source: session.source,
    startAt: stableIso(session.startAt),
    endAt: session.endAt ? stableIso(session.endAt) : null,
    isOngoing: session.isOngoing,
    energyAddedKwh: encodeM3_3HvH4EnergyAddedKwhV1(session.energyAddedKwh),
    providerObservedAt: session.providerObservedAt
      ? stableIso(session.providerObservedAt)
      : null,
    addedEnergyProvenance: meta.addedEnergyProvenance ?? null,
    qualityStatus: meta.qualityStatus ?? null,
    supersededBySegmentFingerprint: meta.supersededBySegmentFingerprint ?? null,
    startedBeforeRange: meta.startedBeforeRange === true,
    sourceCreatedAt: stableIso(session.createdAt),
    sourceReceivedAt: stableIso(session.receivedAt),
    sourceUpdatedAt: stableIso(session.updatedAt),
  };
}

export function buildM3_3HvH4ChargeSessionEvidenceMirrorFromSessionV1(
  session: HvChargeSession,
): M3_3HvH4ChargeSessionEvidenceMirrorV1 {
  const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);
  return mirrorFromScientificProjectionV1(projection);
}

export function mirrorFromScientificProjectionV1(
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
): M3_3HvH4ChargeSessionEvidenceMirrorV1 {
  const energyAddedKwh = deriveEnergyAddedKwhDbMirrorFromTaggedV1(
    projection.energyAddedKwh,
  );
  return {
    organizationId: projection.organizationId,
    vehicleId: projection.vehicleId,
    sourceHvChargeSessionId: projection.sourceHvChargeSessionId,
    segmentFingerprint: projection.segmentFingerprint,
    dimoSegmentId: projection.dimoSegmentId,
    providerSegmentId: projection.providerSegmentId,
    source: projection.source,
    startAt: new Date(projection.startAt),
    endAt: projection.endAt ? new Date(projection.endAt) : null,
    isOngoing: projection.isOngoing,
    energyAddedKwh,
    providerObservedAt: projection.providerObservedAt
      ? new Date(projection.providerObservedAt)
      : null,
    addedEnergyProvenance: projection.addedEnergyProvenance,
    qualityStatus: projection.qualityStatus,
    supersededBySegmentFingerprint: projection.supersededBySegmentFingerprint,
    startedBeforeRange: projection.startedBeforeRange,
    sourceCreatedAt: new Date(projection.sourceCreatedAt),
    sourceReceivedAt: new Date(projection.sourceReceivedAt),
    sourceUpdatedAt: new Date(projection.sourceUpdatedAt),
  };
}
