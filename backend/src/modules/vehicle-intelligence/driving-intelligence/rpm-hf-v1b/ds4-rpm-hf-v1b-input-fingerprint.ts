import { createHash } from 'crypto';
import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import {
  DS4_RPM_HF_V1B_CONTRACT_VERSION,
  DS4_RPM_HF_V1B_ENGINE_VERSION,
} from './ds4-rpm-hf-v1b.contract';

function canonicalRpmSeriesDigest(
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>,
): string {
  const sorted = [...points].sort((a, b) => {
    const t = a.recordedAtIso.localeCompare(b.recordedAtIso);
    if (t !== 0) return t;
    return a.valueRpm - b.valueRpm;
  });
  const h = createHash('sha256');
  for (const p of sorted) {
    h.update(p.recordedAtIso);
    h.update('\0');
    h.update(String(p.valueRpm));
    h.update('\n');
  }
  return h.digest('hex');
}

function vsiClassificationProvenance(tripInput: Ds4RpmHfV1aTripInputV1): {
  tripRpmProfile: string;
  iceRpmApplicability: string;
  snapshotTripClassifications: ReadonlyArray<{ tripId: string; profile: string }>;
  profileSemanticFingerprint: string | null;
} {
  const snap = tripInput.vsiActiveRpmProfileSnapshot;
  return {
    tripRpmProfile: tripInput.admission.tripRpmProfile,
    iceRpmApplicability: tripInput.admission.iceRpmApplicability,
    snapshotTripClassifications:
      snap?.tripClassifications?.map((c) => ({ tripId: c.tripId, profile: c.profile })) ?? [],
    profileSemanticFingerprint: snap?.profileSemanticFingerprint ?? null,
  };
}

/**
 * Deterministic input identity for idempotent SUCCESS runs and bounded input-revision detection.
 * Excludes computedAt and other processing-time fields.
 */
export function computeDs4RpmHfV1bInputFingerprint(tripInput: Ds4RpmHfV1aTripInputV1): string {
  const payload = {
    contractVersion: DS4_RPM_HF_V1B_CONTRACT_VERSION,
    engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION,
    v1aContractVersion: tripInput.contractVersion,
    organizationId: tripInput.organizationId,
    vehicleId: tripInput.vehicleId,
    tripId: tripInput.tripId,
    providerSourceLinkId: tripInput.providerSourceLinkId,
    tripStartIso: tripInput.tripStartIso,
    tripEndIso: tripInput.tripEndIso,
    vsi: vsiClassificationProvenance(tripInput),
    chStatus: tripInput.clickHouseRead.status,
    tenantScopeViolation: tripInput.clickHouseRead.tenantScopeViolation,
    completenessLabel: tripInput.dataQuality.completenessLabel,
    rpmSeriesDigest: canonicalRpmSeriesDigest(tripInput.rpmPoints),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
