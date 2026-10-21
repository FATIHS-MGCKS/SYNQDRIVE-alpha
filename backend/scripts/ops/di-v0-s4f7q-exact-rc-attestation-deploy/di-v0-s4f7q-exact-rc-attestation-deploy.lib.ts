/**
 * EXP-021 S4F-7Q — exact-RC dormant attestation deploy guard (pure; ops/tests).
 */
import { parseDiV0S4RuntimeConfigAttestationFromPrometheusBody } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation-metric-parse';
import {
  EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT,
  DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';

export const DI_S4F7Q_FROZEN_TARGET_RC_SHA = '9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4';
export const DI_S4F7Q_FROZEN_EXPECTED_OLD_PRODUCTION_SHA = 'ee9588548845c8077aa0cba0684b06eac7c9d4d2';
export const DI_S4F7Q_EXPECTED_PRESTATE_FINGERPRINT = EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT;
export const DI_S4F7Q_EXPECTED_ATTESTATION_STATE = 'PRESTATE' as const;

const SHA40 = /^[0-9a-f]{40}$/;

const S4_FLAG_KEYS = [
  'DI_V0_S4_MASTER_ENABLED',
  'DI_V0_S4_DISCOVERY_ENABLED',
  'DI_V0_S4_WORKER_ENABLED',
  'DI_V0_S4_POSITION_ENABLED',
  'DI_V0_S4_R1_ENABLED',
  'DI_V0_S4_NATIVE_ENABLED',
] as const;

const STAGING_KEYS = [
  'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE',
  'DI_V0_S4_ORGANIZATION_ALLOWLIST',
  'DI_V0_S4_VEHICLE_ALLOWLIST',
] as const;

export type DiS4f7qAbortReason =
  | 'TARGET_SHA_MISMATCH'
  | 'OLD_PRODUCTION_SHA_MISMATCH'
  | 'GLOBAL_NOT_KILLED'
  | 'S4_FLAG_ON'
  | 'STAGING_KEY_PRESENT'
  | 'ATTESTATION_METRIC_MISSING'
  | 'ATTESTATION_METRIC_DUPLICATE'
  | 'ATTESTATION_MALFORMED'
  | 'ATTESTATION_WRONG_STATE'
  | 'ATTESTATION_WRONG_FINGERPRINT'
  | 'METRICS_AUTH_FAILURE'
  | 'METRICS_TIMEOUT'
  | 'REPLICA_HEALTH_FAILURE'
  | 'REPLICA_SHA_MISMATCH';

export interface DiS4f7qShaPinInput {
  targetSha: string;
  observedOldProductionSha: string;
}

export function assertDiS4f7qShaPins(input: DiS4f7qShaPinInput): DiS4f7qAbortReason | null {
  if (!SHA40.test(input.targetSha) || input.targetSha !== DI_S4F7Q_FROZEN_TARGET_RC_SHA) {
    return 'TARGET_SHA_MISMATCH';
  }
  if (
    !SHA40.test(input.observedOldProductionSha) ||
    input.observedOldProductionSha !== DI_S4F7Q_FROZEN_EXPECTED_OLD_PRODUCTION_SHA
  ) {
    return 'OLD_PRODUCTION_SHA_MISMATCH';
  }
  return null;
}

export interface DiS4f7qPreDeployEnvInput {
  globalKillState: string;
  env: Readonly<Record<string, string | undefined>>;
}

export function envMapFromBackendEnvContent(content: string): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx);
    let v = trimmed.slice(idx + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map[key] = v;
  }
  return map;
}

