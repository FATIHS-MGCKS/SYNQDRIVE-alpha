import type { HvChargeSession } from '@prisma/client';
import type { M3_3HvH4GroundTruthRow } from './m3-3-hv-h4-lifecycle.util';

export interface M3_3HvH4ObservedRange {
  earliest: Date | null;
  latest: Date | null;
  count: number;
}

export interface M3_3HvH4LoadedDataV1 {
  organizationId: string;
  vehicleId: string;
  evaluationAt: Date;
  groundTruthEvents: M3_3HvH4GroundTruthRow[];
  chargeSessions: HvChargeSession[];
  chargeSessionSourceLoad: {
    loadedCount: number;
    hardLimit: number;
    sourceTruncated: boolean;
    hardLimitReached: boolean;
  };
  hvSnapshotRecordedAt: Date[];
  hvSocEvidenceObservedAt: Date[];
  hvTemperatureEvidenceObservedAt: Date[];
  hvChargingPowerEvidenceObservedAt: Date[];
  retentionCutoffs: {
    hvChargeSessionEarliestRemaining: Date;
    hvSnapshotEarliestRemaining: Date;
  };
}
