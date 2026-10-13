/**
 * VO5C — temporary owner-only MFA exception for canonical offboard HTTP (default OFF).
 * Remove after IAM Master Admin MFA rollout is complete.
 */

export const MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED_ENV =
  'SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED';

export const MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID_ENV =
  'SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID';

export const MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT_ENV =
  'SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT';

export const MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT_ENV =
  'SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT';

/** Hard cap: exception window may not exceed 24 hours from activation timestamp. */
export const MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_MAX_TTL_MS = 24 * 60 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseStrictBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function normalizeOwnerUserId(value: string | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const trimmed = value.trim().toLowerCase();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed;
}

function parseIsoTimestampMs(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export type MasterVehicleOffboardOwnerMfaExceptionInactiveReason =
  | 'DISABLED'
  | 'OWNER_USER_ID_MISSING'
  | 'OWNER_USER_ID_INVALID'
  | 'ACTIVATED_AT_MISSING'
  | 'ACTIVATED_AT_INVALID'
  | 'ACTIVATED_AT_IN_FUTURE'
  | 'EXPIRES_AT_MISSING'
  | 'EXPIRES_AT_INVALID'
  | 'EXPIRES_BEFORE_ACTIVATION'
  | 'EXPIRES_AT_BEYOND_MAX_TTL'
  | 'EXPIRED'
  | 'ACTOR_USER_ID_MISSING'
  | 'ACTOR_USER_MISMATCH';

export type MasterVehicleOffboardOwnerMfaExceptionEvaluation = {
  active: boolean;
  inactiveReason: MasterVehicleOffboardOwnerMfaExceptionInactiveReason | null;
  exceptionEnabled: boolean;
  configuredOwnerUserId: string | null;
  activatedAtMs: number | null;
  expiresAtMs: number | null;
  actorUserId: string | null;
};

export function evaluateMasterVehicleOffboardOwnerMfaException(input?: {
  exceptionEnabled?: boolean;
  configuredOwnerUserId?: string | null;
  activatedAtMs?: number | null;
  expiresAtMs?: number | null;
  actorUserId?: string | null;
  nowMs?: number;
}): MasterVehicleOffboardOwnerMfaExceptionEvaluation {
  const exceptionEnabled =
    input?.exceptionEnabled ??
    parseStrictBool(process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED_ENV], false);
  const configuredOwnerUserId =
    input?.configuredOwnerUserId !== undefined
      ? input.configuredOwnerUserId
      : normalizeOwnerUserId(process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID_ENV]);
  const activatedAtMs =
    input?.activatedAtMs !== undefined
      ? input.activatedAtMs
      : parseIsoTimestampMs(process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT_ENV]);
  const expiresAtMs =
    input?.expiresAtMs !== undefined
      ? input.expiresAtMs
      : parseIsoTimestampMs(process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT_ENV]);
  const actorUserId =
    input?.actorUserId !== undefined
      ? input.actorUserId
      : null;
  const nowMs = input?.nowMs ?? Date.now();

  const base = {
    exceptionEnabled,
    configuredOwnerUserId,
    activatedAtMs,
    expiresAtMs,
    actorUserId,
  };

  if (!exceptionEnabled) {
    return {
      active: false,
      inactiveReason: 'DISABLED',
      ...base,
    };
  }
  if (!configuredOwnerUserId) {
    const raw = process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID_ENV]?.trim();
    return {
      active: false,
      inactiveReason: raw ? 'OWNER_USER_ID_INVALID' : 'OWNER_USER_ID_MISSING',
      ...base,
    };
  }
  if (activatedAtMs == null) {
    const raw = process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT_ENV]?.trim();
    return {
      active: false,
      inactiveReason: raw ? 'ACTIVATED_AT_INVALID' : 'ACTIVATED_AT_MISSING',
      ...base,
    };
  }
  if (activatedAtMs > nowMs) {
    return {
      active: false,
      inactiveReason: 'ACTIVATED_AT_IN_FUTURE',
      ...base,
    };
  }
  if (expiresAtMs == null) {
    const raw = process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT_ENV]?.trim();
    return {
      active: false,
      inactiveReason: raw ? 'EXPIRES_AT_INVALID' : 'EXPIRES_AT_MISSING',
      ...base,
    };
  }
  if (expiresAtMs < activatedAtMs) {
    return {
      active: false,
      inactiveReason: 'EXPIRES_BEFORE_ACTIVATION',
      ...base,
    };
  }
  if (expiresAtMs - activatedAtMs > MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_MAX_TTL_MS) {
    return {
      active: false,
      inactiveReason: 'EXPIRES_AT_BEYOND_MAX_TTL',
      ...base,
    };
  }
  if (expiresAtMs <= nowMs) {
    return {
      active: false,
      inactiveReason: 'EXPIRED',
      ...base,
    };
  }
  if (!actorUserId) {
    return {
      active: false,
      inactiveReason: 'ACTOR_USER_ID_MISSING',
      ...base,
    };
  }
  if (actorUserId.toLowerCase() !== configuredOwnerUserId) {
    return {
      active: false,
      inactiveReason: 'ACTOR_USER_MISMATCH',
      ...base,
    };
  }

  return {
    active: true,
    inactiveReason: null,
    ...base,
    actorUserId: actorUserId.toLowerCase(),
  };
}
