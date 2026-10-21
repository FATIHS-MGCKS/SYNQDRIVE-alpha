import type { HvChargeSession } from '@prisma/client';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import type { M3_3HvH4ChargeSessionEvidencePersistenceInputV1 } from './m3-3-hv-h4-a3-charge-session-evidence.persistence.types.v1';

export function buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(
  session: HvChargeSession,
  evidenceContractVersion: string = M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
): M3_3HvH4ChargeSessionEvidencePersistenceInputV1 {
  const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(
    session,
    evidenceContractVersion,
  );
  const sourceRevisionFingerprint =
    computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
  const mirror = mirrorFromScientificProjectionV1(projection);
  return { projection, sourceRevisionFingerprint, mirror };
}