function s4FlagTruthy(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

export function assertDiS4f7qPreDeployEnvGates(input: DiS4f7qPreDeployEnvInput): DiS4f7qAbortReason | null {
  if (input.globalKillState !== 'KILLED') return 'GLOBAL_NOT_KILLED';
  for (const key of S4_FLAG_KEYS) {
    if (s4FlagTruthy(input.env[key])) return 'S4_FLAG_ON';
  }
  for (const key of STAGING_KEYS) {
    const raw = input.env[key];
    if (raw !== undefined && raw.trim() !== '') return 'STAGING_KEY_PRESENT';
  }
  return null;
}

export type DiS4f7qMetricsFetchResult =
  | { ok: true; body: string }
  | { ok: false; reason: 'METRICS_AUTH_FAILURE' | 'METRICS_TIMEOUT' | 'REPLICA_HEALTH_FAILURE' };

export function verifyReplicaPrestateAttestationFromMetricsBody(
  body: string,
): { ok: true } | { ok: false; reason: DiS4f7qAbortReason } {
  try {
    const parsed = parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(body);
    if (parsed.state !== DI_S4F7Q_EXPECTED_ATTESTATION_STATE) {
      return { ok: false, reason: 'ATTESTATION_WRONG_STATE' };
    }
    if (parsed.fingerprint !== DI_S4F7Q_EXPECTED_PRESTATE_FINGERPRINT) {
      return { ok: false, reason: 'ATTESTATION_WRONG_FINGERPRINT' };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'ATTESTATION_METRIC_MISSING') return { ok: false, reason: 'ATTESTATION_METRIC_MISSING' };
    if (msg === 'ATTESTATION_METRIC_DUPLICATE') return { ok: false, reason: 'ATTESTATION_METRIC_DUPLICATE' };
    if (msg.includes('MALFORMED') || msg.includes('UNSUPPORTED')) {
      return { ok: false, reason: 'ATTESTATION_MALFORMED' };
    }
    return { ok: false, reason: 'ATTESTATION_MALFORMED' };
  }
}

export interface DiS4f7qRollingDecisionInput {
  phase: 'AFTER_A' | 'AFTER_B';
  replicaHealthy: boolean;
  replicaShaMatchesTarget: boolean;
  metricsBody: string | null;
  metricsFetchError?: 'METRICS_AUTH_FAILURE' | 'METRICS_TIMEOUT' | 'REPLICA_HEALTH_FAILURE';
}

export function decideDiS4f7qRollingContinue(input: DiS4f7qRollingDecisionInput): {
  allowContinue: boolean;
  allowRestartB: boolean;
  reason: DiS4f7qAbortReason | null;
} {
  if (!input.replicaHealthy) {
    return { allowContinue: false, allowRestartB: false, reason: 'REPLICA_HEALTH_FAILURE' };
  }
  if (!input.replicaShaMatchesTarget) {
    return { allowContinue: false, allowRestartB: false, reason: 'REPLICA_SHA_MISMATCH' };
  }
  if (input.metricsFetchError === 'METRICS_AUTH_FAILURE') {
    return { allowContinue: false, allowRestartB: false, reason: 'METRICS_AUTH_FAILURE' };
  }
  if (input.metricsFetchError === 'METRICS_TIMEOUT') {
    return { allowContinue: false, allowRestartB: false, reason: 'METRICS_TIMEOUT' };
  }
  if (input.metricsBody === null) {
    return { allowContinue: false, allowRestartB: false, reason: 'ATTESTATION_METRIC_MISSING' };
  }
  const att = verifyReplicaPrestateAttestationFromMetricsBody(input.metricsBody);
  if (!att.ok) {
    return { allowContinue: false, allowRestartB: false, reason: att.reason };
  }
  if (input.phase === 'AFTER_A') {
    return { allowContinue: true, allowRestartB: true, reason: null };
  }
  return { allowContinue: true, allowRestartB: false, reason: null };
}

export function formatAttestationMetricLineForFixture(
  fingerprint: string,
  state: string,
  contractVersion = 'v1',
): string {
  return `${DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC}{fingerprint="${fingerprint}",state="${state}",contract_version="${contractVersion}"} 1\n`;
}

export function evaluateDiS4f7qPreDeploy(
  shaPins: DiS4f7qShaPinInput,
  envGates: DiS4f7qPreDeployEnvInput,
): DiS4f7qAbortReason | null {
  const sha = assertDiS4f7qShaPins(shaPins);
  if (sha) return sha;
  return assertDiS4f7qPreDeployEnvGates(envGates);
}

export interface DiS4f7qRollingSimulationInput {
  preDeployAbort: DiS4f7qAbortReason | null;
  afterA: DiS4f7qRollingDecisionInput;
  afterB?: DiS4f7qRollingDecisionInput;
}

export interface DiS4f7qRollingSimulationResult {
  abortedBeforeMutation: boolean;
  replicaBRestartAttempted: boolean;
  rollbackScope: 'NONE' | 'A_ONLY' | 'FULL';
  finalReason: DiS4f7qAbortReason | null;
  deployContinues: boolean;
}

export function simulateDiS4f7qRollingDeploy(input: DiS4f7qRollingSimulationInput): DiS4f7qRollingSimulationResult {
  if (input.preDeployAbort) {
    return {
      abortedBeforeMutation: true,
      replicaBRestartAttempted: false,
      rollbackScope: 'NONE',
      finalReason: input.preDeployAbort,
      deployContinues: false,
    };
  }
  const a = decideDiS4f7qRollingContinue(input.afterA);
  if (!a.allowRestartB) {
    return {
      abortedBeforeMutation: false,
      replicaBRestartAttempted: false,
      rollbackScope: 'A_ONLY',
      finalReason: a.reason,
      deployContinues: false,
    };
  }
  if (!input.afterB) {
    return {
      abortedBeforeMutation: false,
      replicaBRestartAttempted: true,
      rollbackScope: 'NONE',
      finalReason: null,
      deployContinues: true,
    };
  }
  const b = decideDiS4f7qRollingContinue(input.afterB);
  if (!b.allowContinue) {
    return {
      abortedBeforeMutation: false,
      replicaBRestartAttempted: true,
      rollbackScope: 'FULL',
      finalReason: b.reason,
      deployContinues: false,
    };
  }
  return {
    abortedBeforeMutation: false,
    replicaBRestartAttempted: true,
    rollbackScope: 'NONE',
    finalReason: null,
    deployContinues: true,
  };
}

const TOKEN_SUBSTRINGS = ['METRICS_BEARER_TOKEN', 'Bearer '];

export function assertMetricsTokenNotInOutput(output: string, token: string): boolean {
  if (!token) return true;
  if (output.includes(token)) return false;
  for (const sub of TOKEN_SUBSTRINGS) {
    if (output.includes(`${sub}=${token}`)) return false;
  }
  return true;
}

export function genericDeployGateEnabledFromEnv(envValue: string | undefined): boolean {
  return envValue === '1';
}
