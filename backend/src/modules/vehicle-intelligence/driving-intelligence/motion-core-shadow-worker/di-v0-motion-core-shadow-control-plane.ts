import {
  evaluateDiV0S4Enablement,
  parseDiV0S4Allowlist,
  parseDiV0S4BooleanFlag,
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
  type DiV0S4EnablementScope,
  type DiV0S4KillEvaluation,
} from '../s4a-foundation/di-v0-s4a-control-plane';
import { parseC5_1ActivationSince } from './di-v0-motion-core-c5-1-admission';

export const DI_V0_MOTION_CORE_SHADOW_ENV_FLAGS = {
  enabled: 'DI_V0_MOTION_CORE_SHADOW_ENABLED',
  worker: 'DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED',
  /** When true, post-trip shadow payload uses C5.1 preferred speed (C4 retained as baseline). Default false. */
  c5_1PreferredSpeed: 'DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED',
} as const;

export const DI_V0_MOTION_CORE_SHADOW_ENV_ALLOWLISTS = {
  organization: 'DI_V0_MOTION_CORE_SHADOW_ORGANIZATION_ALLOWLIST',
  vehicle: 'DI_V0_MOTION_CORE_SHADOW_VEHICLE_ALLOWLIST',
} as const;

export interface DiV0MotionCoreShadowControlPlaneConfig {
  shadowEnabled: boolean;
  workerEnabled: boolean;
  c5_1PreferredSpeedEnabled: boolean;
  /** Trips completed before this instant stay on C4 V1 bundle even when C5.1 flag is on. */
  c5_1ActivationSince: Date | null;
  organizationAllowlist: ReadonlySet<string>;
  vehicleAllowlist: ReadonlySet<string>;
}

export function parseDiV0MotionCoreShadowControlPlaneConfig(
  env: Readonly<Record<string, string | undefined>>,
): DiV0MotionCoreShadowControlPlaneConfig {
  const c5_1PreferredSpeedEnabled = parseDiV0S4BooleanFlag(env[DI_V0_MOTION_CORE_SHADOW_ENV_FLAGS.c5_1PreferredSpeed]);
  const c5_1ActivationSince = parseC5_1ActivationSince(env);
  if (c5_1PreferredSpeedEnabled && !c5_1ActivationSince) {
    throw new Error(
      'DI_V0_MOTION_CORE_C5_1_ACTIVATION_SINCE is required when DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED is true',
    );
  }

  return {
    shadowEnabled: parseDiV0S4BooleanFlag(env[DI_V0_MOTION_CORE_SHADOW_ENV_FLAGS.enabled]),
    workerEnabled: parseDiV0S4BooleanFlag(env[DI_V0_MOTION_CORE_SHADOW_ENV_FLAGS.worker]),
    c5_1PreferredSpeedEnabled,
    c5_1ActivationSince,
    organizationAllowlist: parseDiV0S4Allowlist(env[DI_V0_MOTION_CORE_SHADOW_ENV_ALLOWLISTS.organization]),
    vehicleAllowlist: parseDiV0S4Allowlist(env[DI_V0_MOTION_CORE_SHADOW_ENV_ALLOWLISTS.vehicle]),
  };
}

export function isDiV0MotionCoreShadowRunnable(config: DiV0MotionCoreShadowControlPlaneConfig): boolean {
  return config.shadowEnabled && config.workerEnabled;
}

/**
 * Empty org or vehicle allowlist → no vehicle eligible (explicit pilot gate).
 * When S4 org/vehicle lists are non-empty, shadow allowlists must be subsets.
 */
export function evaluateDiV0MotionCoreShadowEnablement(
  shadow: DiV0MotionCoreShadowControlPlaneConfig,
  s4: DiV0S4ControlPlaneConfig,
  kill: DiV0S4KillEvaluation,
  scope: DiV0S4EnablementScope,
): { enabled: boolean; reason: string | null } {
  if (!isDiV0MotionCoreShadowRunnable(shadow)) {
    return { enabled: false, reason: 'MOTION_CORE_SHADOW_FLAGS_OFF' };
  }
  if (kill.state === 'KILLED') return { enabled: false, reason: 'S4_KILLED' };
  if (shadow.organizationAllowlist.size === 0 || shadow.vehicleAllowlist.size === 0) {
    return { enabled: false, reason: 'MOTION_CORE_SHADOW_ALLOWLIST_EMPTY' };
  }
  if (!shadow.organizationAllowlist.has(scope.organizationId)) {
    return { enabled: false, reason: 'MOTION_CORE_SHADOW_ORG_NOT_ALLOWLISTED' };
  }
  if (!shadow.vehicleAllowlist.has(scope.vehicleId)) {
    return { enabled: false, reason: 'MOTION_CORE_SHADOW_VEHICLE_NOT_ALLOWLISTED' };
  }
  const s4Worker = evaluateDiV0S4Enablement(s4, 'WORKER', scope, kill);
  if (!s4Worker.enabled) return { enabled: false, reason: 'S4_NOT_EFFECTIVELY_ENABLED' };
  if (s4.organizationAllowlist.size > 0 && !s4.organizationAllowlist.has(scope.organizationId)) {
    return { enabled: false, reason: 'S4_ORG_NOT_ALLOWLISTED' };
  }
  if (s4.vehicleAllowlist.size > 0 && !s4.vehicleAllowlist.has(scope.vehicleId)) {
    return { enabled: false, reason: 'S4_VEHICLE_NOT_ALLOWLISTED' };
  }
  if (scope.vehicleOrganizationId !== scope.organizationId) {
    return { enabled: false, reason: 'TENANCY_MISMATCH' };
  }
  return { enabled: true, reason: null };
}
