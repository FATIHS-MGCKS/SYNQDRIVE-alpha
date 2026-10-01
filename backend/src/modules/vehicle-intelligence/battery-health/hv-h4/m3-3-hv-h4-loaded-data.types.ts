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
  hvSnapshots: M3_3HvH4ObservedRange;
  hvSocEvidence: M3_3HvH4ObservedRange;
  hvTemperatureEvidence: M3_3HvH4ObservedRange;
  hvChargingPowerEvidence: M3_3HvH4ObservedRange;
  retentionCutoffs: {
    hvChargeSessionEarliestRemaining: Date;
    hvSnapshotEarliestRemaining: Date;
  };
}
