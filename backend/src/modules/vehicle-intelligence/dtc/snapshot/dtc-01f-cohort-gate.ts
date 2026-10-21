import { isDtc01aSafetyFoundationEnabled } from './dtc-01a.config';

export const DTC_01F_COHORT_GATE_ENABLED_ENV = 'DTC_01F_COHORT_GATE_ENABLED';
export const DTC_01F_COHORT_VEHICLE_ALLOWLIST_ENV = 'DTC_01F_COHORT_VEHICLE_ALLOWLIST';
/** Opt-in only: pilot allowlist uses safety01a; other ACTIVE vehicles keep legacy poll/webhook. Default OFF. */
export const DTC_01F_COHORT_MIXED_MODE_ENABLED_ENV = 'DTC_01F_COHORT_MIXED_MODE_ENABLED';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXCLUDED_LIFECYCLES = new Set(['OFFBOARDED', 'ARCHIVED']);

export type Dtc01fCohortGateConfigState =
  | { mode: 'GLOBAL_OFF' }
  | { mode: 'OPEN' }
  | { mode: 'COHORT'; allowlist: ReadonlySet<string> }
  | { mode: 'MIXED_COHORT'; allowlist: ReadonlySet<string> }
  | { mode: 'INVALID'; reason: string };

export type Dtc01fPathAdmissionReason =
  | 'GLOBAL_FLAG_OFF'
  | 'COHORT_GATE_OFF_ALL_ELIGIBLE'
  | 'COHORT_GATE_INVALID_CONFIG'
  | 'LIFECYCLE_EXCLUDED'
  | 'NOT_IN_COHORT_ALLOWLIST'
  | 'COHORT_MIXED_NON_PILOT_LEGACY'
  | 'COHORT_ADMITTED';

export type Dtc01fPathAdmission = {
  useDtc01aSafetyPath: boolean;
  reason: Dtc01fPathAdmissionReason;
};

export function isDtc01fCohortGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DTC_01F_COHORT_GATE_ENABLED_ENV]?.trim().toLowerCase() === 'true';
}

export function isDtc01fCohortMixedModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DTC_01F_COHORT_MIXED_MODE_ENABLED_ENV]?.trim().toLowerCase() === 'true';
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
  if (isDtc01fCohortMixedModeEnabled(env)) {
    return { mode: 'MIXED_COHORT', allowlist: parsed.allowlist };
  }
  return { mode: 'COHORT', allowlist: parsed.allowlist };
}

function isCohortScopedMode(
  config: Dtc01fCohortGateConfigState,
): config is { mode: 'COHORT' | 'MIXED_COHORT'; allowlist: ReadonlySet<string> } {
  return config.mode === 'COHORT' || config.mode === 'MIXED_COHORT';
}

function normalizedVehicleId(vehicleId: string): string {
  return vehicleId.trim().toLowerCase();
}

function isVehicleInCohortAllowlist(
  allowlist: ReadonlySet<string>,
  vehicleId: string,
): boolean {
  return allowlist.has(normalizedVehicleId(vehicleId));
}

/**
 * When global DTC-01A is OFF → legacy path for all vehicles (poll/webhook).
 * When cohort gate OFF → all eligible vehicles use 01A path (global rollout; activation risk).
 * When cohort gate ON (strict) → only allowlisted vehicles use 01A; no legacy fallback.
 * When mixed-mode ON (requires cohort gate + allowlist) → allowlisted use 01A; other ACTIVE use legacy path admission (not 01A).
 * Invalid cohort config while gate ON → fail-closed (no DTC mutations on poll or webhook).
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
  if (!isCohortScopedMode(config)) {
    return { useDtc01aSafetyPath: false, reason: 'COHORT_GATE_INVALID_CONFIG' };
  }
  if (!isVehicleInCohortAllowlist(config.allowlist, input.vehicleId)) {
    if (config.mode === 'MIXED_COHORT') {
      return { useDtc01aSafetyPath: false, reason: 'COHORT_MIXED_NON_PILOT_LEGACY' };
    }
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
 * OFFBOARDED/ARCHIVED never enqueued. Strict cohort ON → only allowlisted vehicles; mixed-mode routes others to legacy.
 */
export type DtcWebhookAdmissionReason =
  | 'REGISTRY_LIFECYCLE_EXCLUDED'
  | 'COHORT_GATE_INVALID_CONFIG'
  | 'NOT_IN_COHORT_ALLOWLIST'
  | 'VEHICLE_NOT_FOUND';

