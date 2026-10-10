import * as crypto from 'crypto';
import * as fs from 'fs';
import { DI_S4_GATE6_WRAPPER_ATTESTATION_ENV, DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE } from './di-v0-s4-gate6-os-authorization.lib';
import { isProductionBackendEnvSurface } from './di-v0-s4-gate6-live-authority.lib';

/** Guard proof fields collected by the pinned wrapper — must not be injected via process.env on Production. */
export const GATE6_PRODUCTION_GUARD_PROOF_BUNDLE_KEYS = [
  'DI_S4F7AS_GLOBAL_ROW_LINES',
  'DI_S4F7AS_S4_PERSISTENCE_LINES',
  'DI_S4F7AS_ENV_CONTENT',
  'DI_S4F7AS_VEHICLE_DB_LINES',
  'DI_S4F7AS_TOPOLOGY_OK',
  'DI_S4F7AS_BUDGET_CONFIG_OK',
  'DI_S4F7AS_BUDGET_RUNTIME_OK',
  'DI_S4F7AS_REDIS_OK',
] as const;

/** @deprecated use GATE6_PRODUCTION_GUARD_PROOF_BUNDLE_KEYS */
export const GATE6_PRODUCTION_SIMULATED_GUARD_PROOF_ENV_KEYS = GATE6_PRODUCTION_GUARD_PROOF_BUNDLE_KEYS;

export const DI_S4_GATE6_GUARD_PROOF_BUNDLE_PATH_ENV = 'DI_S4_GATE6_GUARD_PROOF_BUNDLE_PATH';
export const GUARD_PROOF_BUNDLE_COLLECTOR_MARKER = 'GATE6_WRAPPER_V1';

const BUNDLE_KEYS = [...GATE6_PRODUCTION_GUARD_PROOF_BUNDLE_KEYS] as const;

export type GuardProofBundleFailure =
  | 'GUARD_PROOF_BUNDLE_PATH_MISSING'
  | 'GUARD_PROOF_BUNDLE_UNREADABLE'
  | 'GUARD_PROOF_BUNDLE_INVALID'
  | 'GUARD_PROOF_BUNDLE_COLLECTOR_INVALID'
  | 'GUARD_PROOF_INJECTED_IN_PROCESS_ENV';

export function guardProofKeysInProcessEnv(env: NodeJS.ProcessEnv): string[] {
  const present: string[] = [];
  for (const key of BUNDLE_KEYS) {
    if ((env[key] ?? '').trim().length > 0) present.push(key);
  }
  return present;
}

export function writeGuardProofBundleFile(
  filePath: string,
  values: Record<string, string>,
): void {
  const lines = [`COLLECTOR=${GUARD_PROOF_BUNDLE_COLLECTOR_MARKER}`];
  for (const key of BUNDLE_KEYS) {
    const v = values[key];
    if (v !== undefined) lines.push(`${key}=${encodeBundleValue(v)}`);
  }
  const body = `${lines.join('\n')}\n`;
  const fd = fs.openSync(filePath, fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_WRONLY, 0o600);
  fs.writeFileSync(fd, body, 'utf8');
  fs.closeSync(fd);
}

function encodeBundleValue(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function decodeBundleValue(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

export function readGuardProofBundleFile(
  filePath: string,
): { ok: true; values: Record<string, string> } | { ok: false; failure: GuardProofBundleFailure } {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const values: Record<string, string> = {};
    let collectorOk = false;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) return { ok: false, failure: 'GUARD_PROOF_BUNDLE_INVALID' };
      const key = line.slice(0, idx);
      const val = line.slice(idx + 1);
      if (key === 'COLLECTOR') {
        collectorOk = val === GUARD_PROOF_BUNDLE_COLLECTOR_MARKER;
        continue;
      }
      if ((BUNDLE_KEYS as readonly string[]).includes(key)) {
        values[key] = decodeBundleValue(val);
      }
    }
    if (!collectorOk) return { ok: false, failure: 'GUARD_PROOF_BUNDLE_COLLECTOR_INVALID' };
    return { ok: true, values };
  } catch {
    return { ok: false, failure: 'GUARD_PROOF_BUNDLE_UNREADABLE' };
  }
}

export function evaluateProductionGuardProofChannel(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; bundleValues?: Record<string, string> } | { ok: false; failures: GuardProofBundleFailure[] } {
  if (!isProductionBackendEnvSurface(env)) {
    return { ok: true };
  }
  const failures: GuardProofBundleFailure[] = [];
  const injected = guardProofKeysInProcessEnv(env);
  if (injected.length > 0) {
    failures.push('GUARD_PROOF_INJECTED_IN_PROCESS_ENV');
    return { ok: false, failures };
  }
  const bundlePath = (env[DI_S4_GATE6_GUARD_PROOF_BUNDLE_PATH_ENV] ?? '').trim();
  if (!bundlePath) {
    failures.push('GUARD_PROOF_BUNDLE_PATH_MISSING');
    return { ok: false, failures };
  }
  const bundle = readGuardProofBundleFile(bundlePath);
  if (!bundle.ok) {
    failures.push(bundle.failure);
    return { ok: false, failures };
  }
  if ((env[DI_S4_GATE6_WRAPPER_ATTESTATION_ENV] ?? '').trim() !== DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE) {
    failures.push('GUARD_PROOF_BUNDLE_INVALID');
    return { ok: false, failures };
  }
  return { ok: true, bundleValues: bundle.values };
}

export function guardProofBundleDigest(values: Record<string, string>): string {
  const parts = BUNDLE_KEYS.map((k) => `${k}=${values[k] ?? ''}`);
  return crypto.createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
}

export function guardProofValuesFromEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of BUNDLE_KEYS) {
    if ((env[key] ?? '').length > 0) values[key] = env[key] as string;
  }
  return values;
}

/**
 * Production: load trusted proofs from bundle file only. Non-production: read DI_S4F7AS_* from env.
 */
export function resolveGate6GuardProofValues(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; values: Record<string, string> } | { ok: false; failures: GuardProofBundleFailure[] } {
  if (!isProductionBackendEnvSurface(env)) {
    return { ok: true, values: guardProofValuesFromEnv(env) };
  }
  const channel = evaluateProductionGuardProofChannel(env);
  if (!channel.ok) return { ok: false, failures: channel.failures };
  return { ok: true, values: channel.bundleValues ?? {} };
}
