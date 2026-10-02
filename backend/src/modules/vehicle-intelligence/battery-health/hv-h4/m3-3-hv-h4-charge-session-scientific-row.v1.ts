import type { HvChargeSession } from '@prisma/client';

/**
 * H4-scoped charge-session scientific row — fields consumed by A1/A2/coverage.
 * Live `HvChargeSession` rows satisfy this structurally; durable reconstruction must match.
 */
export interface M3_3HvH4ChargeSessionScientificRowV1 {
  id: string;
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  dimoSegmentId: string | null;
  source: string;
  startAt: Date;
  endAt: Date | null;
  isOngoing: boolean;
  energyAddedKwh: number | null;
  providerObservedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  receivedAt: Date;
  updatedAt: Date;
}

export function hvChargeSessionAsM3_3HvH4ScientificRowV1(
  session: HvChargeSession,
): M3_3HvH4ChargeSessionScientificRowV1 {
  return {
    id: session.id,
    organizationId: session.organizationId,
    vehicleId: session.vehicleId,
    segmentFingerprint: session.segmentFingerprint,
    dimoSegmentId: session.dimoSegmentId,
    source: session.source,
    startAt: session.startAt,
    endAt: session.endAt,
    isOngoing: session.isOngoing,
    energyAddedKwh: session.energyAddedKwh,
    providerObservedAt: session.providerObservedAt,
    metadata: session.metadata,
    createdAt: session.createdAt,
    receivedAt: session.receivedAt,
    updatedAt: session.updatedAt,
  };
}

export function buildM3_3HvH4ScientificRowMetadataFromProjectionV1(input: {
  providerSegmentId: string | null;
  addedEnergyProvenance: string | null;
  qualityStatus: string | null;
  supersededBySegmentFingerprint: string | null;
  startedBeforeRange: boolean;
}): unknown {
  return {
    providerSegmentId: input.providerSegmentId,
    addedEnergyProvenance: input.addedEnergyProvenance,
    qualityStatus: input.qualityStatus,
    supersededBySegmentFingerprint: input.supersededBySegmentFingerprint,
    startedBeforeRange: input.startedBeforeRange,
  };
}
