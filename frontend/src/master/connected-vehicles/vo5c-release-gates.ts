/**
 * VO5C-P4A production cutover gates (fail-closed).
 * UI enablement requires explicit UI flag AND backend release attestation aligned to deployed SHA.
 * Backend HTTP admission remains authoritative (SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED).
 */

const GIT_SHA_RE = /^[0-9a-f]{40}$/i;

function parseStrictOnFlag(raw: unknown): boolean {
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'on' || normalized === 'true' || normalized === '1';
}

function parseRouteVerified(raw: unknown): boolean {
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  return String(raw).trim().toUpperCase() === 'YES';
}

function normalizeGitSha(raw: unknown): string | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const trimmed = String(raw).trim().toLowerCase();
  return GIT_SHA_RE.test(trimmed) ? trimmed : null;
}

export type MasterOffboardUiGateEvaluation = {
  enabled: boolean;
  uiFlagOn: boolean;
  backendRouteVerified: boolean;
  deployedSha: string | null;
  attestedSha: string | null;
  releaseAttestationMatch: boolean;
};

/** Vite env keys for VO5C-P4A (declared here to avoid vite-env.d.ts i18n governance coupling). */
export type MasterOffboardUiGateEnv = {
  VITE_MASTER_VEHICLE_OFFBOARD_UI?: string;
  VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED?: string;
  VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA?: string;
  VITE_SYNQDRIVE_DEPLOYED_GIT_SHA?: string;
};

export function evaluateMasterOffboardUiGate(
  env: MasterOffboardUiGateEnv = import.meta.env as MasterOffboardUiGateEnv,
): MasterOffboardUiGateEvaluation {
  const uiFlagOn = parseStrictOnFlag(env.VITE_MASTER_VEHICLE_OFFBOARD_UI);
  const backendRouteVerified = parseRouteVerified(env.VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED);
  const deployedSha = normalizeGitSha(env.VITE_SYNQDRIVE_DEPLOYED_GIT_SHA);
  const attestedSha = normalizeGitSha(env.VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA);
  const releaseAttestationMatch =
    deployedSha !== null && attestedSha !== null && deployedSha === attestedSha;

  const enabled =
    uiFlagOn && backendRouteVerified && releaseAttestationMatch && deployedSha !== null;

  return {
    enabled,
    uiFlagOn,
    backendRouteVerified,
    deployedSha,
    attestedSha,
    releaseAttestationMatch,
  };
}

/** UX-only gate; backend admission guard remains authoritative. */
export function isMasterOffboardUiEnabled(): boolean {
  return evaluateMasterOffboardUiGate().enabled;
}

export const PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED_DOC =
  'Require VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED=YES and matching VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA === VITE_SYNQDRIVE_DEPLOYED_GIT_SHA before VITE_MASTER_VEHICLE_OFFBOARD_UI=on. Mirror server env: SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED=YES and attested SHA.';
