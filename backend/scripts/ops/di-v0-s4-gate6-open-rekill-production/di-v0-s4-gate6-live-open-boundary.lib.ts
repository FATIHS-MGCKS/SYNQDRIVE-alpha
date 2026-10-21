import {
  evaluateGate6ProductionPathIsolation,
  GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS,
  isProductionBackendEnvSurface,
} from './di-v0-s4-gate6-live-authority.lib';
import {
  evaluateProductionGuardProofChannel,
  GATE6_PRODUCTION_GUARD_PROOF_BUNDLE_KEYS,
} from './di-v0-s4-gate6-guard-proof-bundle.lib';
import {
  enforceExactProductionBackendEnvForLiveOpen,
  resolveCanonicalBackendEnvPathFromFilesystem,
} from './di-v0-s4-gate6-trusted-authority.lib';

export const GATE6_PRODUCTION_SIMULATED_GUARD_PROOF_ENV_KEYS = GATE6_PRODUCTION_GUARD_PROOF_BUNDLE_KEYS;

export type ProductionLiveOpenBoundaryFailure =
  | 'PRODUCTION_FIXTURE_CONTROL_PRESENT'
  | 'PRODUCTION_SIMULATED_GUARD_PROOF_PRESENT'
  | 'GUARD_PROOF_INJECTED_IN_PROCESS_ENV'
  | 'GUARD_PROOF_BUNDLE_PATH_MISSING'
  | 'GUARD_PROOF_BUNDLE_UNREADABLE'
  | 'GUARD_PROOF_BUNDLE_INVALID'
  | 'GUARD_PROOF_BUNDLE_COLLECTOR_INVALID'
  | 'LIVE_OPEN_NON_PRODUCTION_BACKEND_ENV'
  | 'PRODUCTION_BACKEND_ENV_TRUST_MISMATCH'
  | 'PRODUCTION_BACKEND_ENV_REALPATH_FAILED'
  | 'EXACT_PRODUCTION_BACKEND_ENV_MISMATCH'
  | 'BACKEND_ENV_CANONICAL_CLAIM_MISMATCH'
  | 'BACKEND_ENV_REALPATH_FAILED'
  | 'BACKEND_ENV_CANDIDATE_MISSING'
  | string;

function firstFixtureControlPresent(env: NodeJS.ProcessEnv): string | undefined {
  for (const key of GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS) {
    if ((env[key] ?? '').trim().length > 0) return key;
  }
  return undefined;
}

/**
 * Hard boundary for Production LIVE_OPEN / DRY_RUN mutating paths.
 */
export function evaluateProductionGate6LiveOpenBoundary(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; failures: ProductionLiveOpenBoundaryFailure[] } {
  const failures: ProductionLiveOpenBoundaryFailure[] = [];

  const fixture = firstFixtureControlPresent(env);
  if (fixture) failures.push(`PRODUCTION_FIXTURE_CONTROL_PRESENT:${fixture}`);

  const proofChannel = evaluateProductionGuardProofChannel(env);
  if (!proofChannel.ok) failures.push(...proofChannel.failures);

  const isolation = evaluateGate6ProductionPathIsolation(env);
  if (!isolation.ok) failures.push(...isolation.failures);

  const resolved = resolveCanonicalBackendEnvPathFromFilesystem(env);
  const exact = enforceExactProductionBackendEnvForLiveOpen(env, resolved);
  if (!exact.ok) failures.push(...exact.failures);
  else if (!isProductionBackendEnvSurface(env)) {
    failures.push('LIVE_OPEN_NON_PRODUCTION_BACKEND_ENV');
  }

  return failures.length ? { ok: false, failures } : { ok: true };
}
