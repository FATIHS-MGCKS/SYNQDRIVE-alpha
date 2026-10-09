import {
  DI_V0_S4_ENV_ALLOWLISTS,
  DI_V0_S4_ENV_FLAGS,
  parseDiV0S4ControlPlaneConfig,
  evaluateDiV0S4Enablement,
  evaluateDiV0S4KillRow,
  evaluateDiV0S4MaintenanceEnablement,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  evaluateDiV0S4RuntimeConfigAttestation,
  type DiV0S4RuntimeAttestationState,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import { parseDiV0S4RuntimeConfigAttestationFromPrometheusBody } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation-metric-parse';
import { assertDiV0S4OpsControlFlagsSafe } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-ops-s4-control-preflight';
import {
  classifyGlobalControlPrestate,
  parseGlobalRowDbLines,
  parseS4PersistenceDbLines,
} from '../di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production.lib';
import {
  countEnvKeyOccurrences,
  parseVehicleDbProofLines,
  sha256FileContent,
  type StagingKeySemanticState,
  classifyStagingKeySemanticState,
} from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
  parseCanonicalUtcNotBefore,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import { OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-frozen-not-before';
import { envMapFromFileContent, parseEnvFile, sha256Hex } from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';

export const DI_S4_FIVE_FLAG_TINY_ACTIVATION_ACK_ENV = 'DI_S4_FIVE_FLAG_TINY_ACTIVATION_ACK';
export const DI_S4F7AO_FIVE_FLAG_AUTHORIZED_ENV = 'DI_S4F7AO_FIVE_FLAG_AUTHORIZED';
export const DI_S4_FIVE_FLAG_ACCEPTED_ACK = 'YES';

export const FIVE_FLAG_ON_KEYS = [
  DI_V0_S4_ENV_FLAGS.master,
  DI_V0_S4_ENV_FLAGS.discovery,
  DI_V0_S4_ENV_FLAGS.worker,
  DI_V0_S4_ENV_FLAGS.position,
  DI_V0_S4_ENV_FLAGS.r1,
] as const;

export const NATIVE_FLAG_KEY = DI_V0_S4_ENV_FLAGS.native;

export const STAGING_PRESERVE_KEYS = [
  OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV,
  DI_V0_S4_ENV_ALLOWLISTS.organization,
  DI_V0_S4_ENV_ALLOWLISTS.vehicle,
] as const;

export const FIVE_FLAG_SUPPORTED_MUTATION_KEY_COUNT = 5;
export const FIVE_FLAG_TRUE_VALUE = 'true';
export const NATIVE_FALSE_VALUE = 'false';

export type FiveFlagGuardFailure =
  | 'ACK_INVALID'
  | 'AUTHORIZATION_INVALID'
  | 'SHA_MISMATCH'
  | 'RELEASE_MISMATCH'
  | 'ENV_HASH_MISMATCH'
  | 'GLOBAL_STATE_PIN_INVALID'
  | 'GLOBAL_PRESTATE_READ_FAILED'
  | 'GLOBAL_NOT_KILLED'
  | 'GLOBAL_MALFORMED'
  | 'S4_PERSISTENCE_READ_FAILED'
  | 'S4_PERSISTENCE_NONZERO'
  | 'S4_FLAGS_UNSAFE'
  | 'STAGING_KEYS_NOT_PRESENT'
  | 'STAGING_KEY_TENANT_MISMATCH'
  | 'NOT_BEFORE_INVALID'
  | 'NATIVE_FLAG_ON'
  | 'VEHICLE_DB_PROOF_FAILED'
  | 'TOPOLOGY_UNSAFE'
  | 'BUDGET_CONFIG_UNSAFE'
  | 'BUDGET_RUNTIME_UNVERIFIED'
  | 'REDIS_UNREACHABLE'
  | 'SEMANTIC_DIFF_INVALID';

export interface FiveFlagGuardInput {
  operatorAck: string | undefined;
  fiveFlagAuthorized: string | undefined;
  requiredSha: string | undefined;
  actualSha: string | undefined;
  requiredReleaseId: string | undefined;
  actualReleaseId: string | undefined;
  requiredEnvSha256: string | undefined;
  actualEnvSha256: string | undefined;
  expectedGlobalState: string | undefined;
  globalRowLines: readonly string[];
  s4PersistenceLines: readonly string[];
  envContent: string;
  envReadable: boolean;
  vehicleDbLines: readonly string[];
  topologyOk: boolean;
  budgetConfigExplicitEnabled: boolean;
  budgetRuntimeBothEnabled: boolean;
  redisReachable: boolean;
}

export function sha256FileContentExport(content: string): string {
  return sha256FileContent(content);
}

export { sha256Hex };

export function assertStagingKeysPresentAndPinned(content: string): {
  ok: boolean;
  failures: string[];
  notBefore?: string;
} {
  const failures: string[] = [];
  const states: Record<string, StagingKeySemanticState> = {};
  for (const key of STAGING_PRESERVE_KEYS) {
    states[key] = classifyStagingKeySemanticState(content, key);
    if (states[key] !== 'PRESENT') failures.push(`STAGING_${key}_NOT_PRESENT`);
  }
  const map = envMapFromFileContent(content);
  const nb = map[OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV] ?? '';
  const org = map[DI_V0_S4_ENV_ALLOWLISTS.organization] ?? '';
  const veh = map[DI_V0_S4_ENV_ALLOWLISTS.vehicle] ?? '';
  if (!parseCanonicalUtcNotBefore(nb).ok) failures.push('NOT_BEFORE_INVALID');
  if (org !== CANONICAL_TINY_ORGANIZATION_ID) failures.push('ORG_MISMATCH');
  if (veh !== CANONICAL_TINY_VEHICLE_ID) failures.push('VEH_MISMATCH');
  return { ok: failures.length === 0, failures, notBefore: nb };
}

export function assertNativeRemainsOff(content: string): boolean {
  const map = envMapFromFileContent(content);
  const cfg = parseDiV0S4ControlPlaneConfig(map);
  return !cfg.nativeEnabled;
}

export function applyFiveFlagMutation(originalContent: string): {
  nextContent: string;
  mutated: boolean;
} {
  const staging = assertStagingKeysPresentAndPinned(originalContent);
  if (!staging.ok) {
    throw new Error(`staging_precondition:${staging.failures.join(',')}`);
  }
  const safe = assertDiV0S4OpsControlFlagsSafe(envMapFromFileContent(originalContent));
  if (!safe.ok) {
    throw new Error(`s4_flags_prestate:${safe.unsafeKeys.join(',')}`);
  }
  if (!assertNativeRemainsOff(originalContent)) {
    throw new Error('native_flag_on_prestate');
  }

  const stagingSnapshot: Record<string, string> = {};
  const beforeMap = envMapFromFileContent(originalContent);
  for (const key of STAGING_PRESERVE_KEYS) {
    stagingSnapshot[key] = beforeMap[key] ?? '';
  }

  const lines = originalContent.split('\n');
  const fileMap = parseEnvFile(originalContent);
  for (const key of FIVE_FLAG_ON_KEYS) {
    fileMap.set(key, FIVE_FLAG_TRUE_VALUE);
  }
  if (fileMap.has(NATIVE_FLAG_KEY)) {
    fileMap.set(NATIVE_FLAG_KEY, NATIVE_FALSE_VALUE);
  }

  const out: string[] = [];
  const written = new Set<string>();
  for (const line of lines) {
    if (!line || line.startsWith('#')) {
      out.push(line);
      continue;
    }
    const idx = line.indexOf('=');
    if (idx <= 0) {
      out.push(line);
      continue;
    }
    const key = line.slice(0, idx);
    if ((STAGING_PRESERVE_KEYS as readonly string[]).includes(key)) {
      if (!written.has(key)) {
        out.push(`${key}=${stagingSnapshot[key]}`);
        written.add(key);
      }
      continue;
    }
    if ((FIVE_FLAG_ON_KEYS as readonly string[]).includes(key)) {
      if (!written.has(key)) {
        out.push(`${key}=${FIVE_FLAG_TRUE_VALUE}`);
        written.add(key);
      }
      continue;
    }
    if (key === NATIVE_FLAG_KEY) {
      if (!written.has(key)) {
        out.push(`${key}=${fileMap.get(NATIVE_FLAG_KEY)}`);
        written.add(key);
      }
      continue;
    }
    out.push(line);
    written.add(key);
  }
  for (const key of FIVE_FLAG_ON_KEYS) {
    if (!written.has(key)) {
      out.push(`${key}=${FIVE_FLAG_TRUE_VALUE}`);
      written.add(key);
    }
  }
  const nextContent = out.join('\n').replace(/\n*$/, '\n');
  for (const key of STAGING_PRESERVE_KEYS) {
    if (envMapFromFileContent(nextContent)[key] !== stagingSnapshot[key]) {
      throw new Error(`staging_key_mutated:${key}`);
    }
  }
  const normalizedOriginal = originalContent.replace(/\n*$/, '\n');
  return { nextContent, mutated: nextContent !== normalizedOriginal };
}

export function computeFiveFlagSemanticDiff(
  beforeContent: string,
  afterContent: string,
): {
  changedKeys: string[];
  unexpectedChangedKeyCount: number;
  envChangedKeyCount: number;
  ok: boolean;
} {
  const before = envMapFromFileContent(beforeContent);
  const after = envMapFromFileContent(afterContent);
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changedKeys: string[] = [];
  for (const key of allKeys) {
    const b = before[key] ?? '';
    const a = after[key] ?? '';
    if (b !== a) changedKeys.push(key);
  }
  changedKeys.sort();
  const allowed = new Set(FIVE_FLAG_ON_KEYS as readonly string[]);
  const unexpected = changedKeys.filter((k) => !allowed.has(k));
  const ok =
    changedKeys.length === FIVE_FLAG_SUPPORTED_MUTATION_KEY_COUNT &&
    unexpected.length === 0 &&
    changedKeys.every((k) => allowed.has(k) && after[k] === FIVE_FLAG_TRUE_VALUE);
  return {
    changedKeys,
    unexpectedChangedKeyCount: unexpected.length,
    envChangedKeyCount: changedKeys.length,
    ok,
  };
}

export function evaluateFiveFlagGuards(input: FiveFlagGuardInput): { ok: boolean; failures: FiveFlagGuardFailure[] } {
  const failures: FiveFlagGuardFailure[] = [];

  if (input.operatorAck !== DI_S4_FIVE_FLAG_ACCEPTED_ACK) failures.push('ACK_INVALID');
  if (input.fiveFlagAuthorized !== DI_S4_FIVE_FLAG_ACCEPTED_ACK) failures.push('AUTHORIZATION_INVALID');

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
  if (input.expectedGlobalState !== 'KILLED') failures.push('GLOBAL_STATE_PIN_INVALID');

  const globalRead = parseGlobalRowDbLines(input.globalRowLines, false);
  if (!globalRead.ok) failures.push('GLOBAL_PRESTATE_READ_FAILED');
  else {
    const pre = classifyGlobalControlPrestate(globalRead.rowCount, [globalRead.killState ?? '']);
    if (pre === 'MALFORMED') failures.push('GLOBAL_MALFORMED');
    else if (pre !== 'KILLED') failures.push('GLOBAL_NOT_KILLED');
  }

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

  if (input.envReadable) {
    const staging = assertStagingKeysPresentAndPinned(input.envContent);
    if (!staging.ok) {
      if (staging.failures.some((f) => f.includes('NOT_PRESENT'))) failures.push('STAGING_KEYS_NOT_PRESENT');
      else if (staging.failures.some((f) => f.includes('MISMATCH'))) failures.push('STAGING_KEY_TENANT_MISMATCH');
      else failures.push('NOT_BEFORE_INVALID');
    }
    const s4 = assertDiV0S4OpsControlFlagsSafe(envMapFromFileContent(input.envContent));
    if (!s4.ok) failures.push('S4_FLAGS_UNSAFE');
    if (!assertNativeRemainsOff(input.envContent)) failures.push('NATIVE_FLAG_ON');
  }

  if (!parseVehicleDbProofLines(input.vehicleDbLines).ok) failures.push('VEHICLE_DB_PROOF_FAILED');
  if (!input.topologyOk) failures.push('TOPOLOGY_UNSAFE');
  if (!input.budgetConfigExplicitEnabled) failures.push('BUDGET_CONFIG_UNSAFE');
  if (!input.budgetRuntimeBothEnabled) failures.push('BUDGET_RUNTIME_UNVERIFIED');
  if (!input.redisReachable) failures.push('REDIS_UNREACHABLE');

  return { ok: failures.length === 0, failures };
}

export function deriveFiveFlagAttestationFingerprint(env: Readonly<Record<string, string | undefined>>): string {
  return evaluateDiV0S4RuntimeConfigAttestation(env).fingerprint;
}

export function proveFiveFlagReplicaAttestation(metricsBody: string): {
  fingerprint: string;
  state: DiV0S4RuntimeAttestationState;
  ok: boolean;
} {
  const parsed = parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(metricsBody);
  const ok = parsed.state === 'OTHER';
  return { fingerprint: parsed.fingerprint, state: parsed.state, ok };
}

/** Discovery/worker remain disabled while GLOBAL kill row is KILLED even if env flags are ON. */
export function assertDiscoveryWorkerInertWhileKilled(
  env: Readonly<Record<string, string | undefined>>,
): { discoveryEnabled: boolean; workerEnabled: boolean; maintenanceEnabled: boolean } {
  const cfg = parseDiV0S4ControlPlaneConfig(env);
  const kill = evaluateDiV0S4KillRow({ kind: 'ROW', killState: 'KILLED' });
  const scope = {
    organizationId: CANONICAL_TINY_ORGANIZATION_ID,
    vehicleId: CANONICAL_TINY_VEHICLE_ID,
    vehicleOrganizationId: CANONICAL_TINY_ORGANIZATION_ID,
  };
  const discovery = evaluateDiV0S4Enablement(cfg, 'DISCOVERY', scope, kill);
  const worker = evaluateDiV0S4Enablement(cfg, 'WORKER', scope, kill);
  const maintenance = evaluateDiV0S4MaintenanceEnablement(cfg, kill);
  return {
    discoveryEnabled: discovery.enabled,
    workerEnabled: worker.enabled,
    maintenanceEnabled: maintenance.enabled,
  };
}

export function countEnvKeyOccurrencesExport(content: string, key: string): number {
  return countEnvKeyOccurrences(content, key);
}
