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
import { envMapFromFileContent } from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import { parseDiV0S4RuntimeConfigAttestationFromPrometheusBody } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation-metric-parse';

export const DI_S4_GATE6_OPEN_ACK_ENV = 'DI_S4_GATE6_OPEN_ACK';
export const DI_S4_GATE6_OPEN_AUTHORIZED_ENV = 'DI_S4_GATE6_OPEN_AUTHORIZED';
export const DI_S4_GATE6_EMERGENCY_REKILL_ACK_ENV = 'DI_S4_GATE6_EMERGENCY_REKILL_ACK';
export const DI_S4_GATE6_ACCEPTED_ACK = 'YES';

export const GATE6_MONITORING_QUERIES = {
  globalKill: `SELECT kill_state::text, left(reason, 80), left(actor, 80), updated_at FROM di_v0_s4_control WHERE id = 'GLOBAL';`,
  s4WorkItemsPilot: `SELECT id, status, trip_id, organization_id, vehicle_id, updated_at
FROM di_v0_s4_work_items
WHERE vehicle_id = '${CANONICAL_TINY_VEHICLE_ID}'
ORDER BY updated_at DESC LIMIT 20;`,
  s4SnapshotsPilot: `SELECT id, trip_id, created_at FROM di_v0_s4_evidence_snapshots
WHERE trip_id IN (SELECT id FROM vehicle_trips WHERE vehicle_id = '${CANONICAL_TINY_VEHICLE_ID}')
ORDER BY created_at DESC LIMIT 20;`,
  unexpectedTenantWork: `SELECT COUNT(*)::text FROM di_v0_s4_work_items
WHERE organization_id <> '${CANONICAL_TINY_ORGANIZATION_ID}'
   OR vehicle_id <> '${CANONICAL_TINY_VEHICLE_ID}';`,
} as const;

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
  | 'EXPECTED_ATTESTATION_FP_MISMATCH';

export interface Gate6OpenGuardInput {
  gate6Ack: string | undefined;
  gate6Authorized: string | undefined;
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

export function assertFiveFlagsOnInEnv(content: string): { ok: boolean; failures: string[] } {
  const map = envMapFromFileContent(content);
  const failures: string[] = [];
  for (const key of FIVE_FLAG_ON_KEYS) {
    if (map[key] !== FIVE_FLAG_TRUE_VALUE) failures.push(`FLAG_OFF_${key}`);
  }
  const cfg = parseDiV0S4ControlPlaneConfig(map);
  if (cfg.nativeEnabled) failures.push('NATIVE_ON');
  const org = map[DI_V0_S4_ENV_ALLOWLISTS.organization] ?? '';
  const veh = map[DI_V0_S4_ENV_ALLOWLISTS.vehicle] ?? '';
  if (org !== CANONICAL_TINY_ORGANIZATION_ID) failures.push('ORG_MISMATCH');
  if (veh !== CANONICAL_TINY_VEHICLE_ID) failures.push('VEH_MISMATCH');
  return { ok: failures.length === 0, failures };
}

export function evaluateGate6OpenGuards(input: Gate6OpenGuardInput): { ok: boolean; failures: Gate6OpenGuardFailure[] } {
  const failures: Gate6OpenGuardFailure[] = [];
  if (input.gate6Ack !== DI_S4_GATE6_ACCEPTED_ACK) failures.push('GATE6_ACK_INVALID');
  if (input.gate6Authorized !== DI_S4_GATE6_ACCEPTED_ACK) failures.push('GATE6_AUTHORIZATION_INVALID');

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

  const globalRead = parseGlobalRowDbLines(input.globalRowLines, false);
  if (!globalRead.ok) failures.push('GLOBAL_PRESTATE_READ_FAILED');
  else if (globalRead.killState !== 'KILLED') failures.push('GLOBAL_PRESTATE_NOT_KILLED');

  const s4Read = parseS4PersistenceDbLines(input.s4PersistenceLines);
  if (!s4Read.ok) failures.push('S4_PERSISTENCE_READ_FAILED');
  else {
    const c = s4Read.counts;
    const nonzero =
      c.pipelineRegistry > 0 ||
      c.workItems > 0 ||
      c.activeWorkItems > 0 ||
      c.evidenceSnapshots > 0 ||
      c.shadowRuns > 0 ||
      c.shadowIntervals > 0;
    if (nonzero) failures.push('S4_PERSISTENCE_NONZERO');
  }

  const five = assertFiveFlagsOnInEnv(input.envContent);
  if (!five.ok) failures.push('FIVE_FLAGS_NOT_ALL_ON');
  const staging = assertStagingKeysPresentAndPinned(input.envContent);
  if (!staging.ok) failures.push('STAGING_KEYS_INVALID');
  if (!assertNativeRemainsOff(input.envContent)) failures.push('NATIVE_FLAG_ON');
  if (!parseVehicleDbProofLines(input.vehicleDbLines).ok) failures.push('VEHICLE_DB_PROOF_FAILED');

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

export function parseReplicaAttestationFingerprint(metricsBody: string): string {
  const parsed = parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(metricsBody);
  return parsed.fingerprint;
}

export function evaluateEmergencyRekillAck(ack: string | undefined, reason: string, actor: string): boolean {
  return ack === DI_S4_GATE6_ACCEPTED_ACK && reason.trim().length > 0 && actor.trim().length > 0;
}
