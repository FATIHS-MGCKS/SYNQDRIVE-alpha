import { createHash } from 'node:crypto';
import { isBatteryHvH4A3ReconciliationEnabled } from './m3-3-hv-h4-a3-reconciliation.config';

export const BATTERY_HV_H4_A3_RECONCILIATION_COHORT_JSON_ENV =
  'BATTERY_HV_H4_A3_RECONCILIATION_COHORT_JSON';

export const M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1 =
  'M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1' as const;

export const HV_H4_A3_RECONCILIATION_COHORT_MAX_MEMBERS = 32;

export type M3_3HvH4A3ReconciliationCohortConfigState =
  | 'DISABLED'
  | 'READY'
  | 'MISSING'
  | 'INVALID'
  | 'EMPTY'
  | 'UNSUPPORTED_VERSION'
  | 'TOO_LARGE';

export type M3_3HvH4A3ReconciliationCohortMemberV1 = {
  organizationId: string;
  vehicleId: string;
};

export type M3_3HvH4A3ReconciliationCohortConfigV1 = {
  version: typeof M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1;
  members: M3_3HvH4A3ReconciliationCohortMemberV1[];
};

export type M3_3HvH4A3ReconciliationCohortRuntimeV1 = {
  state: M3_3HvH4A3ReconciliationCohortConfigState;
  config: M3_3HvH4A3ReconciliationCohortConfigV1 | null;
  configFingerprintSha256: string | null;
};

function isUuidV4ish(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function parseMember(raw: unknown): M3_3HvH4A3ReconciliationCohortMemberV1 | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isUuidV4ish(String(o.organizationId ?? '')) || !isUuidV4ish(String(o.vehicleId ?? ''))) {
    return null;
  }
  return {
    organizationId: String(o.organizationId).trim().toLowerCase(),
    vehicleId: String(o.vehicleId).trim().toLowerCase(),
  };
}

export function buildHvH4A3ReconciliationCohortMemberKeyV1(
  organizationId: string,
  vehicleId: string,
): string {
  return `${organizationId}\u0000${vehicleId}`;
}

export function computeHvH4A3ReconciliationCohortFingerprintSha256V1(
  config: M3_3HvH4A3ReconciliationCohortConfigV1,
): string {
  const sorted = [...config.members].sort((a, b) => {
    const o = a.organizationId.localeCompare(b.organizationId);
    if (o !== 0) return o;
    return a.vehicleId.localeCompare(b.vehicleId);
  });
  const canonical = JSON.stringify({
    version: config.version,
    members: sorted,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Fail-closed cohort resolution when reconciliation is enabled.
 * When the master flag is OFF, state is DISABLED (no cohort requirement).
 */
export function evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1(
  env: NodeJS.ProcessEnv = process.env,
): M3_3HvH4A3ReconciliationCohortRuntimeV1 {
  if (!isBatteryHvH4A3ReconciliationEnabled(env)) {
    return { state: 'DISABLED', config: null, configFingerprintSha256: null };
  }

  const rawJson = env[BATTERY_HV_H4_A3_RECONCILIATION_COHORT_JSON_ENV];
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
  if (root.version !== M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1) {
    return { state: 'UNSUPPORTED_VERSION', config: null, configFingerprintSha256: null };
  }

  if (!Array.isArray(root.members)) {
    return { state: 'INVALID', config: null, configFingerprintSha256: null };
  }

  if (root.members.length === 0) {
    return { state: 'EMPTY', config: null, configFingerprintSha256: null };
  }

  if (root.members.length > HV_H4_A3_RECONCILIATION_COHORT_MAX_MEMBERS) {
    return { state: 'TOO_LARGE', config: null, configFingerprintSha256: null };
  }

  const members: M3_3HvH4A3ReconciliationCohortMemberV1[] = [];
  const seen = new Set<string>();
  for (const item of root.members) {
    const member = parseMember(item);
    if (!member) {
      return { state: 'INVALID', config: null, configFingerprintSha256: null };
    }
    const key = buildHvH4A3ReconciliationCohortMemberKeyV1(
      member.organizationId,
      member.vehicleId,
    );
    if (seen.has(key)) {
      return { state: 'INVALID', config: null, configFingerprintSha256: null };
    }
    seen.add(key);
    members.push(member);
  }

  const config: M3_3HvH4A3ReconciliationCohortConfigV1 = {
    version: M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1,
    members,
  };

  return {
    state: 'READY',
    config,
    configFingerprintSha256: computeHvH4A3ReconciliationCohortFingerprintSha256V1(config),
  };
}

export function isHvH4A3ReconciliationCohortMemberV1(
  config: M3_3HvH4A3ReconciliationCohortConfigV1,
  organizationId: string,
  vehicleId: string,
): boolean {
  const org = organizationId.trim().toLowerCase();
  const veh = vehicleId.trim().toLowerCase();
  return config.members.some((m) => m.organizationId === org && m.vehicleId === veh);
}

export function buildHvH4A3ReconciliationCohortPrismaOrV1(
  config: M3_3HvH4A3ReconciliationCohortConfigV1,
): Array<{ organizationId: string; vehicleId: string }> {
  return config.members.map((m) => ({
    organizationId: m.organizationId,
    vehicleId: m.vehicleId,
  }));
}
