/**
 * DS4 fleet-wide S4 / Motion-Core rollout policy (authorization layer only).
 *
 * Separates:
 * A) Rollout authorization (this module + `DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED`)
 * B) Vehicle/provider technical capability (`di-v0-ds4-provider-capability.v1.ts`)
 * C) Trip-level evidence / boundary admission (existing trip + S4 repository guards)
 * D) Assessment evidence quality (DS4 Assessment L2 engine — unchanged here)
 *
 * Default: global rollout OFF → legacy env allowlists remain mandatory (empty = none).
 */

import {
  evaluateDiV0S4Enablement,
  parseDiV0S4BooleanFlag,
  type DiV0S4ControlPlaneConfig,
  type DiV0S4ControlRole,
  type DiV0S4EnablementResult,
  type DiV0S4EnablementScope,
  type DiV0S4EnablementTerm,
  type DiV0S4KillEvaluation,
} from '../s4a-foundation/di-v0-s4a-control-plane';
import {
  evaluateDiV0MotionCoreShadowEnablement,
  type DiV0MotionCoreShadowControlPlaneConfig,
} from '../motion-core-shadow-worker/di-v0-motion-core-shadow-control-plane';
import { isCanonicalDs4AssessmentUuidV1 } from '../ds4-assessment/ds4-assessment-eligibility-policy.v1';

export const DS4_FLEET_MOTION_ADMISSION_POLICY_VERSION_V1 = 'DS4_FLEET_MOTION_ADMISSION_POLICY_V1' as const;

export const DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV = {
  authorized: 'DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED',
} as const;

export type DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 = {
  policyVersion: typeof DS4_FLEET_MOTION_ADMISSION_POLICY_VERSION_V1;
  /** Explicit owner authorization for fleet-wide S4 + Motion-Core scheduling (not deployment). */
  globalRolloutAuthorized: boolean;
};

export const DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 = {
  policyVersion: DS4_FLEET_MOTION_ADMISSION_POLICY_VERSION_V1,
  globalRolloutAuthorized: false,
};

export function parseDiV0Ds4FleetMotionAdmissionPolicyV1(
  env: Readonly<Record<string, string | undefined>>,
): DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 {
  return {
    policyVersion: DS4_FLEET_MOTION_ADMISSION_POLICY_VERSION_V1,
    globalRolloutAuthorized: parseDiV0S4BooleanFlag(env[DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_ENV.authorized]),
  };
}

export function isDiV0S4LegacyAllowlistAdmissionRequired(
  policy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
): boolean {
  return !policy.globalRolloutAuthorized;
}

function fleetWideAllowlistTerms(scope: DiV0S4EnablementScope): Pick<Record<DiV0S4EnablementTerm, boolean>, 'ORG_ALLOWLISTED' | 'VEHICLE_ALLOWLISTED'> {
  const orgOk =
    isCanonicalDs4AssessmentUuidV1(scope.organizationId) &&
    scope.vehicleOrganizationId != null &&
    scope.vehicleOrganizationId === scope.organizationId;
  const vehicleOk = isCanonicalDs4AssessmentUuidV1(scope.vehicleId) && orgOk;
  return { ORG_ALLOWLISTED: orgOk, VEHICLE_ALLOWLISTED: vehicleOk };
}

/**
 * S4 enablement with fleet rollout policy. When global rollout is OFF, behaviour matches
 * `evaluateDiV0S4Enablement` (empty allowlist ⇒ ORG/VEHICLE terms fail).
 */
export function evaluateDiV0S4EnablementWithFleetMotionPolicyV1(
  config: DiV0S4ControlPlaneConfig,
  policy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
  role: DiV0S4ControlRole,
  scope: DiV0S4EnablementScope,
  kill: DiV0S4KillEvaluation,
): DiV0S4EnablementResult {
  if (isDiV0S4LegacyAllowlistAdmissionRequired(policy)) {
    return evaluateDiV0S4Enablement(config, role, scope, kill);
  }
  const fleetTerms = fleetWideAllowlistTerms(scope);
  const terms: Record<DiV0S4EnablementTerm, boolean> = {
    MASTER: config.masterEnabled,
    ROLE_FLAG: role === 'DISCOVERY' ? config.discoveryEnabled : config.workerEnabled,
    POSITION: config.positionEnabled,
    ORG_ALLOWLISTED: fleetTerms.ORG_ALLOWLISTED,
    VEHICLE_ALLOWLISTED: fleetTerms.VEHICLE_ALLOWLISTED,
    VEHICLE_BELONGS_TO_ORG: scope.vehicleOrganizationId != null && scope.vehicleOrganizationId === scope.organizationId,
    DB_NOT_KILLED: kill.state === 'NOT_KILLED',
  };
  const failedTerms = (Object.keys(terms) as DiV0S4EnablementTerm[]).filter((term) => !terms[term]);
  return { enabled: failedTerms.length === 0, failedTerms };
}

export function isDiV0S4WorkerSchedulingConfiguredV1(
  config: DiV0S4ControlPlaneConfig,
  policy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
): boolean {
  if (!config.masterEnabled || !config.workerEnabled || !config.positionEnabled) return false;
  if (isDiV0S4LegacyAllowlistAdmissionRequired(policy)) {
    return config.organizationAllowlist.size > 0 && config.vehicleAllowlist.size > 0;
  }
  return true;
}

export function isDiV0S4DiscoverySchedulingConfiguredV1(
  config: DiV0S4ControlPlaneConfig,
  policy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
): boolean {
  if (!config.masterEnabled || !config.discoveryEnabled || !config.positionEnabled) return false;
  if (isDiV0S4LegacyAllowlistAdmissionRequired(policy)) {
    return config.organizationAllowlist.size > 0 && config.vehicleAllowlist.size > 0;
  }
  return true;
}

export function evaluateDiV0MotionCoreShadowEnablementWithFleetMotionPolicyV1(
  shadow: DiV0MotionCoreShadowControlPlaneConfig,
  s4: DiV0S4ControlPlaneConfig,
  policy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
  kill: DiV0S4KillEvaluation,
  scope: DiV0S4EnablementScope,
): { enabled: boolean; reason: string | null } {
  if (isDiV0S4LegacyAllowlistAdmissionRequired(policy)) {
    return evaluateDiV0MotionCoreShadowEnablement(shadow, s4, kill, scope);
  }

  if (!shadow.shadowEnabled || !shadow.workerEnabled) {
    return { enabled: false, reason: 'MOTION_CORE_SHADOW_FLAGS_OFF' };
  }
  if (kill.state === 'KILLED') return { enabled: false, reason: 'S4_KILLED' };

  const s4Worker = evaluateDiV0S4EnablementWithFleetMotionPolicyV1(s4, policy, 'WORKER', scope, kill);
  if (!s4Worker.enabled) return { enabled: false, reason: 'S4_NOT_EFFECTIVELY_ENABLED' };

  if (scope.vehicleOrganizationId !== scope.organizationId) {
    return { enabled: false, reason: 'TENANCY_MISMATCH' };
  }

  return { enabled: true, reason: null };
}

export function isDiV0MotionCoreShadowDiscoveryConfiguredV1(
  shadow: DiV0MotionCoreShadowControlPlaneConfig,
  policy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
): boolean {
  if (!shadow.shadowEnabled || !shadow.workerEnabled) return false;
  if (isDiV0S4LegacyAllowlistAdmissionRequired(policy)) {
    return shadow.organizationAllowlist.size > 0 && shadow.vehicleAllowlist.size > 0;
  }
  return true;
}
