import type {
  BatteryHvChargeSessionEvidenceAck,
  BatteryHvChargeSessionEvidenceRevision,
} from '@prisma/client';
import type {
  M3_3HvH4ChargeSessionEvidenceMirrorV1,
  M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';

export type M3_3HvH4ChargeSessionEvidenceScientificIdentityV1 = {
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  evidenceContractVersion: string;
  sourceRevisionFingerprint: string;
};

export type M3_3HvH4ChargeSessionEvidencePersistenceInputV1 = {
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
  sourceRevisionFingerprint: string;
  mirror: M3_3HvH4ChargeSessionEvidenceMirrorV1;
};

export type M3_3HvH4ChargeSessionEvidencePersistOutcomeV1 =
  | {
      persistenceOutcome: 'CREATED';
      revision: BatteryHvChargeSessionEvidenceRevision;
      ack: BatteryHvChargeSessionEvidenceAck;
    }
  | {
      persistenceOutcome: 'ALREADY_EXISTS';
      revision: BatteryHvChargeSessionEvidenceRevision;
      ack: BatteryHvChargeSessionEvidenceAck;
    };
