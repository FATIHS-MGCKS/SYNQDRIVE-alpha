/**
 * VO5C-P4A — server-side Master Admin vehicle offboard HTTP admission (default OFF).
 * Independent of frontend VITE flags.
 */

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
  | 'MFA_ROLLOUT_NOT_ENABLED';

export type MasterVehicleOffboardAdmissionEvaluation = {
  admitted: boolean;
  blockReason: MasterVehicleOffboardAdmissionBlockReason | null;
  httpAdmissionEnabled: boolean;
  routeVerified: boolean;
  attestedReleaseSha: string | null;
  deployedReleaseSha: string | null;
  mfaMasterAdminEnabled: boolean;
};

export function evaluateMasterVehicleOffboardHttpAdmission(input?: {
  httpAdmissionEnabled?: boolean;
  routeVerified?: boolean;
  attestedReleaseSha?: string | null;
  deployedReleaseSha?: string | null;
  mfaMasterAdminEnabled?: boolean;
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

  if (!httpAdmissionEnabled) {
    return {
      admitted: false,
      blockReason: 'ADMISSION_DISABLED',
      httpAdmissionEnabled,
      routeVerified,
      attestedReleaseSha,
      deployedReleaseSha,
      mfaMasterAdminEnabled,
    };
  }
  if (!routeVerified) {
    return {
      admitted: false,
      blockReason: 'ROUTE_NOT_VERIFIED',
      httpAdmissionEnabled,
      routeVerified,
      attestedReleaseSha,
      deployedReleaseSha,
      mfaMasterAdminEnabled,
    };
  }
  if (!attestedReleaseSha) {
    const invalidRaw = process.env[MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA_ENV]?.trim();
    return {
      admitted: false,
      blockReason: invalidRaw ? 'ATTESTED_SHA_INVALID' : 'ATTESTED_SHA_MISSING',
      httpAdmissionEnabled,
      routeVerified,
      attestedReleaseSha,
      deployedReleaseSha,
      mfaMasterAdminEnabled,
    };
  }
  if (!deployedReleaseSha) {
    return {
      admitted: false,
      blockReason: 'DEPLOYED_SHA_MISSING',
      httpAdmissionEnabled,
      routeVerified,
      attestedReleaseSha,
      deployedReleaseSha,
      mfaMasterAdminEnabled,
    };
  }
  if (attestedReleaseSha !== deployedReleaseSha) {
    return {
      admitted: false,
      blockReason: 'RELEASE_ATTESTATION_MISMATCH',
      httpAdmissionEnabled,
      routeVerified,
      attestedReleaseSha,
      deployedReleaseSha,
      mfaMasterAdminEnabled,
    };
  }
  if (!mfaMasterAdminEnabled) {
    return {
      admitted: false,
      blockReason: 'MFA_ROLLOUT_NOT_ENABLED',
      httpAdmissionEnabled,
      routeVerified,
      attestedReleaseSha,
      deployedReleaseSha,
      mfaMasterAdminEnabled,
    };
  }

  return {
    admitted: true,
    blockReason: null,
    httpAdmissionEnabled,
    routeVerified,
    attestedReleaseSha,
    deployedReleaseSha,
    mfaMasterAdminEnabled,
  };
}
