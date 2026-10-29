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

/** Trip-scoped VSI provenance only — no foreign rolling-window trips or vehicle-level promotion fields. */
function tripScopedVsiProvenance(tripInput: Ds4RpmHfV1aTripInputV1): {
  tripRpmProfile: string;
  iceRpmApplicability: string;
  authoritativeTripClassification: {
    tripId: string;
    profile: string;
    decisionCode: string;
  } | null;
} {
  const snap = tripInput.vsiActiveRpmProfileSnapshot;
  const row = snap?.tripClassifications?.find((c) => c.tripId === tripInput.tripId);
  return {
    tripRpmProfile: tripInput.admission.tripRpmProfile,
    iceRpmApplicability: tripInput.admission.iceRpmApplicability,
    authoritativeTripClassification: row
      ? { tripId: row.tripId, profile: row.profile, decisionCode: row.decisionCode }
      : null,
  };
}

/**
 * Deterministic input identity for idempotent SUCCESS runs and bounded input-revision detection.
 * Excludes computedAt, vehicle-level active profile, and other trips' classifications.
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
    vsi: tripScopedVsiProvenance(tripInput),
    chStatus: tripInput.clickHouseRead.status,
    tenantScopeViolation: tripInput.clickHouseRead.tenantScopeViolation,
    completenessLabel: tripInput.dataQuality.completenessLabel,
    invalidValueCount: tripInput.dataQuality.invalidValueCount,
    duplicateTimestampCount: tripInput.dataQuality.duplicateTimestampCount,
    rpmSeriesDigest: canonicalRpmSeriesDigest(tripInput.rpmPoints),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
