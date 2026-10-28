import { parseDiV0S4Allowlist, parseDiV0S4BooleanFlag } from '../s4a-foundation/di-v0-s4a-control-plane';

export const DS4_RPM_HF_V1B_ENV = {
  shadowEnabled: 'DS4_RPM_HF_V1B_SHADOW_ENABLED',
  workerEnabled: 'DS4_RPM_HF_V1B_WORKER_ENABLED',
  enabledSince: 'DS4_RPM_HF_V1B_ENABLED_SINCE',
  batchLimit: 'DS4_RPM_HF_V1B_BATCH_LIMIT',
  organizationAllowlist: 'DS4_RPM_HF_V1B_ORGANIZATION_ALLOWLIST',
  vehicleAllowlist: 'DS4_RPM_HF_V1B_VEHICLE_ALLOWLIST',
} as const;

export type Ds4RpmHfV1bControlPlaneConfig = {
  shadowEnabled: boolean;
  workerEnabled: boolean;
  organizationAllowlist: ReadonlySet<string>;
  vehicleAllowlist: ReadonlySet<string>;
};

export function parseDs4RpmHfV1bControlPlaneConfig(
  env: Readonly<Record<string, string | undefined>>,
): Ds4RpmHfV1bControlPlaneConfig {
  return {
    shadowEnabled: parseDiV0S4BooleanFlag(env[DS4_RPM_HF_V1B_ENV.shadowEnabled]),
    workerEnabled: parseDiV0S4BooleanFlag(env[DS4_RPM_HF_V1B_ENV.workerEnabled]),
    organizationAllowlist: parseDiV0S4Allowlist(env[DS4_RPM_HF_V1B_ENV.organizationAllowlist]),
    vehicleAllowlist: parseDiV0S4Allowlist(env[DS4_RPM_HF_V1B_ENV.vehicleAllowlist]),
  };
}

export function isDs4RpmHfV1bShadowRunnable(config: Ds4RpmHfV1bControlPlaneConfig): boolean {
  return config.shadowEnabled && config.workerEnabled;
}

export function evaluateDs4RpmHfV1bEnablement(
  config: Ds4RpmHfV1bControlPlaneConfig,
  scope: { organizationId: string; vehicleId: string; vehicleOrganizationId: string | null },
): { enabled: boolean; reason: string | null } {
  if (!isDs4RpmHfV1bShadowRunnable(config)) {
    return { enabled: false, reason: 'RPM_HF_V1B_FLAGS_OFF' };
  }
  if (config.organizationAllowlist.size === 0 || config.vehicleAllowlist.size === 0) {
    return { enabled: false, reason: 'RPM_HF_V1B_ALLOWLIST_EMPTY' };
  }
  if (!config.organizationAllowlist.has(scope.organizationId)) {
    return { enabled: false, reason: 'RPM_HF_V1B_ORG_NOT_ALLOWLISTED' };
  }
  if (!config.vehicleAllowlist.has(scope.vehicleId)) {
    return { enabled: false, reason: 'RPM_HF_V1B_VEHICLE_NOT_ALLOWLISTED' };
  }
  if (scope.vehicleOrganizationId != null && scope.vehicleOrganizationId !== scope.organizationId) {
    return { enabled: false, reason: 'TENANCY_MISMATCH' };
  }
  return { enabled: true, reason: null };
}
