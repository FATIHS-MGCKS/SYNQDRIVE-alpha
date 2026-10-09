import {
  evaluateGate6ProductionPathIsolation,
  GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS,
  isProductionBackendEnvSurface,
} from './di-v0-s4-gate6-live-authority.lib';
import { evaluateProductionGate6IssuanceTrustAnchors } from './di-v0-s4-gate6-production-trust-anchor.lib';
import {
  enforceExactProductionBackendEnvForLiveOpen,
  resolveCanonicalBackendEnvPathFromFilesystem,
} from './di-v0-s4-gate6-trusted-authority.lib';

/** Simulated guard / DB / topology proof env vars forbidden on Production live OPEN. */
export const GATE6_PRODUCTION_SIMULATED_GUARD_PROOF_ENV_KEYS = [
  'DI_S4F7AS_GLOBAL_ROW_LINES',
  'DI_S4F7AS_S4_PERSISTENCE_LINES',
  'DI_S4F7AS_ENV_CONTENT',
  'DI_S4F7AS_VEHICLE_DB_LINES',
  'DI_S4F7AS_TOPOLOGY_OK',
  'DI_S4F7AS_BUDGET_CONFIG_OK',
  'DI_S4F7AS_BUDGET_RUNTIME_OK',
  'DI_S4F7AS_REDIS_OK',
] as const;

export type ProductionLiveOpenBoundaryFailure =
  | 'PRODUCTION_FIXTURE_CONTROL_PRESENT'
  | 'PRODUCTION_SIMULATED_GUARD_PROOF_PRESENT'
  | 'LIVE_OPEN_NON_PRODUCTION_BACKEND_ENV'
  | 'PRODUCTION_BACKEND_ENV_TRUST_MISMATCH'
  | 'PRODUCTION_BACKEND_ENV_REALPATH_FAILED'
  | 'EXACT_PRODUCTION_BACKEND_ENV_MISMATCH'
  | 'BACKEND_ENV_CANONICAL_CLAIM_MISMATCH'
  | 'BACKEND_ENV_REALPATH_FAILED'
  | 'BACKEND_ENV_CANDIDATE_MISSING'
  | string;

/**
 * Production issuance / trust-anchor context — fixture flags do not disable this.
 */
export function isProductionGate6IssuanceContext(env: NodeJS.ProcessEnv = process.env): boolean {
  return isProductionBackendEnvSurface(env);
}

function firstFixtureControlPresent(env: NodeJS.ProcessEnv): string | undefined {
  for (const key of GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS) {
    if ((env[key] ?? '').trim().length > 0) return key;
  }
  return undefined;
}

function firstSimulatedGuardProofPresent(env: NodeJS.ProcessEnv): string | undefined {
  for (const key of GATE6_PRODUCTION_SIMULATED_GUARD_PROOF_ENV_KEYS) {
    if ((env[key] ?? '').trim().length > 0) return key;
  }
  return undefined;
}

/**
 * Hard boundary for `live-open-authorized` and Production dispatch issuance.
 */
export function evaluateProductionGate6LiveOpenBoundary(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; failures: ProductionLiveOpenBoundaryFailure[] } {
  const failures: ProductionLiveOpenBoundaryFailure[] = [];

  const fixture = firstFixtureControlPresent(env);
  if (fixture) failures.push(`PRODUCTION_FIXTURE_CONTROL_PRESENT:${fixture}`);

  const simulated = firstSimulatedGuardProofPresent(env);
  if (simulated) failures.push(`PRODUCTION_SIMULATED_GUARD_PROOF_PRESENT:${simulated}`);

  const isolation = evaluateGate6ProductionPathIsolation(env);
  if (!isolation.ok) failures.push(...isolation.failures);

  const resolved = resolveCanonicalBackendEnvPathFromFilesystem(env);
  const exact = enforceExactProductionBackendEnvForLiveOpen(env, resolved);
  if (!exact.ok) failures.push(...exact.failures);
  else if (!isProductionBackendEnvSurface(env)) {
    failures.push('LIVE_OPEN_NON_PRODUCTION_BACKEND_ENV');
  }

  const anchors = evaluateProductionGate6IssuanceTrustAnchors(env);
  if (!anchors.ok) failures.push(...anchors.failures);

  return failures.length ? { ok: false, failures } : { ok: true };
}

/** Production dispatch issuance on the Production backend surface only (engineering temp env unchanged). */
export function evaluateProductionGate6DispatchIssuanceBoundary(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; failures: ProductionLiveOpenBoundaryFailure[] } {
  if (!isProductionBackendEnvSurface(env)) {
    return { ok: true };
  }
  return evaluateProductionGate6LiveOpenBoundary(env);
}
