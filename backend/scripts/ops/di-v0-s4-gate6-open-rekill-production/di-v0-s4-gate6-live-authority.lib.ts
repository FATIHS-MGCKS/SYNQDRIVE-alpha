import { createHash } from 'crypto';
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';
import {
  evaluateGate6OpenGuards,
  type Gate6OpenGuardInput,
} from './di-v0-s4-gate6-open-rekill-production.lib';

export const DI_S4_GATE6_LIVE_OPEN_DISPATCH_NONCE_ENV = 'DI_S4_GATE6_LIVE_OPEN_DISPATCH_NONCE';
export const DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST_ENV = 'DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST';
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
] as const;

export type Gate6LiveOpenAuthorityFailure =
  | 'DIRECT_CLI_LIVE_OPEN_FORBIDDEN'
  | 'DISPATCH_NONCE_MISSING'
  | 'DISPATCH_DIGEST_MISSING'
  | 'DISPATCH_DIGEST_INVALID'
  | 'AUDIT_FIELDS_MISSING'
  | 'PRODUCTION_FIXTURE_CONTROL_PRESENT'
  | 'PRODUCTION_BACKEND_ENV_CANONICAL_MISSING';

export function computeGate6LiveOpenDispatchDigest(input: {
  requiredSha: string;
  requiredReleaseId: string;
  requiredEnvSha256: string;
  nonce: string;
  reason: string;
  actor: string;
}): string {
  const payload = [
    input.requiredSha,
    input.requiredReleaseId,
    input.requiredEnvSha256,
    input.nonce,
    input.reason.trim(),
    input.actor.trim(),
  ].join('\0');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

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

export function evaluateGate6LiveOpenAuthority(
  guardInput: Gate6OpenGuardInput,
  env: NodeJS.ProcessEnv = process.env,
  audit: { reason: string; actor: string },
): { ok: boolean; failures: (Gate6LiveOpenAuthorityFailure | string)[] } {
  const failures: (Gate6LiveOpenAuthorityFailure | string)[] = [];

  const isolation = evaluateGate6ProductionPathIsolation(env);
  if (!isolation.ok) failures.push(...isolation.failures);

  if (!audit.reason.trim() || !audit.actor.trim()) {
    failures.push('AUDIT_FIELDS_MISSING');
  }

  const guards = evaluateGate6OpenGuards(guardInput);
  if (!guards.ok) failures.push(...guards.failures);

  const nonce = (env[DI_S4_GATE6_LIVE_OPEN_DISPATCH_NONCE_ENV] ?? '').trim();
  const digest = (env[DI_S4_GATE6_LIVE_OPEN_DISPATCH_DIGEST_ENV] ?? '').trim();
  if (!nonce) failures.push('DISPATCH_NONCE_MISSING');
  if (!digest) failures.push('DISPATCH_DIGEST_MISSING');

  if (
    nonce &&
    digest &&
    guardInput.requiredSha &&
    guardInput.requiredReleaseId &&
    guardInput.requiredEnvSha256 &&
    audit.reason.trim() &&
    audit.actor.trim()
  ) {
    const expected = computeGate6LiveOpenDispatchDigest({
      requiredSha: guardInput.requiredSha,
      requiredReleaseId: guardInput.requiredReleaseId,
      requiredEnvSha256: guardInput.requiredEnvSha256,
      nonce,
      reason: audit.reason,
      actor: audit.actor,
    });
    if (expected !== digest) failures.push('DISPATCH_DIGEST_INVALID');
  }

  return { ok: failures.length === 0, failures };
}
