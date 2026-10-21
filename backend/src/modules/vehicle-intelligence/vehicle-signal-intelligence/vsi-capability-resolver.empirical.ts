import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import { VsiCapabilityResolverReasonCode } from './vsi-capability-resolver.types';

const RECOGNIZED = new Set<string>(Object.values(VsiEmpiricalObservationStatus));

/** Only currently fresh empirical observation qualifies for EMPIRICAL_OBSERVED requirements. */
export function isQualifyingEmpiricalObservation(status: string): boolean {
  return status === VsiEmpiricalObservationStatus.OBSERVED;
}

export function empiricalObservationFailureReason(
  status: string,
): VsiCapabilityResolverReasonCode {
  if (!RECOGNIZED.has(status)) {
    return VsiCapabilityResolverReasonCode.EMPIRICAL_OBSERVATION_INSUFFICIENT;
  }
  if (status === VsiEmpiricalObservationStatus.NEVER_OBSERVED) {
    return VsiCapabilityResolverReasonCode.SIGNAL_NEVER_OBSERVED;
  }
  if (status === VsiEmpiricalObservationStatus.OBSERVED_STALE) {
    return VsiCapabilityResolverReasonCode.EMPIRICAL_OBSERVATION_STALE;
  }
  if (status === VsiEmpiricalObservationStatus.NOT_OBSERVED_IN_WINDOW) {
    return VsiCapabilityResolverReasonCode.EMPIRICAL_OBSERVATION_INSUFFICIENT;
  }
  return VsiCapabilityResolverReasonCode.EMPIRICAL_OBSERVATION_INSUFFICIENT;
}
