import {
  DI_V0_S4_ENV_ALLOWLISTS,
  DI_V0_S4_ENV_FLAGS,
  parseDiV0S4ControlPlaneConfig,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { deriveFiveFlagAttestationFingerprint } from '../di-v0-s4-five-flag-tiny-activation-production/di-v0-s4-five-flag-tiny-activation-production.lib';
import {
  assertStagingKeysPresentAndPinned,
  assertNativeRemainsOff,
  FIVE_FLAG_ON_KEYS,
  FIVE_FLAG_TRUE_VALUE,
} from '../di-v0-s4-five-flag-tiny-activation-production/di-v0-s4-five-flag-tiny-activation-production.lib';
import { parseGlobalRowDbLines, parseS4PersistenceDbLines } from '../di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production.lib';
import { parseVehicleDbProofLines } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import {
  DI_S4_GATE6_ROLLOUT_WAVE_ENV,
  evaluateRolloutWaveAllowlists,
  parseRolloutWave,
  ROLLOUT_WAVE_VEHICLE_IDS,
  type RolloutWave,
} from './di-v0-s4-fleet-rollout.lib';
import { envMapFromFileContent } from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import { parseDiV0S4RuntimeConfigAttestationFromPrometheusBody } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation-metric-parse';

export const DI_S4_GATE6_OPEN_ACK_ENV = 'DI_S4_GATE6_OPEN_ACK';
export const DI_S4_GATE6_OPEN_AUTHORIZED_ENV = 'DI_S4_GATE6_OPEN_AUTHORIZED';
export const DI_S4_GATE6_EMERGENCY_REKILL_ACK_ENV = 'DI_S4_GATE6_EMERGENCY_REKILL_ACK';
export const DI_S4_GATE6_ACCEPTED_ACK = 'YES';

export function monitoringQueriesForWave(wave: RolloutWave): {
  globalKill: string;
  s4WorkItemsRollout: string;
  s4SnapshotsRollout: string;
  unexpectedTenantWork: string;
} {
  const vehicleIds = ROLLOUT_WAVE_VEHICLE_IDS[wave];
  const vehicleInSql = vehicleIds.map((id) => `'${id}'`).join(', ');
  return {
    globalKill: `SELECT kill_state::text, left(reason, 80), left(actor, 80), updated_at FROM di_v0_s4_control WHERE id = 'GLOBAL';`,
    s4WorkItemsRollout: `SELECT id, status, trip_id, organization_id, vehicle_id, updated_at
FROM di_v0_s4_work_items
WHERE vehicle_id IN (${vehicleInSql})
ORDER BY updated_at DESC LIMIT 20;`,
    s4SnapshotsRollout: `SELECT id, trip_id, created_at FROM di_v0_s4_evidence_snapshots
WHERE trip_id IN (SELECT id FROM vehicle_trips WHERE vehicle_id IN (${vehicleInSql}))
ORDER BY created_at DESC LIMIT 20;`,
    unexpectedTenantWork: `SELECT COUNT(*)::text FROM di_v0_s4_work_items
WHERE organization_id <> '${CANONICAL_TINY_ORGANIZATION_ID}'
   OR vehicle_id NOT IN (${vehicleInSql});`,
  };
}

/** Wave-1 monitoring queries (legacy alias). */
export const GATE6_MONITORING_QUERIES = monitoringQueriesForWave(1);

export const GATE6_ABORT_CONDITIONS = [
  'GLOBAL_KILL_STATE unexpected (not NOT_KILLED during pilot window)',
  'Any di_v0_s4_work_items for org/vehicle outside pilot allowlists',
  'Work-item transition failures or stuck ACTIVE without lease heartbeat',
  'Replica health/readiness failure on A or B',
  'Replica attestation fingerprint mismatch between A and B',
  'Provider budget disabled or sustained PROVIDER_BUDGET_UNAVAILABLE on executor path',
  'APDS shadow disabled unintentionally during pilot (config drift)',
  'Unexpected spike in di_v0_s4_work_items count beyond single-trip pilot scope',
] as const;

export type Gate6OpenGuardFailure =
  | 'GATE6_ACK_INVALID'
  | 'GATE6_AUTHORIZATION_INVALID'
  | 'SHA_MISMATCH'
  | 'RELEASE_MISMATCH'
  | 'ENV_HASH_MISMATCH'
  | 'GLOBAL_PRESTATE_NOT_KILLED'
  | 'GLOBAL_PRESTATE_READ_FAILED'
  | 'GLOBAL_MALFORMED'
  | 'S4_PERSISTENCE_NONZERO'
  | 'S4_PERSISTENCE_READ_FAILED'
  | 'FIVE_FLAGS_NOT_ALL_ON'
  | 'NATIVE_FLAG_ON'
  | 'STAGING_KEYS_INVALID'
  | 'VEHICLE_DB_PROOF_FAILED'
  | 'TOPOLOGY_UNSAFE'
  | 'BUDGET_CONFIG_UNSAFE'
  | 'BUDGET_RUNTIME_UNVERIFIED'
  | 'REDIS_UNREACHABLE'
  | 'ATTESTATION_FP_MISMATCH_A'
  | 'ATTESTATION_FP_MISMATCH_B'
  | 'ATTESTATION_FP_PARITY'
  | 'EXPECTED_ATTESTATION_FP_MISMATCH'
  | 'ROLLOUT_ALLOWLIST_INVALID'
  | 'ROLLOUT_WAVE_MISSING'
  | 'ROLLOUT_WAVE_INVALID'
  | 'GLOBAL_PRESTATE_MUST_BE_KILLED_FOR_INITIAL_OPEN'
  | 'GLOBAL_PRESTATE_MUST_BE_NOT_KILLED_FOR_WAVE_PROMOTION';

export type Gate6OpenIntent = 'INITIAL_OPEN' | 'WAVE_PROMOTION';

export interface Gate6OpenGuardInput {
  gate6Ack: string | undefined;
  gate6Authorized: string | undefined;
  rolloutWave: RolloutWave;
  requiredSha: string | undefined;
  actualSha: string | undefined;
  requiredReleaseId: string | undefined;
  actualReleaseId: string | undefined;
  requiredEnvSha256: string | undefined;
  actualEnvSha256: string | undefined;
  expectedAttestationFingerprint: string | undefined;
  replicaAFingerprint: string | undefined;
  replicaBFingerprint: string | undefined;
  globalRowLines: readonly string[];
  s4PersistenceLines: readonly string[];
  envContent: string;
  vehicleDbLines: readonly string[];
  topologyOk: boolean;
  budgetConfigOk: boolean;
  budgetRuntimeOk: boolean;
  redisOk: boolean;
}

export function assertFiveFlagsOnInEnv(
  content: string,
  rolloutWave: RolloutWave = 1,
): { ok: boolean; failures: string[] } {
  const map = envMapFromFileContent(content);
  const failures: string[] = [];
  for (const key of FIVE_FLAG_ON_KEYS) {
    if (map[key] !== FIVE_FLAG_TRUE_VALUE) failures.push(`FLAG_OFF_${key}`);
  }
  const rollout = evaluateRolloutWaveAllowlists(map, rolloutWave);
  if (!rollout.ok) failures.push(...rollout.failures);
  return { ok: failures.length === 0, failures };
}

function s4PersistenceNonZero(s4Read: ReturnType<typeof parseS4PersistenceDbLines>): boolean {
  if (!s4Read.ok) return false;
  const c = s4Read.counts;
  return (
    c.pipelineRegistry > 0 ||
    c.workItems > 0 ||
    c.activeWorkItems > 0 ||
    c.evidenceSnapshots > 0 ||
    c.shadowRuns > 0 ||
    c.shadowIntervals > 0
  );
}

export function resolveGate6OpenIntent(input: Gate6OpenGuardInput): Gate6OpenIntent {
  const globalRead = parseGlobalRowDbLines(input.globalRowLines, false);
  const s4Read = parseS4PersistenceDbLines(input.s4PersistenceLines);
  if (globalRead.ok && globalRead.killState === 'NOT_KILLED' && s4PersistenceNonZero(s4Read)) {
    return 'WAVE_PROMOTION';
  }
  return 'INITIAL_OPEN';
}

function evaluateGate6CoreGuards(
  input: Gate6OpenGuardInput,
  options: { requireOperatorAck: boolean; openIntent?: Gate6OpenIntent },
): { ok: boolean; failures: Gate6OpenGuardFailure[] } {
  const failures: Gate6OpenGuardFailure[] = [];
  if (options.requireOperatorAck) {
    if (input.gate6Ack !== DI_S4_GATE6_ACCEPTED_ACK) failures.push('GATE6_ACK_INVALID');
    if (input.gate6Authorized !== DI_S4_GATE6_ACCEPTED_ACK) failures.push('GATE6_AUTHORIZATION_INVALID');
  }

  if (!input.requiredSha || !input.actualSha || input.requiredSha !== input.actualSha) failures.push('SHA_MISMATCH');
  if (!input.requiredReleaseId || !input.actualReleaseId || input.requiredReleaseId !== input.actualReleaseId) {
    failures.push('RELEASE_MISMATCH');
  }
  if (
    !input.requiredEnvSha256 ||
    !input.actualEnvSha256 ||
    input.requiredEnvSha256 !== input.actualEnvSha256
  ) {
    failures.push('ENV_HASH_MISMATCH');
  }

  const openIntent = options.openIntent ?? resolveGate6OpenIntent(input);

  const globalRead = parseGlobalRowDbLines(input.globalRowLines, false);
  if (!globalRead.ok) failures.push('GLOBAL_PRESTATE_READ_FAILED');
  else if (openIntent === 'INITIAL_OPEN' && globalRead.killState !== 'KILLED') {
    failures.push('GLOBAL_PRESTATE_NOT_KILLED');
  } else if (openIntent === 'WAVE_PROMOTION' && globalRead.killState !== 'NOT_KILLED') {
    failures.push('GLOBAL_PRESTATE_MUST_BE_NOT_KILLED_FOR_WAVE_PROMOTION');
  }

  const s4Read = parseS4PersistenceDbLines(input.s4PersistenceLines);
  if (!s4Read.ok) failures.push('S4_PERSISTENCE_READ_FAILED');
  else if (openIntent === 'INITIAL_OPEN' && s4PersistenceNonZero(s4Read)) {
    failures.push('S4_PERSISTENCE_NONZERO');
  }

  const five = assertFiveFlagsOnInEnv(input.envContent, input.rolloutWave);
  if (!five.ok) {
    if (five.failures.some((f) => f.startsWith('FLAG_OFF_'))) failures.push('FIVE_FLAGS_NOT_ALL_ON');
    else failures.push('ROLLOUT_ALLOWLIST_INVALID');
  }
  const staging = assertStagingKeysPresentAndPinned(input.envContent);
  if (!staging.ok) failures.push('STAGING_KEYS_INVALID');
  if (!assertNativeRemainsOff(input.envContent)) failures.push('NATIVE_FLAG_ON');
  if (input.rolloutWave === 1 && !parseVehicleDbProofLines(input.vehicleDbLines).ok) {
    failures.push('VEHICLE_DB_PROOF_FAILED');
  }

  if (!input.topologyOk) failures.push('TOPOLOGY_UNSAFE');
  if (!input.budgetConfigOk) failures.push('BUDGET_CONFIG_UNSAFE');
  if (!input.budgetRuntimeOk) failures.push('BUDGET_RUNTIME_UNVERIFIED');
  if (!input.redisOk) failures.push('REDIS_UNREACHABLE');

  const expectedFromEnv = deriveFiveFlagAttestationFingerprint(envMapFromFileContent(input.envContent));
  if (input.expectedAttestationFingerprint && input.expectedAttestationFingerprint !== expectedFromEnv) {
    failures.push('EXPECTED_ATTESTATION_FP_MISMATCH');
  }
  const expectedFp = input.expectedAttestationFingerprint ?? expectedFromEnv;
  if (input.replicaAFingerprint !== expectedFp) failures.push('ATTESTATION_FP_MISMATCH_A');
  if (input.replicaBFingerprint !== expectedFp) failures.push('ATTESTATION_FP_MISMATCH_B');
  if (input.replicaAFingerprint && input.replicaBFingerprint && input.replicaAFingerprint !== input.replicaBFingerprint) {
    failures.push('ATTESTATION_FP_PARITY');
  }

  return { ok: failures.length === 0, failures };
}

export function evaluateGate6OpenGuards(input: Gate6OpenGuardInput): { ok: boolean; failures: Gate6OpenGuardFailure[] } {
  return evaluateGate6CoreGuards(input, { requireOperatorAck: true });
}

export function evaluateGate6PreflightGuards(input: Gate6OpenGuardInput): { ok: boolean; failures: Gate6OpenGuardFailure[] } {
  return evaluateGate6CoreGuards(input, { requireOperatorAck: false });
}

export function requireRolloutWaveFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; wave: RolloutWave } | { ok: false; failure: 'ROLLOUT_WAVE_MISSING' | 'ROLLOUT_WAVE_INVALID' } {
  const raw = (env[DI_S4_GATE6_ROLLOUT_WAVE_ENV] ?? '').trim();
  if (!raw) return { ok: false, failure: 'ROLLOUT_WAVE_MISSING' };
  const wave = parseRolloutWave(raw);
  if (!wave) return { ok: false, failure: 'ROLLOUT_WAVE_INVALID' };
  return { ok: true, wave };
}

/** @deprecated prefer requireRolloutWaveFromEnv for mutating operator paths */
export function rolloutWaveFromEnv(env: NodeJS.ProcessEnv = process.env): RolloutWave {
  const required = requireRolloutWaveFromEnv(env);
  if (!required.ok) return 1;
  return required.wave;
}

export function parseReplicaAttestationFingerprint(metricsBody: string): string {
  const parsed = parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(metricsBody);
  return parsed.fingerprint;
}

export function evaluateEmergencyRekillAck(ack: string | undefined, reason: string, actor: string): boolean {
  return ack === DI_S4_GATE6_ACCEPTED_ACK && reason.trim().length > 0 && actor.trim().length > 0;
}
