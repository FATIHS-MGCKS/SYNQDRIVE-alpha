import type {
  BatteryEvidence,
  BatteryGroundTruthEvent,
  BatteryGroundTruthRevocation,
  HvCapacityObservation,
  HvChargeSession,
} from '@prisma/client';

export type M3_3HvH2GroundTruthEventRow = BatteryGroundTruthEvent & {
  revocations: BatteryGroundTruthRevocation[];
  supersededByGroundTruthEvents: { id: string }[];
};

export interface M3_3HvH2LoadedDataV1 {
  organizationId: string;
  vehicleId: string;
  evaluationAt: Date;
  capacityObservations: HvCapacityObservation[];
  providerSohEvidence: BatteryEvidence[];
  groundTruthEvents: M3_3HvH2GroundTruthEventRow[];
  sessionsById: Map<string, HvChargeSession>;
  truncated: {
    capacityObservations: boolean;
    providerSoh: boolean;
    groundTruth: boolean;
    sessions: boolean;
  };
}
