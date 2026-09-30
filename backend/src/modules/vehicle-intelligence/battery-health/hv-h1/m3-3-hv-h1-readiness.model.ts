import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import type { M3_3HvH1ProviderCapabilityMatrixV1 } from './m3-3-hv-h1-provider-capability-matrix.types';

export interface M3_3HvH1ReadinessDimensions {
  capabilityReady: boolean;
  freshnessReady: boolean;
  sessionEvidenceReady: boolean;
  m2EvidenceReady: boolean;
  m3EvidenceReady: boolean;
  providerSohReady: boolean;
  longitudinalInputReady: boolean;
}

export function evaluateM3_3HvH1Readiness(input: {
  matrix: M3_3HvH1ProviderCapabilityMatrixV1;
  methodProfile: HvMethodProfile;
  strongSessionCount: number;
  weakSessionCount: number;
}): M3_3HvH1ReadinessDimensions {
  const usableRows = input.matrix.rows.filter(
    (r) => r.qualityClass === 'CAPABILITY_USABLE' || r.qualityClass === 'CAPABILITY_STALE',
  );
  const freshRows = input.matrix.rows.filter(
    (r) => r.freshnessClass === 'FRESH_PROVIDER_TIMESTAMP',
  );

  const capabilityReady = usableRows.length >= 3;
  const freshnessReady = freshRows.length >= 2;

  const sessionEvidenceReady = input.strongSessionCount > 0;
  const m2EvidenceReady = input.methodProfile.supportedCapacityMethods.includes(
    'M2_CURRENT_ENERGY_SOC',
  );
  const m3EvidenceReady =
    input.methodProfile.supportedCapacityMethods.includes('M3_ADDED_ENERGY_DELTA_SOC') &&
    input.strongSessionCount > 0;
  const providerSohReady = input.methodProfile.providerSohAvailable;
  const longitudinalInputReady =
    sessionEvidenceReady && (m2EvidenceReady || m3EvidenceReady || providerSohReady);

  return {
    capabilityReady,
    freshnessReady,
    sessionEvidenceReady,
    m2EvidenceReady,
    m3EvidenceReady,
    providerSohReady,
    longitudinalInputReady,
  };
}
