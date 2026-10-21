/**
 * VO5C-P4A — server-side Master Admin vehicle offboard HTTP admission (default OFF).
 * Independent of frontend VITE flags.
 */

import { evaluateMasterVehicleOffboardOwnerMfaException } from './master-vehicle-offboard-owner-mfa-exception.config';

export const MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENV =
  'SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED';

export const MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED_ENV =
  'SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED';

export const MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA_ENV =
  'SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA';

/** Runtime deploy identity (set by VPS deploy / ops). */
export const SYNQDRIVE_DEPLOYED_GIT_SHA_ENV = 'SYNQDRIVE_DEPLOYED_GIT_SHA';

const GIT_SHA_RE = /^[0-9a-f]{40}$/i;

function parseStrictBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseRouteVerified(value: string | undefined): boolean {
  if (value == null || value.trim() === '') return false;
  return value.trim().toUpperCase() === 'YES';
}

function normalizeGitSha(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!GIT_SHA_RE.test(trimmed)) return null;
  return trimmed;
}

export type MasterVehicleOffboardAdmissionBlockReason =
  | 'ADMISSION_DISABLED'
  | 'ROUTE_NOT_VERIFIED'
  | 'ATTESTED_SHA_MISSING'
  | 'DEPLOYED_SHA_MISSING'
  | 'ATTESTED_SHA_INVALID'
  | 'RELEASE_ATTESTATION_MISMATCH'
  | 'MFA_ROLLOUT_NOT_ENABLED'
  | 'OWNER_MFA_EXCEPTION_USER_MISMATCH';

export type MasterVehicleOffboardAdmissionPath =
  | 'STANDARD_MFA_ROLLOUT'
  | 'OWNER_MFA_EXCEPTION';

export type MasterVehicleOffboardAdmissionEvaluation = {
  admitted: boolean;
  blockReason: MasterVehicleOffboardAdmissionBlockReason | null;
  admissionPath: MasterVehicleOffboardAdmissionPath | null;
  httpAdmissionEnabled: boolean;
  routeVerified: boolean;
  attestedReleaseSha: string | null;
  deployedReleaseSha: string | null;
  mfaMasterAdminEnabled: boolean;
  ownerMfaExceptionActive: boolean;
};

export function evaluateMasterVehicleOffboardHttpAdmission(input?: {
  httpAdmissionEnabled?: boolean;
  routeVerified?: boolean;
  attestedReleaseSha?: string | null;
  deployedReleaseSha?: string | null;
  mfaMasterAdminEnabled?: boolean;
  actorUserId?: string | null;
  nowMs?: number;
}): MasterVehicleOffboardAdmissionEvaluation {
  const httpAdmissionEnabled =
    input?.httpAdmissionEnabled ??
    parseStrictBool(process.env[MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENV], false);
  const routeVerified =
    input?.routeVerified ??
    parseRouteVerified(process.env[MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED_ENV]);
  const attestedReleaseSha =
    input?.attestedReleaseSha !== undefined
      ? input.attestedReleaseSha
      : normalizeGitSha(process.env[MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA_ENV]);
  const deployedReleaseSha =
    input?.deployedReleaseSha !== undefined
      ? input.deployedReleaseSha
      : normalizeGitSha(process.env[SYNQDRIVE_DEPLOYED_GIT_SHA_ENV]);
  const mfaMasterAdminEnabled = input?.mfaMasterAdminEnabled ?? false;
  const actorUserId = input?.actorUserId ?? null;
  const nowMs = input?.nowMs;

  const baseFields = {
    httpAdmissionEnabled,
    routeVerified,
    attestedReleaseSha,
    deployedReleaseSha,
    mfaMasterAdminEnabled,
    ownerMfaExceptionActive: false,
  };

  if (!httpAdmissionEnabled) {
    return {
      admitted: false,
      blockReason: 'ADMISSION_DISABLED',
      admissionPath: null,
      ...baseFields,
    };
  }
  if (!routeVerified) {
    return {
      admitted: false,
      blockReason: 'ROUTE_NOT_VERIFIED',
      admissionPath: null,
      ...baseFields,
    };
  }
  if (!attestedReleaseSha) {
    const invalidRaw = process.env[MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA_ENV]?.trim();
    return {
      admitted: false,
      blockReason: invalidRaw ? 'ATTESTED_SHA_INVALID' : 'ATTESTED_SHA_MISSING',
      admissionPath: null,
      ...baseFields,
    };
  }
  if (!deployedReleaseSha) {
    return {
      admitted: false,
      blockReason: 'DEPLOYED_SHA_MISSING',
      admissionPath: null,
      ...baseFields,
    };
  }
  if (attestedReleaseSha !== deployedReleaseSha) {
    return {
      admitted: false,
      blockReason: 'RELEASE_ATTESTATION_MISMATCH',
      admissionPath: null,
      ...baseFields,
    };
  }

  if (mfaMasterAdminEnabled) {
    return {
      admitted: true,
      blockReason: null,
      admissionPath: 'STANDARD_MFA_ROLLOUT',
      ...baseFields,
    };
  }

  const ownerException = evaluateMasterVehicleOffboardOwnerMfaException({
    actorUserId,
    nowMs,
  });

  if (ownerException.active) {
    return {
      admitted: true,
      blockReason: null,
      admissionPath: 'OWNER_MFA_EXCEPTION',
      ...baseFields,
      ownerMfaExceptionActive: true,
    };
  }

  if (ownerException.inactiveReason === 'ACTOR_USER_MISMATCH') {
    return {
      admitted: false,
      blockReason: 'OWNER_MFA_EXCEPTION_USER_MISMATCH',
      admissionPath: null,
      ...baseFields,
      ownerMfaExceptionActive: false,
    };
  }

  return {
    admitted: false,
    blockReason: 'MFA_ROLLOUT_NOT_ENABLED',
    admissionPath: null,
    ...baseFields,
  };
}
