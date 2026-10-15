import { isDtc01aSafetyFoundationEnabled } from './dtc-01a.config';

export const DTC_01F_COHORT_GATE_ENABLED_ENV = 'DTC_01F_COHORT_GATE_ENABLED';
export const DTC_01F_COHORT_VEHICLE_ALLOWLIST_ENV = 'DTC_01F_COHORT_VEHICLE_ALLOWLIST';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXCLUDED_LIFECYCLES = new Set(['OFFBOARDED', 'ARCHIVED']);

export type Dtc01fCohortGateConfigState =
  | { mode: 'GLOBAL_OFF' }
  | { mode: 'OPEN' }
  | { mode: 'COHORT'; allowlist: ReadonlySet<string> }
  | { mode: 'INVALID'; reason: string };

export type Dtc01fPathAdmissionReason =
  | 'GLOBAL_FLAG_OFF'
  | 'COHORT_GATE_OFF_ALL_ELIGIBLE'
  | 'COHORT_GATE_INVALID_CONFIG'
  | 'LIFECYCLE_EXCLUDED'
  | 'NOT_IN_COHORT_ALLOWLIST'
  | 'COHORT_ADMITTED';

export type Dtc01fPathAdmission = {
  useDtc01aSafetyPath: boolean;
  reason: Dtc01fPathAdmissionReason;
};

export function isDtc01fCohortGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DTC_01F_COHORT_GATE_ENABLED_ENV]?.trim().toLowerCase() === 'true';
}

export function parseDtc01fCohortVehicleAllowlist(
  raw: string | undefined,
): { ok: true; allowlist: ReadonlySet<string> } | { ok: false; reason: string } {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { ok: false, reason: 'ALLOWLIST_EMPTY' };
  }
  const ids = trimmed
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, reason: 'ALLOWLIST_EMPTY' };
  }
  const allowlist = new Set<string>();
  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      return { ok: false, reason: `ALLOWLIST_INVALID_VEHICLE_ID:${id}` };
    }
    allowlist.add(id.toLowerCase());
  }
  return { ok: true, allowlist };
}

export function resolveDtc01fCohortGateConfig(
  env: NodeJS.ProcessEnv = process.env,
): Dtc01fCohortGateConfigState {
  if (!isDtc01aSafetyFoundationEnabled(env)) {
    return { mode: 'GLOBAL_OFF' };
  }
  if (!isDtc01fCohortGateEnabled(env)) {
    return { mode: 'OPEN' };
  }
  const parsed = parseDtc01fCohortVehicleAllowlist(env[DTC_01F_COHORT_VEHICLE_ALLOWLIST_ENV]);
  if (!parsed.ok) {
    return { mode: 'INVALID', reason: parsed.reason };
  }
  return { mode: 'COHORT', allowlist: parsed.allowlist };
}

/**
 * When global DTC-01A is OFF → legacy path for all vehicles.
 * When cohort gate OFF → all eligible vehicles may use 01A path (global flag still required).
 * When cohort gate ON → only allowlisted, non-offboarded vehicles use 01A; others stay on legacy.
 * Invalid cohort config while gate ON → fail-closed (no vehicle uses 01A path).
 */
export function evaluateDtc01fSafetyPathAdmission(input: {
  vehicleId: string;
  registryLifecycle: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): Dtc01fPathAdmission {
  const env = input.env ?? process.env;
  const config = resolveDtc01fCohortGateConfig(env);

  if (config.mode === 'GLOBAL_OFF') {
    return { useDtc01aSafetyPath: false, reason: 'GLOBAL_FLAG_OFF' };
  }
  if (config.mode === 'INVALID') {
    return { useDtc01aSafetyPath: false, reason: 'COHORT_GATE_INVALID_CONFIG' };
  }
  if (config.mode === 'OPEN') {
    if (input.registryLifecycle && EXCLUDED_LIFECYCLES.has(input.registryLifecycle)) {
      return { useDtc01aSafetyPath: false, reason: 'LIFECYCLE_EXCLUDED' };
    }
    return { useDtc01aSafetyPath: true, reason: 'COHORT_GATE_OFF_ALL_ELIGIBLE' };
  }

  if (input.registryLifecycle && EXCLUDED_LIFECYCLES.has(input.registryLifecycle)) {
    return { useDtc01aSafetyPath: false, reason: 'LIFECYCLE_EXCLUDED' };
  }
  const vid = input.vehicleId.trim().toLowerCase();
  if (!config.allowlist.has(vid)) {
    return { useDtc01aSafetyPath: false, reason: 'NOT_IN_COHORT_ALLOWLIST' };
  }
  return { useDtc01aSafetyPath: true, reason: 'COHORT_ADMITTED' };
}

export function shouldUseDtc01aSafetyPathForVehicle(
  vehicleId: string,
  registryLifecycle: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return evaluateDtc01fSafetyPathAdmission({ vehicleId, registryLifecycle, env })
    .useDtc01aSafetyPath;
}

export type DtcPollJobAdmissionReason =
  | 'GLOBAL_FLAG_OFF_LEGACY'
  | 'SAFETY_01A_PATH'
  | 'REGISTRY_LIFECYCLE_EXCLUDED'
  | 'COHORT_GATE_INVALID_CONFIG'
  | 'NOT_IN_COHORT_ALLOWLIST'
  | 'COHORT_PILOT_NO_LEGACY_FALLBACK';

export type DtcPollJobAdmission =
  | { enqueue: true; runtimePath: 'legacy' | 'safety01a' }
  | { enqueue: false; reason: DtcPollJobAdmissionReason };

/**
 * Fan-out / worker admission for DIMO DTC poll jobs (pilot-safe).
 * OFFBOARDED/ARCHIVED never enqueued. Cohort ON → only allowlisted vehicles; no legacy fallback.
 */
export function evaluateDtcPollJobAdmission(input: {
  vehicleId: string;
  registryLifecycle: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): DtcPollJobAdmission {
  const env = input.env ?? process.env;
  const lifecycle = (input.registryLifecycle ?? 'ACTIVE').toUpperCase();
  if (lifecycle === 'OFFBOARDED' || lifecycle === 'ARCHIVED') {
    return { enqueue: false, reason: 'REGISTRY_LIFECYCLE_EXCLUDED' };
  }

  const config = resolveDtc01fCohortGateConfig(env);
  if (config.mode === 'GLOBAL_OFF') {
    return { enqueue: true, runtimePath: 'legacy' };
  }
  if (config.mode === 'INVALID') {
    return { enqueue: false, reason: 'COHORT_GATE_INVALID_CONFIG' };
  }
  if (config.mode === 'OPEN') {
    return { enqueue: true, runtimePath: 'safety01a' };
  }

  const admission = evaluateDtc01fSafetyPathAdmission(input);
  if (!admission.useDtc01aSafetyPath) {
    return { enqueue: false, reason: 'NOT_IN_COHORT_ALLOWLIST' };
  }
  return { enqueue: true, runtimePath: 'safety01a' };
}

export function logDtc01fCohortConfigOnBoot(logger: { error: (msg: string) => void }): void {
  const config = resolveDtc01fCohortGateConfig();
  if (config.mode === 'INVALID') {
    logger.error(
      `DTC-01F cohort gate INVALID (${config.reason}): DTC poll fan-out fail-closed until config fixed`,
    );
  }
}