export type DtcWebhookAdmission =
  | { mutate: true; runtimePath: 'legacy' | 'safety01a' }
  | { mutate: false; reason: DtcWebhookAdmissionReason };

function isRegistryLifecycleExcluded(registryLifecycle: string | null | undefined): boolean {
  const lifecycle = (registryLifecycle ?? 'ACTIVE').toUpperCase();
  return lifecycle === 'OFFBOARDED' || lifecycle === 'ARCHIVED';
}

/**
 * Webhook DTC ingress admission — aligned with {@link evaluateDtcPollJobAdmission}.
 * Global OFF → legacy mutations for eligible lifecycles only.
 * Strict cohort ON → allowlisted safety01a only; non-cohort skips mutation (no legacy).
 * Mixed cohort → allowlisted safety01a; other ACTIVE vehicles use legacy mutations.
 */
export function evaluateDtcWebhookAdmission(input: {
  vehicleId: string;
  registryLifecycle: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): DtcWebhookAdmission {
  const env = input.env ?? process.env;
  if (isRegistryLifecycleExcluded(input.registryLifecycle)) {
    return { mutate: false, reason: 'REGISTRY_LIFECYCLE_EXCLUDED' };
  }

  const config = resolveDtc01fCohortGateConfig(env);
  if (config.mode === 'GLOBAL_OFF') {
    return { mutate: true, runtimePath: 'legacy' };
  }
  if (config.mode === 'INVALID') {
    return { mutate: false, reason: 'COHORT_GATE_INVALID_CONFIG' };
  }
  if (config.mode === 'OPEN') {
    return { mutate: true, runtimePath: 'safety01a' };
  }

  if (!isCohortScopedMode(config)) {
    return { mutate: false, reason: 'COHORT_GATE_INVALID_CONFIG' };
  }

  if (isVehicleInCohortAllowlist(config.allowlist, input.vehicleId)) {
    return { mutate: true, runtimePath: 'safety01a' };
  }
  if (config.mode === 'MIXED_COHORT') {
    return { mutate: true, runtimePath: 'legacy' };
  }
  return { mutate: false, reason: 'NOT_IN_COHORT_ALLOWLIST' };
}

/** True when poll enqueue and webhook mutate decisions match for the same vehicle/config. */
export function dtcPollWebhookAdmissionAligned(input: {
  vehicleId: string;
  registryLifecycle: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const poll = evaluateDtcPollJobAdmission(input);
  const webhook = evaluateDtcWebhookAdmission(input);
  if (poll.enqueue !== webhook.mutate) {
    return false;
  }
  if (!poll.enqueue || !webhook.mutate) {
    return true;
  }
  return poll.runtimePath === webhook.runtimePath;
}

export function evaluateDtcPollJobAdmission(input: {
  vehicleId: string;
  registryLifecycle: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): DtcPollJobAdmission {
  const env = input.env ?? process.env;
  if (isRegistryLifecycleExcluded(input.registryLifecycle)) {
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

  if (!isCohortScopedMode(config)) {
    return { enqueue: false, reason: 'COHORT_GATE_INVALID_CONFIG' };
  }

  if (isVehicleInCohortAllowlist(config.allowlist, input.vehicleId)) {
    return { enqueue: true, runtimePath: 'safety01a' };
  }
  if (config.mode === 'MIXED_COHORT') {
    return { enqueue: true, runtimePath: 'legacy' };
  }
  return { enqueue: false, reason: 'NOT_IN_COHORT_ALLOWLIST' };
}

export function logDtc01fCohortConfigOnBoot(logger: {
  error: (msg: string) => void;
  log?: (msg: string) => void;
}): void {
  const config = resolveDtc01fCohortGateConfig();
  if (config.mode === 'INVALID') {
    logger.error(
      `DTC-01F cohort gate INVALID (${config.reason}): DTC poll fan-out and webhook DTC ingress fail-closed until config fixed (set identical env on all API replicas)`,
    );
    return;
  }
  if (config.mode === 'MIXED_COHORT' && logger.log) {
    logger.log(
      `DTC-01F mixed-mode routing ACTIVE: allowlisted vehicles use safety01a; other ACTIVE vehicles use legacy (replica env must match)`,
    );
  }
}
