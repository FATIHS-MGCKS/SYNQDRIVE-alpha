import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import type { M3_3HvH1ProviderCapabilityMatrixV1 } from './m3-3-hv-h1-provider-capability-matrix.types';
import type { M3_3HvH1SessionSummaryCounts } from './m3-3-hv-h1-session-summary';

export interface M3_3HvH1ReadinessDimensionResult {
  ready: boolean;
  reason: string;
}

export interface M3_3HvH1ReadinessDimensions {
  m2CapabilityReady: M3_3HvH1ReadinessDimensionResult;
  m2EvidenceReady: M3_3HvH1ReadinessDimensionResult;
  m3CapabilityReady: M3_3HvH1ReadinessDimensionResult;
  m3EvidenceReady: M3_3HvH1ReadinessDimensionResult;
  providerSohCapabilityReady: M3_3HvH1ReadinessDimensionResult;
  providerSohEvidenceReady: M3_3HvH1ReadinessDimensionResult;
  sessionEvidenceReady: M3_3HvH1ReadinessDimensionResult;
  freshnessReadyForM2: M3_3HvH1ReadinessDimensionResult;
  freshnessReadyForM3: M3_3HvH1ReadinessDimensionResult;
  longitudinalInputReady: M3_3HvH1ReadinessDimensionResult;
}

export interface EvaluateM3_3HvH1ReadinessInput {
  methodProfile: HvMethodProfile;
  matrix: M3_3HvH1ProviderCapabilityMatrixV1;
  sessionCounts: M3_3HvH1SessionSummaryCounts;
  m2ShadowObservationCount: number;
  m3ShadowObservationCount: number;
  providerSohObservationCount: number;
  longitudinalCandidateCount: number;
}

function dim(ready: boolean, reason: string): M3_3HvH1ReadinessDimensionResult {
  return { ready, reason };
}

function matrixRowFreshForMethod(
  matrix: M3_3HvH1ProviderCapabilityMatrixV1,
  signalKeys: string[],
): boolean {
  return signalKeys.every((key) => {
    const row = matrix.rows.find((r) => r.signalKey === key);
    return row?.freshnessClass === 'FRESH_PROVIDER_TIMESTAMP';
  });
}

export function evaluateM3_3HvH1Readiness(
  input: EvaluateM3_3HvH1ReadinessInput,
): M3_3HvH1ReadinessDimensions {
  const mp = input.methodProfile;
  const m2Cap = mp.supportedCapacityMethods.includes('M2_CURRENT_ENERGY_SOC');
  const m3Cap = mp.supportedCapacityMethods.includes('M3_ADDED_ENERGY_DELTA_SOC');
  const sohCap = mp.supportedCapacityMethods.includes('PROVIDER_HV_SOH');

  const m2Evidence = input.m2ShadowObservationCount > 0;
  const m3Evidence = input.m3ShadowObservationCount > 0;
  const sohEvidence = input.providerSohObservationCount > 0;

  const m2Fresh = m2Cap
    ? matrixRowFreshForMethod(input.matrix, ['hv.soc', 'hv.current_energy'])
    : false;
  const m3Fresh = m3Cap
    ? matrixRowFreshForMethod(input.matrix, [
        'hv.soc',
        'hv.added_energy',
        'dimo.segments.recharge',
      ])
    : false;

  const sessionReady = input.sessionCounts.strongSessionCount > 0;

  const longitudinalReady =
    input.longitudinalCandidateCount > 0
      ? dim(true, 'at_least_one_longitudinal_input_candidate_constructed')
      : dim(false, 'LONGITUDINAL_INPUT_CANDIDATE_NOT_IMPLEMENTED');

  return {
    m2CapabilityReady: dim(
      m2Cap,
      m2Cap ? 'method_profile_supports_M2' : 'M2_not_supported_by_capability',
    ),
    m2EvidenceReady: dim(
      m2Evidence,
      m2Evidence
        ? 'hv_capacity_observation_M2_present'
        : 'no_M2_shadow_observation_under_existing_gates',
    ),
    m3CapabilityReady: dim(
      m3Cap,
      m3Cap ? 'method_profile_supports_M3' : 'M3_not_supported_by_capability',
    ),
    m3EvidenceReady: dim(
      m3Evidence && input.sessionCounts.capacityValidationEligibleCount > 0,
      m3Evidence
        ? input.sessionCounts.capacityValidationEligibleCount > 0
          ? 'M3_observation_and_validation_eligible_session'
          : 'M3_observation_without_validation_eligible_session'
        : 'no_M3_shadow_observation',
    ),
    providerSohCapabilityReady: dim(
      sohCap,
      sohCap ? 'provider_soh_capability' : 'provider_soh_not_listed',
    ),
    providerSohEvidenceReady: dim(
      sohEvidence,
      sohEvidence ? 'provider_soh_observation_present' : 'no_provider_soh_observation',
    ),
    sessionEvidenceReady: dim(
      sessionReady,
      sessionReady ? 'strong_qualified_session_present' : 'no_strong_qualified_session',
    ),
    freshnessReadyForM2: dim(
      m2Fresh,
      m2Fresh ? 'required_M2_signals_fresh' : 'M2_required_signals_not_all_fresh',
    ),
    freshnessReadyForM3: dim(
      m3Fresh,
      m3Fresh ? 'required_M3_signals_fresh' : 'M3_required_signals_not_all_fresh',
    ),
    longitudinalInputReady: longitudinalReady,
  };
}
