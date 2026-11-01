import { resolveDiV0SourceFamily } from '../../driving-intelligence/position-acquisition/di-v0-position-source-family';
import {
  evaluateDiV0S4EnablementWithFleetMotionPolicyV1,
  isDiV0S4LegacyAllowlistAdmissionRequired,
  type DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
} from '../../driving-intelligence/fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1';
import { resolveDs4ProviderCapabilityFromS4SourceFamilyV1 } from '../../driving-intelligence/fleet-motion-admission/di-v0-ds4-provider-capability.v1';
import type { DiV0S4EnablementScope, DiV0S4KillEvaluation } from '../../driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import type { TripDiBoundaryAdmissionRecoveryPolicy } from './trip-di-boundary-admission-recovery.policy';
import { isTripDiBoundaryAdmissionRecoveryEnabled } from './trip-di-boundary-admission-recovery.policy';

export type TripDiBoundaryAdmissionRecoveryVehicleContextV1 = {
  organizationId: string;
  vehicleId: string;
  vehicleOrganizationId: string;
  registryLifecycle: string;
  dimoRawJson: unknown;
};

export type TripDiBoundaryAdmissionRecoveryEligibilityV1 = {
  eligible: boolean;
  failedTerms: string[];
};

/**
 * Recovery vehicle eligibility aligned with S4 DISCOVERY enablement + DS4 fleet rollout policy.
 * Provider families UNKNOWN/UNSUPPORTED fail closed; only RUPTELA_R1 and API_SYNTHETIC are SUPPORTED.
 */
export function evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1(params: {
  policy: TripDiBoundaryAdmissionRecoveryPolicy;
  fleetPolicy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
  kill: DiV0S4KillEvaluation;
  vehicle: TripDiBoundaryAdmissionRecoveryVehicleContextV1;
}): TripDiBoundaryAdmissionRecoveryEligibilityV1 {
  const failedTerms: string[] = [];
  if (!isTripDiBoundaryAdmissionRecoveryEnabled(params.policy)) {
    failedTerms.push('RECOVERY_NOT_ACTIVATED');
    return { eligible: false, failedTerms };
  }
  if (params.vehicle.registryLifecycle !== 'ACTIVE') {
    failedTerms.push('REGISTRY_NOT_ACTIVE');
  }
  if (params.vehicle.vehicleOrganizationId !== params.vehicle.organizationId) {
    failedTerms.push('TENANCY_MISMATCH');
  }
  const scope: DiV0S4EnablementScope = {
    organizationId: params.vehicle.organizationId,
    vehicleId: params.vehicle.vehicleId,
    vehicleOrganizationId: params.vehicle.vehicleOrganizationId,
  };
  const enablement = evaluateDiV0S4EnablementWithFleetMotionPolicyV1(
    params.policy.s4,
    params.fleetPolicy,
    'DISCOVERY',
    scope,
    params.kill,
  );
  for (const term of enablement.failedTerms) {
    failedTerms.push(`S4_${term}`);
  }
  const { sourceFamily } = resolveDiV0SourceFamily(params.vehicle.dimoRawJson);
  const provider = resolveDs4ProviderCapabilityFromS4SourceFamilyV1(sourceFamily);
  if (provider.state !== 'SUPPORTED') {
    failedTerms.push(`PROVIDER_${provider.state}`);
  }
  if (
    isDiV0S4LegacyAllowlistAdmissionRequired(params.fleetPolicy) &&
    (!params.policy.s4.organizationAllowlist.size || !params.policy.s4.vehicleAllowlist.size)
  ) {
    failedTerms.push('LEGACY_ALLOWLIST_EMPTY');
  }
  return { eligible: failedTerms.length === 0, failedTerms };
}
