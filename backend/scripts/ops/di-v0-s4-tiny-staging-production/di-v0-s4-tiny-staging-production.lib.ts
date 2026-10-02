import { createHash } from 'crypto';
import {
  DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV,
  parseDiV0S4DiscoveryTripEndNotBefore,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4b-orchestration/di-v0-s4b-discovery-containment';
import {
  DI_V0_S4_ENV_ALLOWLISTS,
  DI_V0_S4_ENV_FLAGS,
  parseDiV0S4Allowlist,
  parseDiV0S4ControlPlaneConfig,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { assertDiV0S4OpsControlFlagsSafe } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-ops-s4-control-preflight';
import {
  classifyGlobalControlPrestate,
  parseGlobalRowDbLines,
  parseS4PersistenceDbLines,
  type S4PersistenceCounts,
} from '../di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production.lib';
import {
  envMapFromFileContent,
  parseEnvFile,
  sha256Hex,
} from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';

export const DI_S4_TINY_STAGING_ACK_ENV = 'DI_S4_TINY_STAGING_ACK';
export const DI_S4_TINY_STAGING_ACCEPTED_ACK = 'YES';

export const DI_S4_TINY_STAGING_REQUIRED_SHA_ENV = 'DI_S4_TINY_STAGING_REQUIRED_SHA';
export const DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID_ENV = 'DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID';
export const DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256_ENV = 'DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256';
export const DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE_ENV = 'DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE';

/** Frozen S4F-7I authority — no operator override. */
export const FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE = '2026-10-02T05:55:28.839Z';
export const FROZEN_ORGANIZATION_ALLOWLIST = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const FROZEN_VEHICLE_ALLOWLIST = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

export const SUPPORTED_ENV_MUTATION_KEY_COUNT = 3;
export const TINY_STAGING_TARGET_KEYS = [
  DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV,
  DI_V0_S4_ENV_ALLOWLISTS.organization,
  DI_V0_S4_ENV_ALLOWLISTS.vehicle,
] as const;

export const S4_ENABLE_FLAG_KEYS = Object.values(DI_V0_S4_ENV_FLAGS);

export const FROZEN_STAGING_VALUES: Readonly<Record<string, string>> = {
  [DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV]: FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE,
  [DI_V0_S4_ENV_ALLOWLISTS.organization]: FROZEN_ORGANIZATION_ALLOWLIST,
  [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: FROZEN_VEHICLE_ALLOWLIST,
};

export const RUNTIME_PROOF_KEYS = [...S4_ENABLE_FLAG_KEYS, ...TINY_STAGING_TARGET_KEYS] as const;

export type TinyStagingGuardFailure =
  | 'ACK_INVALID'
  | 'SHA_MISMATCH'
  | 'RELEASE_MISMATCH'
  | 'ENV_HASH_MISMATCH'
  | 'GLOBAL_STATE_PIN_INVALID'
  | 'GLOBAL_PRESTATE_READ_FAILED'
  | 'GLOBAL_NOT_KILLED'
  | 'GLOBAL_MALFORMED'
  | 'S4_PERSISTENCE_READ_FAILED'
  | 'S4_FLAGS_UNSAFE'
  | 'S4_PERSISTENCE_NONZERO'
  | 'NOT_BEFORE_INVALID'
  | 'ALLOWLIST_INVALID'
  | 'VEHICLE_DB_PROOF_FAILED'
  | 'TOPOLOGY_UNSAFE'
  | 'BUDGET_CONFIG_UNSAFE'
  | 'BUDGET_RUNTIME_UNVERIFIED'
  | 'REDIS_UNREACHABLE';

export interface TinyStagingGuardInput {
  operatorAck: string | undefined;
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
  dryRun: boolean;
}

export interface TinyStagingGuardResult {
  ok: boolean;
  failures: TinyStagingGuardFailure[];
}

export function sha256FileContent(content: string): string {
  return sha256Hex(content);
}

export function countEnvKeyOccurrences(content: string, key: string): number {
  let count = 0;
  for (const line of content.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    if (line.slice(0, idx) === key) count += 1;
  }
  return count;
}

export function assertTargetKeyCardinality(content: string): { ok: true } | { ok: false; duplicateKey: string } {
  for (const key of TINY_STAGING_TARGET_KEYS) {
    const n = countEnvKeyOccurrences(content, key);
    if (n > 1) return { ok: false, duplicateKey: key };
  }
  return { ok: true };
}

export function validateFrozenNotBefore(): {
  ok: boolean;
  canonicalValid: boolean;
  timezone: 'UTC_Z' | 'INVALID';
} {
  const state = parseDiV0S4DiscoveryTripEndNotBefore(FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE, new Date('2026-10-02T12:00:00.000Z'));
  if (state.kind !== 'AVAILABLE') {
    return { ok: false, canonicalValid: false, timezone: 'INVALID' };
  }
  const canonical = FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE;
  if (canonical !== FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE) {
    return { ok: false, canonicalValid: false, timezone: 'INVALID' };
  }
  return { ok: true, canonicalValid: true, timezone: 'UTC_Z' };
}

export function validateFrozenAllowlists(): {
  ok: boolean;
  orgParseCount: number;
  vehicleParseCount: number;
  wildcardPresent: boolean;
  malformedPresent: boolean;
} {
  const org = parseDiV0S4Allowlist(FROZEN_ORGANIZATION_ALLOWLIST);
  const veh = parseDiV0S4Allowlist(FROZEN_VEHICLE_ALLOWLIST);
  const orgParseCount = org.size;
  const vehicleParseCount = veh.size;
  const wildcardPresent =
    FROZEN_ORGANIZATION_ALLOWLIST.includes('*') || FROZEN_VEHICLE_ALLOWLIST.includes('*');
  const malformedPresent = orgParseCount === 0 || vehicleParseCount === 0;
  const ok =
    orgParseCount === 1 &&
    vehicleParseCount === 1 &&
    org.has(FROZEN_ORGANIZATION_ALLOWLIST) &&
    veh.has(FROZEN_VEHICLE_ALLOWLIST) &&
    !wildcardPresent &&
    !malformedPresent;
  return { ok, orgParseCount, vehicleParseCount, wildcardPresent, malformedPresent };
}

export function assertNotBeforeValueIsFrozenOnly(candidate: string): boolean {
  return candidate === FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE;
}

export function serializeTinyStagingEnvFile(map: Map<string, string>, originalLines: string[]): string {
  const keysWritten = new Set<string>();
  const out: string[] = [];
  for (const line of originalLines) {
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
    if ((TINY_STAGING_TARGET_KEYS as readonly string[]).includes(key)) {
      if (!keysWritten.has(key)) {
        out.push(`${key}=${FROZEN_STAGING_VALUES[key]}`);
        keysWritten.add(key);
      }
      continue;
    }
    if ((S4_ENABLE_FLAG_KEYS as readonly string[]).includes(key)) {
      out.push(line);
      keysWritten.add(key);
      continue;
    }
    out.push(line);
    keysWritten.add(key);
  }
  for (const key of TINY_STAGING_TARGET_KEYS) {
    if (!keysWritten.has(key)) {
      out.push(`${key}=${FROZEN_STAGING_VALUES[key]}`);
      keysWritten.add(key);
    }
  }
  return out.join('\n').replace(/\n*$/, '\n');
}

export function applyTinyStagingMutation(originalContent: string): {
  nextContent: string;
  mutated: boolean;
  targetKeyCountAfter: number;
} {
  const cardinality = assertTargetKeyOccurrencesPreMutation(originalContent);
  if (!cardinality.ok) {
    throw new Error(`duplicate_target_key:${cardinality.duplicateKey}`);
  }
  const lines = originalContent.split('\n');
  const before = parseEnvFile(originalContent);
  const nextContent = serializeTinyStagingEnvFile(before, lines);
  const afterCardinality = assertTargetKeyCardinality(nextContent);
  if (!afterCardinality.ok) {
    throw new Error(`post_mutation_duplicate:${afterCardinality.duplicateKey}`);
  }
  let targetKeyCountAfter = 0;
  for (const key of TINY_STAGING_TARGET_KEYS) {
    if (countEnvKeyOccurrences(nextContent, key) === 1) targetKeyCountAfter += 1;
  }
  const normalizedOriginal = originalContent.replace(/\n*$/, '\n');
  const mutated = nextContent !== normalizedOriginal;
  return { nextContent, mutated, targetKeyCountAfter };
}

function assertTargetKeyOccurrencesPreMutation(content: string): { ok: true } | { ok: false; duplicateKey: string } {
  return assertTargetKeyCardinality(content);
}

export function computeSemanticEnvDiff(
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
  const allowed = new Set(TINY_STAGING_TARGET_KEYS as readonly string[]);
  const unexpected = changedKeys.filter((k) => !allowed.has(k));
  const envChangedKeyCount = changedKeys.length;
  const ok =
    envChangedKeyCount <= SUPPORTED_ENV_MUTATION_KEY_COUNT &&
    unexpected.length === 0 &&
    changedKeys.every((k) => allowed.has(k));
  return {
    changedKeys,
    unexpectedChangedKeyCount: unexpected.length,
    envChangedKeyCount,
    ok,
  };
}

export function parseVehicleDbProofLines(lines: readonly string[]): {
  ok: boolean;
  vehicleExists: boolean;
  organizationId: string;
  registryLifecycle: string;
  hardwareType: string;
  providerLinkActive: boolean;
} {
  if (lines.length < 5) {
    return {
      ok: false,
      vehicleExists: false,
      organizationId: '',
      registryLifecycle: '',
      hardwareType: '',
      providerLinkActive: false,
    };
  }
  const found = lines[0].trim() === '1';
  const organizationId = lines[1].trim();
  const registryLifecycle = lines[2].trim();
  const hardwareType = lines[3].trim();
  const providerLinkActive = lines[4].trim() === '1' || lines[4].trim().toLowerCase() === 'true';
  const ok =
    found &&
    organizationId === FROZEN_ORGANIZATION_ALLOWLIST &&
    registryLifecycle === 'ACTIVE' &&
    hardwareType === 'LTE_R1' &&
    providerLinkActive;
  return {
    ok,
    vehicleExists: found,
    organizationId,
    registryLifecycle,
    hardwareType,
    providerLinkActive,
  };
}

export function evaluateTinyStagingGuards(input: TinyStagingGuardInput): TinyStagingGuardResult {
  const failures: TinyStagingGuardFailure[] = [];

  if (input.operatorAck !== DI_S4_TINY_STAGING_ACCEPTED_ACK) failures.push('ACK_INVALID');
  if (!input.requiredSha || !input.actualSha || input.requiredSha !== input.actualSha) {
    failures.push('SHA_MISMATCH');
  }
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
  if (input.expectedGlobalState !== 'KILLED') {
    failures.push('GLOBAL_STATE_PIN_INVALID');
  }

  const globalRead = parseGlobalRowDbLines(input.globalRowLines, false);
  if (!globalRead.ok) {
    failures.push('GLOBAL_PRESTATE_READ_FAILED');
  } else {
    const pre = classifyGlobalControlPrestate(globalRead.rowCount, [globalRead.killState ?? '']);
    if (pre === 'MALFORMED') failures.push('GLOBAL_MALFORMED');
    else if (pre !== 'KILLED') failures.push('GLOBAL_NOT_KILLED');
  }

  const s4Read = parseS4PersistenceDbLines(input.s4PersistenceLines);
  if (!s4Read.ok) {
    failures.push('S4_PERSISTENCE_READ_FAILED');
  } else {
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
    const envMap = envMapFromFileContent(input.envContent);
    const s4 = assertDiV0S4OpsControlFlagsSafe(envMap);
    if (!s4.ok) failures.push('S4_FLAGS_UNSAFE');
    const dup = assertTargetKeyCardinality(input.envContent);
    if (!dup.ok) failures.push('ALLOWLIST_INVALID');
  }

  if (!validateFrozenNotBefore().ok) failures.push('NOT_BEFORE_INVALID');
  if (!validateFrozenAllowlists().ok) failures.push('ALLOWLIST_INVALID');

  if (!parseVehicleDbProofLines(input.vehicleDbLines).ok) {
    failures.push('VEHICLE_DB_PROOF_FAILED');
  }

  if (!input.topologyOk) failures.push('TOPOLOGY_UNSAFE');
  if (!input.budgetConfigExplicitEnabled) failures.push('BUDGET_CONFIG_UNSAFE');
  if (!input.budgetRuntimeBothEnabled) failures.push('BUDGET_RUNTIME_UNVERIFIED');
  if (!input.redisReachable) failures.push('REDIS_UNREACHABLE');

  return { ok: failures.length === 0, failures };
}

export function parseProcEnvironForProof(
  raw: string,
  allowedKeys: readonly string[] = RUNTIME_PROOF_KEYS,
): Map<string, string> {
  const allowed = new Set(allowedKeys);
  const out = new Map<string, string>();
  const parts = raw.split('\0');
  for (const part of parts) {
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx);
    if (!allowed.has(key)) continue;
    out.set(key, part.slice(idx + 1));
  }
  return out;
}

export function proveReplicaStagingRuntime(envMap: Map<string, string>): {
  notBeforeExact: boolean;
  orgAllowlistExact: boolean;
  vehicleAllowlistExact: boolean;
  allS4EnableFlagsOff: boolean;
} {
  const cfg = parseDiV0S4ControlPlaneConfig(Object.fromEntries(envMap));
  const notBeforeExact = envMap.get(DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV) === FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE;
  const orgAllowlistExact = envMap.get(DI_V0_S4_ENV_ALLOWLISTS.organization) === FROZEN_ORGANIZATION_ALLOWLIST;
  const vehicleAllowlistExact = envMap.get(DI_V0_S4_ENV_ALLOWLISTS.vehicle) === FROZEN_VEHICLE_ALLOWLIST;
  const allS4EnableFlagsOff =
    !cfg.masterEnabled &&
    !cfg.discoveryEnabled &&
    !cfg.workerEnabled &&
    !cfg.positionEnabled &&
    !cfg.r1Enabled &&
    !cfg.nativeEnabled;
  return { notBeforeExact, orgAllowlistExact, vehicleAllowlistExact, allS4EnableFlagsOff };
}

export function persistenceDeltaZero(before: S4PersistenceCounts, after: S4PersistenceCounts): boolean {
  return (
    before.pipelineRegistry === after.pipelineRegistry &&
    before.workItems === after.workItems &&
    before.activeWorkItems === after.activeWorkItems &&
    before.evidenceSnapshots === after.evidenceSnapshots &&
    before.shadowRuns === after.shadowRuns &&
    before.shadowIntervals === after.shadowIntervals
  );
}

export function assertToolShaPin(checkoutSha: string, requiredToolSha: string): boolean {
  return checkoutSha === requiredToolSha && /^[0-9a-f]{40}$/.test(requiredToolSha);
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
