import {
  evaluateDiV0S4Enablement,
  parseDiV0S4Allowlist,
  parseDiV0S4BooleanFlag,
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
  type DiV0S4EnablementScope,
  type DiV0S4KillEvaluation,
} from '../s4a-foundation/di-v0-s4a-control-plane';

export const DI_V0_S4_RESEARCH_ENV_FLAGS = {
  master: 'DI_V0_S4_RESEARCH_ENABLED',
  worker: 'DI_V0_S4_RESEARCH_WORKER_ENABLED',
  roadMatchingV2: 'DI_V0_S4_RESEARCH_ROAD_MATCHING_V2_ENABLED',
} as const;

export const DI_V0_S4_RESEARCH_ENV_ALLOWLISTS = {
  organization: 'DI_V0_S4_RESEARCH_ORGANIZATION_ALLOWLIST',
  vehicle: 'DI_V0_S4_RESEARCH_VEHICLE_ALLOWLIST',
} as const;

export interface DiV0S4ResearchControlPlaneConfig {
  researchEnabled: boolean;
  workerEnabled: boolean;
  roadMatchingV2Enabled: boolean;
  organizationAllowlist: ReadonlySet<string>;
  vehicleAllowlist: ReadonlySet<string>;
}

export function parseDiV0S4ResearchControlPlaneConfig(
  env: Readonly<Record<string, string | undefined>>,
): DiV0S4ResearchControlPlaneConfig {
  return {
    researchEnabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_RESEARCH_ENV_FLAGS.master]),
    workerEnabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_RESEARCH_ENV_FLAGS.worker]),
    roadMatchingV2Enabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_RESEARCH_ENV_FLAGS.roadMatchingV2]),
    organizationAllowlist: parseDiV0S4Allowlist(env[DI_V0_S4_RESEARCH_ENV_ALLOWLISTS.organization]),
    vehicleAllowlist: parseDiV0S4Allowlist(env[DI_V0_S4_RESEARCH_ENV_ALLOWLISTS.vehicle]),
  };
}

export function isDiV0S4ResearchRoadMatchingConfigured(config: DiV0S4ResearchControlPlaneConfig): boolean {
  return config.researchEnabled && config.workerEnabled && config.roadMatchingV2Enabled;
}

/**
 * Research allowlists are independent but must be a subset of effective S4 permission when S4 lists are non-empty.
 */
export function evaluateDiV0S4ResearchEnablement(
  research: DiV0S4ResearchControlPlaneConfig,
  s4: DiV0S4ControlPlaneConfig,
  kill: DiV0S4KillEvaluation,
  scope: DiV0S4EnablementScope,
): { enabled: boolean; reason: string | null } {
  if (!isDiV0S4ResearchRoadMatchingConfigured(research)) {
    return { enabled: false, reason: 'RESEARCH_FLAGS_OFF' };
  }
  if (kill.state === 'KILLED') return { enabled: false, reason: 'S4_KILLED' };
  if (research.organizationAllowlist.size === 0 || research.vehicleAllowlist.size === 0) {
    return { enabled: false, reason: 'RESEARCH_ALLOWLIST_EMPTY' };
  }
  if (!research.organizationAllowlist.has(scope.organizationId)) {
    return { enabled: false, reason: 'RESEARCH_ORG_NOT_ALLOWLISTED' };
  }
  if (!research.vehicleAllowlist.has(scope.vehicleId)) {
    return { enabled: false, reason: 'RESEARCH_VEHICLE_NOT_ALLOWLISTED' };
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

export function resolveDiV0S4ResearchEnvFromProcess(): DiV0S4ResearchControlPlaneConfig {
  return parseDiV0S4ResearchControlPlaneConfig(process.env);
}

export function resolveDiV0S4CombinedResearchEnv(env: Readonly<Record<string, string | undefined>> = process.env) {
  return {
    research: parseDiV0S4ResearchControlPlaneConfig(env),
    s4: parseDiV0S4ControlPlaneConfig(env),
  };
}
