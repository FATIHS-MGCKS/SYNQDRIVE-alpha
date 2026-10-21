import type { M3_3HvH4TaggedEnergyAddedKwhV1 } from './m3-3-hv-h4-a3-energy-encoding.v1';

/** Pure scientific source-evidence projection (no envelope / derived eligibility). */
export type M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 = {
  evidenceContractVersion: string;
  organizationId: string;
  vehicleId: string;
  sourceHvChargeSessionId: string;
  segmentFingerprint: string;
  dimoSegmentId: string | null;
  providerSegmentId: string | null;
  source: string;
  startAt: string;
  endAt: string | null;
  isOngoing: boolean;
  energyAddedKwh: M3_3HvH4TaggedEnergyAddedKwhV1;
  providerObservedAt: string | null;
  addedEnergyProvenance: string | null;
  qualityStatus: string | null;
  supersededBySegmentFingerprint: string | null;
  startedBeforeRange: boolean;
  sourceCreatedAt: string;
  sourceReceivedAt: string;
  sourceUpdatedAt: string;
};

/** Mirror columns persisted alongside scientificEvidenceJson (A3.1 schema). */
export type M3_3HvH4ChargeSessionEvidenceMirrorV1 = {
  organizationId: string;
  vehicleId: string;
  sourceHvChargeSessionId: string;
  segmentFingerprint: string;
  dimoSegmentId: string | null;
  providerSegmentId: string | null;
  source: string;
  startAt: Date;
  endAt: Date | null;
  isOngoing: boolean;
  energyAddedKwh: number | null;
  providerObservedAt: Date | null;
  addedEnergyProvenance: string | null;
  qualityStatus: string | null;
  supersededBySegmentFingerprint: string | null;
  startedBeforeRange: boolean;
  sourceCreatedAt: Date;
  sourceReceivedAt: Date;
  sourceUpdatedAt: Date;
};
