import { createHash } from 'crypto';
import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1B_ENGINE_VERSION } from './ds4-rpm-hf-v1b.contract';

export function computeDs4RpmHfV1bInputFingerprint(tripInput: Ds4RpmHfV1aTripInputV1): string {
  const payload = {
    engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION,
    v1aContractVersion: tripInput.contractVersion,
    organizationId: tripInput.organizationId,
    vehicleId: tripInput.vehicleId,
    tripId: tripInput.tripId,
    tripStartIso: tripInput.tripStartIso,
    tripEndIso: tripInput.tripEndIso,
    tripRpmProfile: tripInput.admission.tripRpmProfile,
    chStatus: tripInput.clickHouseRead.status,
    completenessLabel: tripInput.dataQuality.completenessLabel,
    totalMatchingCount: tripInput.dataQuality.totalMatchingCount,
    returnedPointCount: tripInput.dataQuality.returnedPointCount,
    validPointCount: tripInput.dataQuality.validPointCount,
    earliest: tripInput.dataQuality.earliestRecordedAtIso,
    latest: tripInput.dataQuality.latestRecordedAtIso,
    tenantScopeViolation: tripInput.clickHouseRead.tenantScopeViolation,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
