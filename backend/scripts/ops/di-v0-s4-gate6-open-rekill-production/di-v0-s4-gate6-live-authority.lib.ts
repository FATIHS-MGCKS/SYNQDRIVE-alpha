import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';
import {
  consumeLiveOpenDispatchToken,
  DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV,
  type DispatchTokenFailure,
} from './di-v0-s4-gate6-dispatch-token.lib';

export const SYNQDRIVE_BACKEND_ENV_CANONICAL_ENV = 'SYNQDRIVE_BACKEND_ENV_CANONICAL';

/** Production path must not accept simulated metrics/DB proof env vars. */
export const GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS = [
  'DI_S4F7AS_FIXTURE_MODE',
  'DI_S4F7J_FIXTURE_MODE',
  'DI_S4F7AO_FIXTURE_MODE',
  'DI_S4F7AS_FIXTURE_METRICS_BODY_A',
  'DI_S4F7AS_FIXTURE_METRICS_BODY_B',
  'DI_S4F7J_FIXTURE_METRICS_BODY_A',
  'DI_S4F7J_FIXTURE_METRICS_BODY_B',
  'DI_S4F7J_FIXTURE_METRICS_BODY',
  'DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE',
  'DI_S4F7J_FIXTURE_VEHICLE_DB_LINES',
  'DI_S4F7AS_ENGINEERING_TEST_HARNESS',
  'DI_S4F7AS_TEST_MODE',
  'DI_S4F7J_TEST_MODE',
  'DI_S4F7AO_TEST_MODE',
  'DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST',
  'DI_S4_GATE6_LIVE_OPEN_DISPATCH_NONCE',
] as const;

export type Gate6LiveOpenAuthorityFailure = DispatchTokenFailure | 'PRODUCTION_FIXTURE_CONTROL_PRESENT' | 'PRODUCTION_BACKEND_ENV_CANONICAL_MISSING';

export function isCanonicalProductionBackendEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const canonical = (env[SYNQDRIVE_BACKEND_ENV_CANONICAL_ENV] ?? '').trim();
  return canonical.length > 0 && canonical === PRODUCTION_SHARED_BACKEND_ENV_PATH;
}

export function firstProductionFixtureControlPresent(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const key of GATE6_PRODUCTION_FORBIDDEN_FIXTURE_ENV_KEYS) {
    const value = (env[key] ?? '').trim();
    if (value.length > 0) return key;
  }
  return undefined;
}

export function evaluateGate6ProductionPathIsolation(
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!isCanonicalProductionBackendEnv(env)) {
    return { ok: true, failures };
  }
  if (!(env[SYNQDRIVE_BACKEND_ENV_CANONICAL_ENV] ?? '').trim()) {
    failures.push('PRODUCTION_BACKEND_ENV_CANONICAL_MISSING');
  }
  const fixture = firstProductionFixtureControlPresent(env);
  if (fixture) failures.push(`PRODUCTION_FIXTURE_CONTROL_PRESENT:${fixture}`);
  return { ok: failures.length === 0, failures };
}

/**
 * One-shot dispatch token file (wrapper-issued secret MAC). Env-only digest is not accepted.
 */
export function consumeGate6LiveOpenDispatchFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const tokenFile = (env[DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV] ?? '').trim();
  if (!tokenFile) {
    return { ok: false as const, failures: ['DISPATCH_TOKEN_FILE_MISSING' as DispatchTokenFailure], consumed: false };
  }
  return consumeLiveOpenDispatchToken(tokenFile);
}
