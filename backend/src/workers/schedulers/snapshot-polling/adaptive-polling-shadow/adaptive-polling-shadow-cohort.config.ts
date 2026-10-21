import { createHash } from 'node:crypto';
import { isApdShadowEnabled } from './adaptive-polling-shadow.config';

export const WORKER_APD_SHADOW_COHORT_JSON_ENV = 'WORKER_APD_SHADOW_COHORT_JSON';

export const P25_APD_LTE_R1_COHORT_V1 = 'P25_APD_LTE_R1_COHORT_V1';

export const APD_SHADOW_COHORT_MAX_MEMBERS = 100;

export type ApdShadowCohortConfigState =
  | 'DISABLED'
  | 'READY'
  | 'MISSING'
  | 'INVALID'
  | 'EMPTY'
  | 'UNSUPPORTED_VERSION'
  | 'TOO_LARGE';

export type ApdShadowCohortExcludedReason =
  | 'NOT_ALLOWLISTED'
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'UNSUPPORTED_VERSION'
  | 'EMPTY_COHORT';

export interface ApdShadowCohortMember {
  organizationId: string;
  vehicleId: string;
}

export interface ApdShadowCohortConfig {
  version: typeof P25_APD_LTE_R1_COHORT_V1;
  members: ApdShadowCohortMember[];
}

export interface ApdShadowCohortRuntime {
  state: ApdShadowCohortConfigState;
  config: ApdShadowCohortConfig | null;
  configFingerprintSha256: string | null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseMember(raw: unknown): ApdShadowCohortMember | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.organizationId) || !isNonEmptyString(o.vehicleId)) {
    return null;
  }
  return {
    organizationId: o.organizationId.trim(),
    vehicleId: o.vehicleId.trim(),
  };
}

export function buildApdShadowTenantMemoryKey(
  organizationId: string,
  vehicleId: string,
): string {
  return `${organizationId}\u0000${vehicleId}`;
}

export function computeApdShadowCohortFingerprintSha256(
  config: ApdShadowCohortConfig,
): string {
  const sorted = [...config.members].sort((a, b) => {
    const o = a.organizationId.localeCompare(b.organizationId);
    if (o !== 0) return o;
    return a.vehicleId.localeCompare(b.vehicleId);
  });
  const canonical = JSON.stringify({
    version: config.version,
    members: sorted.map((m) => ({
      organizationId: m.organizationId,
      vehicleId: m.vehicleId,
    })),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function parseApdShadowCohortRuntime(
  env: NodeJS.ProcessEnv = process.env,
): ApdShadowCohortRuntime {
  if (!isApdShadowEnabled(env)) {
    return { state: 'DISABLED', config: null, configFingerprintSha256: null };
  }

  const rawJson = env[WORKER_APD_SHADOW_COHORT_JSON_ENV];
  if (rawJson == null || rawJson.trim() === '') {
    return { state: 'MISSING', config: null, configFingerprintSha256: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { state: 'INVALID', config: null, configFingerprintSha256: null };
  }

  if (parsed == null || typeof parsed !== 'object') {
    return { state: 'INVALID', config: null, configFingerprintSha256: null };
  }

  const root = parsed as Record<string, unknown>;
  if (root.version !== P25_APD_LTE_R1_COHORT_V1) {
    return { state: 'UNSUPPORTED_VERSION', config: null, configFingerprintSha256: null };
  }

  if (!Array.isArray(root.members)) {
    return { state: 'INVALID', config: null, configFingerprintSha256: null };
  }

  if (root.members.length === 0) {
    return { state: 'EMPTY', config: null, configFingerprintSha256: null };
  }

  if (root.members.length > APD_SHADOW_COHORT_MAX_MEMBERS) {
    return { state: 'TOO_LARGE', config: null, configFingerprintSha256: null };
  }

  const members: ApdShadowCohortMember[] = [];
  const seen = new Set<string>();
  for (const item of root.members) {
    const member = parseMember(item);
    if (!member) {
      return { state: 'INVALID', config: null, configFingerprintSha256: null };
    }
    const key = buildApdShadowTenantMemoryKey(
      member.organizationId,
      member.vehicleId,
    );
    if (seen.has(key)) {
      return { state: 'INVALID', config: null, configFingerprintSha256: null };
    }
    seen.add(key);
    members.push(member);
  }

  const config: ApdShadowCohortConfig = {
    version: P25_APD_LTE_R1_COHORT_V1,
    members,
  };

  return {
    state: 'READY',
    config,
    configFingerprintSha256: computeApdShadowCohortFingerprintSha256(config),
  };
}

export function isApdShadowCohortMember(
  config: ApdShadowCohortConfig,
  organizationId: string,
  vehicleId: string,
): boolean {
  return config.members.some(
    (m) => m.organizationId === organizationId && m.vehicleId === vehicleId,
  );
}

export function cohortExcludedReasonForRuntime(
  runtime: ApdShadowCohortRuntime,
): ApdShadowCohortExcludedReason | null {
  switch (runtime.state) {
    case 'READY':
      return null;
    case 'MISSING':
      return 'CONFIG_MISSING';
    case 'EMPTY':
      return 'EMPTY_COHORT';
    case 'UNSUPPORTED_VERSION':
      return 'UNSUPPORTED_VERSION';
    case 'INVALID':
    case 'TOO_LARGE':
      return 'CONFIG_INVALID';
    case 'DISABLED':
      return null;
    default:
      return 'CONFIG_INVALID';
  }
}
