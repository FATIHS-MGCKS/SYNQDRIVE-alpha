/**
 * DI V0 S4 control plane (S4A_CONTROL_PLANE.md). Pure: callers pass an env snapshot; this module
 * never reads process.env and registers no Nest config (config wiring is S4E scope).
 */

export const DI_V0_S4_ENV_FLAGS = {
  master: 'DI_V0_S4_MASTER_ENABLED',
  discovery: 'DI_V0_S4_DISCOVERY_ENABLED',
  worker: 'DI_V0_S4_WORKER_ENABLED',
  position: 'DI_V0_S4_POSITION_ENABLED',
  r1: 'DI_V0_S4_R1_ENABLED',
  native: 'DI_V0_S4_NATIVE_ENABLED',
} as const;

export const DI_V0_S4_ENV_ALLOWLISTS = {
  organization: 'DI_V0_S4_ORGANIZATION_ALLOWLIST',
  vehicle: 'DI_V0_S4_VEHICLE_ALLOWLIST',
} as const;

const ALLOWLIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface DiV0S4ControlPlaneConfig {
  masterEnabled: boolean;
  discoveryEnabled: boolean;
  workerEnabled: boolean;
  positionEnabled: boolean;
  r1Enabled: boolean;
  nativeEnabled: boolean;
  organizationAllowlist: ReadonlySet<string>;
  vehicleAllowlist: ReadonlySet<string>;
}

/** Same convention as `parseBooleanEnv(value, false)` in config/driving-intelligence-v2.config.ts. */
export function parseDiV0S4BooleanFlag(value: string | undefined): boolean {
  if (value == null || value.trim() === '') return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

/** Empty means NONE; any malformed entry or a wildcard makes the whole list NONE; duplicates dedup. */
export function parseDiV0S4Allowlist(value: string | undefined): ReadonlySet<string> {
  if (value == null || value.trim() === '') return new Set();
  const entries = value.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    if (!ALLOWLIST_ID_PATTERN.test(entry)) return new Set();
  }
  return new Set(entries);
}

export function parseDiV0S4ControlPlaneConfig(env: Readonly<Record<string, string | undefined>>): DiV0S4ControlPlaneConfig {
  return {
    masterEnabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_ENV_FLAGS.master]),
    discoveryEnabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_ENV_FLAGS.discovery]),
    workerEnabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_ENV_FLAGS.worker]),
    positionEnabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_ENV_FLAGS.position]),
    r1Enabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_ENV_FLAGS.r1]),
    nativeEnabled: parseDiV0S4BooleanFlag(env[DI_V0_S4_ENV_FLAGS.native]),
    organizationAllowlist: parseDiV0S4Allowlist(env[DI_V0_S4_ENV_ALLOWLISTS.organization]),
    vehicleAllowlist: parseDiV0S4Allowlist(env[DI_V0_S4_ENV_ALLOWLISTS.vehicle]),
  };
}

export const DI_V0_S4_CONTROL_PLANE_ALL_OFF: DiV0S4ControlPlaneConfig = parseDiV0S4ControlPlaneConfig({});

export type DiV0S4KillState = 'KILLED' | 'NOT_KILLED';
export type DiV0S4KillReason =
  | 'DB_KILL_ACTIVE'
  | 'DB_KILL_ROW_MISSING'
  | 'DB_KILL_ROW_UNREADABLE'
  | 'DB_KILL_ROW_MALFORMED';

export interface DiV0S4KillEvaluation {
  state: DiV0S4KillState;
  reason: DiV0S4KillReason | null;
}

export type DiV0S4KillRowObservation =
  | { kind: 'MISSING' }
  | { kind: 'READ_ERROR' }
  | { kind: 'ROW'; killState: unknown };

/** Fail closed: only an exact NOT_KILLED row value is NOT_KILLED. */
export function evaluateDiV0S4KillRow(observation: DiV0S4KillRowObservation): DiV0S4KillEvaluation {
  if (observation.kind === 'MISSING') return { state: 'KILLED', reason: 'DB_KILL_ROW_MISSING' };
  if (observation.kind === 'READ_ERROR') return { state: 'KILLED', reason: 'DB_KILL_ROW_UNREADABLE' };
  if (observation.killState === 'NOT_KILLED') return { state: 'NOT_KILLED', reason: null };
  if (observation.killState === 'KILLED') return { state: 'KILLED', reason: 'DB_KILL_ACTIVE' };
  return { state: 'KILLED', reason: 'DB_KILL_ROW_MALFORMED' };
}

export type DiV0S4ControlRole = 'DISCOVERY' | 'WORKER';

export type DiV0S4EnablementTerm =
  | 'MASTER'
  | 'ROLE_FLAG'
  | 'POSITION'
  | 'ORG_ALLOWLISTED'
  | 'VEHICLE_ALLOWLISTED'
  | 'VEHICLE_BELONGS_TO_ORG'
  | 'DB_NOT_KILLED';

export interface DiV0S4EnablementScope {
  organizationId: string;
  vehicleId: string;
  /** `vehicles.organization_id` read inside the transition transaction. */
  vehicleOrganizationId: string | null;
}

export interface DiV0S4EnablementResult {
  enabled: boolean;
  failedTerms: DiV0S4EnablementTerm[];
}

/**
 * effectiveEnabled = MASTER ∧ ROLE_FLAG ∧ POSITION ∧ orgAllowlisted ∧ vehicleAllowlisted
 *                    ∧ vehicle.organization_id == work_item.organization_id ∧ NOT_KILLED
 */
export function evaluateDiV0S4Enablement(
  config: DiV0S4ControlPlaneConfig,
  role: DiV0S4ControlRole,
  scope: DiV0S4EnablementScope,
  kill: DiV0S4KillEvaluation,
): DiV0S4EnablementResult {
  const terms: Record<DiV0S4EnablementTerm, boolean> = {
    MASTER: config.masterEnabled,
    ROLE_FLAG: role === 'DISCOVERY' ? config.discoveryEnabled : config.workerEnabled,
    POSITION: config.positionEnabled,
    ORG_ALLOWLISTED: config.organizationAllowlist.has(scope.organizationId),
    VEHICLE_ALLOWLISTED: config.vehicleAllowlist.has(scope.vehicleId),
    VEHICLE_BELONGS_TO_ORG: scope.vehicleOrganizationId != null && scope.vehicleOrganizationId === scope.organizationId,
    DB_NOT_KILLED: kill.state === 'NOT_KILLED',
  };
  const failedTerms = (Object.keys(terms) as DiV0S4EnablementTerm[]).filter((term) => !terms[term]);
  return { enabled: failedTerms.length === 0, failedTerms };
}

/** Maintenance actors (T10 reaper, T11 drift watcher, T12 retirement reaper) and holder T03/T08/T09. */
export function evaluateDiV0S4MaintenanceEnablement(
  config: DiV0S4ControlPlaneConfig,
  kill: DiV0S4KillEvaluation,
): DiV0S4EnablementResult {
  const failedTerms: DiV0S4EnablementTerm[] = [];
  if (!config.masterEnabled) failedTerms.push('MASTER');
  if (kill.state !== 'NOT_KILLED') failedTerms.push('DB_NOT_KILLED');
  return { enabled: failedTerms.length === 0, failedTerms };
}
