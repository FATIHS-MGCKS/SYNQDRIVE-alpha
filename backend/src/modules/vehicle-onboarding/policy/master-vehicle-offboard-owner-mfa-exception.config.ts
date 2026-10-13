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

function parseExpiresAtMs(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export type MasterVehicleOffboardOwnerMfaExceptionInactiveReason =
  | 'DISABLED'
  | 'OWNER_USER_ID_MISSING'
  | 'OWNER_USER_ID_INVALID'
  | 'EXPIRES_AT_MISSING'
  | 'EXPIRES_AT_INVALID'
  | 'EXPIRED'
  | 'ACTOR_USER_ID_MISSING'
  | 'ACTOR_USER_MISMATCH';

export type MasterVehicleOffboardOwnerMfaExceptionEvaluation = {
  active: boolean;
  inactiveReason: MasterVehicleOffboardOwnerMfaExceptionInactiveReason | null;
  exceptionEnabled: boolean;
  configuredOwnerUserId: string | null;
  expiresAtMs: number | null;
  actorUserId: string | null;
};

export function evaluateMasterVehicleOffboardOwnerMfaException(input?: {
  exceptionEnabled?: boolean;
  configuredOwnerUserId?: string | null;
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
  const expiresAtMs =
    input?.expiresAtMs !== undefined
      ? input.expiresAtMs
      : parseExpiresAtMs(process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT_ENV]);
  const actorUserId =
    input?.actorUserId !== undefined
      ? input.actorUserId
      : null;
  const nowMs = input?.nowMs ?? Date.now();

  if (!exceptionEnabled) {
    return {
      active: false,
      inactiveReason: 'DISABLED',
      exceptionEnabled,
      configuredOwnerUserId,
      expiresAtMs,
      actorUserId,
    };
  }
  if (!configuredOwnerUserId) {
    const raw = process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID_ENV]?.trim();
    return {
      active: false,
      inactiveReason: raw ? 'OWNER_USER_ID_INVALID' : 'OWNER_USER_ID_MISSING',
      exceptionEnabled,
      configuredOwnerUserId,
      expiresAtMs,
      actorUserId,
    };
  }
  if (expiresAtMs == null) {
    const raw = process.env[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT_ENV]?.trim();
    return {
      active: false,
      inactiveReason: raw ? 'EXPIRES_AT_INVALID' : 'EXPIRES_AT_MISSING',
      exceptionEnabled,
      configuredOwnerUserId,
      expiresAtMs,
      actorUserId,
    };
  }
  if (expiresAtMs <= nowMs) {
    return {
      active: false,
      inactiveReason: 'EXPIRED',
      exceptionEnabled,
      configuredOwnerUserId,
      expiresAtMs,
      actorUserId,
    };
  }
  if (!actorUserId) {
    return {
      active: false,
      inactiveReason: 'ACTOR_USER_ID_MISSING',
      exceptionEnabled,
      configuredOwnerUserId,
      expiresAtMs,
      actorUserId,
    };
  }
  if (actorUserId.toLowerCase() !== configuredOwnerUserId) {
    return {
      active: false,
      inactiveReason: 'ACTOR_USER_MISMATCH',
      exceptionEnabled,
      configuredOwnerUserId,
      expiresAtMs,
      actorUserId,
    };
  }

  return {
    active: true,
    inactiveReason: null,
    exceptionEnabled,
    configuredOwnerUserId,
    expiresAtMs,
    actorUserId: actorUserId.toLowerCase(),
  };
}
