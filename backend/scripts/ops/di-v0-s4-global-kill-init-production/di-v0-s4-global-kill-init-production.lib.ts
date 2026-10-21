import * as path from 'path';
import {
  classifyGlobalBudgetConfigFileStateFromRaw,
  type DiV0S4fGlobalBudgetConfigFileState,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-global-budget-evidence-semantics';
import { assertDiV0S4OpsControlFlagsSafe } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-ops-s4-control-preflight';
import { parseDiV0S4ControlPlaneConfig } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  classifyLiveGlobalBudgetMetricFromPrometheusBody,
  envMapFromFileContent,
  parseEnvFile,
  sha256Hex,
} from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';

export const DI_S4_KILL_INIT_ACK_ENV = 'DI_S4_KILL_INIT_ACK';
export const DI_S4_KILL_INIT_ACCEPTED_ACK = 'YES';

export const DI_S4_KILL_INIT_REQUIRED_SHA_ENV = 'DI_S4_KILL_INIT_REQUIRED_SHA';
export const DI_S4_KILL_INIT_REQUIRED_RELEASE_ID_ENV = 'DI_S4_KILL_INIT_REQUIRED_RELEASE_ID';
export const DI_S4_KILL_INIT_REQUIRED_ENV_SHA256_ENV = 'DI_S4_KILL_INIT_REQUIRED_ENV_SHA256';
export const DI_S4_KILL_INIT_EXPECTED_PRESTATE_ENV = 'DI_S4_KILL_INIT_EXPECTED_PRESTATE';

export const DI_S4_NOT_BEFORE_ENV = 'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE';

export const DEPLOYED_INITIALIZER_REL = 'backend/scripts/ops/di-v0-s4-initialize-global-kill-row.ts';
export const DEPLOYED_KILL_IMPLEMENTATION_REL =
  'backend/src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-control-kill-initializer.ts';

export const DEPLOYED_KILL_FILE_RELS = [DEPLOYED_INITIALIZER_REL, DEPLOYED_KILL_IMPLEMENTATION_REL] as const;

export type GlobalControlPrestate = 'MISSING' | 'KILLED' | 'NOT_KILLED' | 'MALFORMED';

export type ExpectedGlobalPrestate = 'MISSING' | 'KILLED';

export interface S4PersistenceCounts {
  pipelineRegistry: number;
  workItems: number;
  activeWorkItems: number;
  evidenceSnapshots: number;
  shadowRuns: number;
  shadowIntervals: number;
}

export interface TopologySnapshot {
  replicaAHealthOk: boolean;
  replicaBHealthOk: boolean;
  replicaAProcessReleaseIdentityOk: boolean;
  replicaBProcessReleaseIdentityOk: boolean;
  steadyStateNoMixedReleaseIdentity: boolean;
  schedulerSingleLeader: boolean;
  nginxDualUpstream: boolean;
}

export interface BudgetSnapshot {
  configFileState: DiV0S4fGlobalBudgetConfigFileState;
  replicaARuntime: 'ENABLED' | 'DISABLED' | 'UNKNOWN';
  replicaBRuntime: 'ENABLED' | 'DISABLED' | 'UNKNOWN';
  redisReachable: boolean;
}

export interface KillInitGuardInput {
  operatorAck: string | undefined;
  requiredSha: string | undefined;
  actualSha: string | undefined;
  requiredReleaseId: string | undefined;
  actualReleaseId: string | undefined;
  requiredEnvSha256: string | undefined;
  actualEnvSha256: string | undefined;
  expectedPrestate: string | undefined;
  actualGlobalPrestate: GlobalControlPrestate;
  actor: string | undefined;
  reason: string | undefined;
  envContent: string;
  envReadable: boolean;
  topology: TopologySnapshot;
  budget: BudgetSnapshot;
  persistence: S4PersistenceCounts;
  expectedPersistence: S4PersistenceCounts;
  dryRun: boolean;
  verifiedReleaseDir: string;
  wrapperBackendRoot: string;
  deployedInitializerExists: boolean;
  deployedInitializerTracked: boolean;
  deployedInitializerWorktreeClean: boolean;
  deployedKillImplementationTracked: boolean;
  deployedKillImplementationWorktreeClean: boolean;
  initializerSubstitutionRisk: boolean;
  mainCheckoutDiffersFromProduction: boolean;
}

export type GuardFailureCode =
  | 'ACK_INVALID'
  | 'SHA_MISMATCH'
  | 'RELEASE_MISMATCH'
  | 'ENV_HASH_MISMATCH'
  | 'PRESTATE_UNSUPPORTED'
  | 'PRESTATE_MISMATCH'
  | 'GLOBAL_NOT_KILLED'
  | 'GLOBAL_MALFORMED'
  | 'ACTOR_INVALID'
  | 'REASON_INVALID'
  | 'TOPOLOGY_UNSAFE'
  | 'S4_FLAGS_UNSAFE'
  | 'ORG_ALLOWLIST_UNSAFE'
  | 'VEHICLE_ALLOWLIST_UNSAFE'
  | 'BUDGET_CONFIG_UNSAFE'
  | 'BUDGET_RUNTIME_UNVERIFIED'
  | 'REDIS_UNREACHABLE'
  | 'PERSISTENCE_PRESTATE_MISMATCH'
  | 'INITIALIZER_SCRIPT_MISSING'
  | 'INITIALIZER_SUBSTITUTION_RISK'
  | 'DEPLOYED_RELEASE_FILE_DIRTY'
  | 'GLOBAL_PRESTATE_READ_FAILED'
  | 'S4_PERSISTENCE_READ_FAILED';

export interface KillInitGuardResult {
  ok: boolean;
  failures: GuardFailureCode[];
  operatorAckValidated: boolean;
  deployedInitializerPath: string;
  deployedReleaseInitializerIsAuthority: boolean;
  mainCheckoutDiffersFromProduction: boolean;
  newerMainSubstitutionPossible: boolean;
  wrapperRequiresNewCodeDeployBeforeUse: boolean;
}

const NON_NEGATIVE_INT_RE = /^[0-9]+$/;

export function parseStrictNonNegativeIntegerLine(line: string | undefined): number | null {
  if (line == null) return null;
  const trimmed = line.trim();
  if (!NON_NEGATIVE_INT_RE.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

export type GlobalRowDbReadResult =
  | {
      ok: true;
      rowCount: number;
      killState: string | null;
      reason: string | null;
      actor: string | null;
    }
  | { ok: false; code: 'GLOBAL_PRESTATE_READ_FAILED' };

export function parseGlobalRowDbLines(lines: readonly string[], includeMetadata: boolean): GlobalRowDbReadResult {
  if (lines.length < 1) return { ok: false, code: 'GLOBAL_PRESTATE_READ_FAILED' };
  const rowCount = parseStrictNonNegativeIntegerLine(lines[0]);
  if (rowCount == null) return { ok: false, code: 'GLOBAL_PRESTATE_READ_FAILED' };
  if (rowCount === 0) {
    if (lines.length > 1 && lines[1].trim() !== '') return { ok: false, code: 'GLOBAL_PRESTATE_READ_FAILED' };
    return { ok: true, rowCount: 0, killState: null, reason: null, actor: null };
  }
  if (rowCount !== 1) return { ok: false, code: 'GLOBAL_PRESTATE_READ_FAILED' };
  const killState = lines[1]?.trim() ?? '';
  if (killState !== 'KILLED' && killState !== 'NOT_KILLED') {
    return { ok: false, code: 'GLOBAL_PRESTATE_READ_FAILED' };
  }
  if (!includeMetadata) {
    return { ok: true, rowCount: 1, killState, reason: null, actor: null };
  }
  if (lines.length < 4) return { ok: false, code: 'GLOBAL_PRESTATE_READ_FAILED' };
  const reason = lines[2]?.trim() ?? '';
  const actor = lines[3]?.trim() ?? '';
  if (!reason || !actor) return { ok: false, code: 'GLOBAL_PRESTATE_READ_FAILED' };
  return { ok: true, rowCount: 1, killState, reason, actor };
}

export type S4PersistenceDbReadResult =
  | { ok: true; counts: S4PersistenceCounts }
  | { ok: false; code: 'S4_PERSISTENCE_READ_FAILED' };

export function parseS4PersistenceDbLines(lines: readonly string[]): S4PersistenceDbReadResult {
  if (lines.length !== 6) return { ok: false, code: 'S4_PERSISTENCE_READ_FAILED' };
  const values = lines.map((line) => parseStrictNonNegativeIntegerLine(line));
  if (values.some((v) => v == null)) return { ok: false, code: 'S4_PERSISTENCE_READ_FAILED' };
  const [a, b, c, d, e, f] = values as number[];
  return {
    ok: true,
    counts: {
      pipelineRegistry: a,
      workItems: b,
      activeWorkItems: c,
      evidenceSnapshots: d,
      shadowRuns: e,
      shadowIntervals: f,
    },
  };
}

export function sha256FileContent(content: string): string {
  return sha256Hex(content);
}

export function classifyGlobalControlPrestate(
  globalRowCount: number,
  killStates: readonly unknown[],
): GlobalControlPrestate {
  if (globalRowCount === 0) return 'MISSING';
  if (globalRowCount !== 1) return 'MALFORMED';
  const state = killStates[0];
  if (state === 'KILLED') return 'KILLED';
  if (state === 'NOT_KILLED') return 'NOT_KILLED';
  return 'MALFORMED';
}

export function parseExpectedGlobalPrestate(raw: string | undefined): ExpectedGlobalPrestate | null {
  if (raw === 'MISSING' || raw === 'KILLED') return raw;
  return null;
}

export function validateOperatorPin(
  value: string | undefined,
  maxLen = 512,
): { ok: true; normalized: string } | { ok: false; reason: string } {
  if (value == null || value.trim() === '') return { ok: false, reason: 'EMPTY' };
  if (value !== value.trim()) return { ok: false, reason: 'LEADING_OR_TRAILING_WHITESPACE' };
  if (/[\r\n\u0000-\u001f\u007f]/.test(value)) return { ok: false, reason: 'CONTROL_CHARACTERS' };
  if (value.length > maxLen) return { ok: false, reason: 'TOO_LONG' };
  return { ok: true, normalized: value };
}

export function classifyNotBeforeState(env: Readonly<Record<string, string | undefined>>): 'MISSING' | 'SET' {
  const raw = env[DI_S4_NOT_BEFORE_ENV];
  if (raw == null || raw.trim() === '') return 'MISSING';
  return 'SET';
}

export function assertAllowlistsEffectivelyNone(env: Readonly<Record<string, string | undefined>>): {
  orgNone: boolean;
  vehicleNone: boolean;
} {
  const cfg = parseDiV0S4ControlPlaneConfig(env);
  return {
    orgNone: cfg.organizationAllowlist.size === 0,
    vehicleNone: cfg.vehicleAllowlist.size === 0,
  };
}

export function classifyBudgetConfigFromEnvContent(
  content: string,
  readable: boolean,
): DiV0S4fGlobalBudgetConfigFileState {
  if (!readable) return 'UNREADABLE';
  const map = parseEnvFile(content);
  if (!map.has('DIMO_GLOBAL_BUDGET_ENABLED')) return 'MISSING';
  return classifyGlobalBudgetConfigFileStateFromRaw(map.get('DIMO_GLOBAL_BUDGET_ENABLED'), true);
}

export function assertGlobalBudgetRuntimeConfirmed(
  replicaA: 'ENABLED' | 'DISABLED' | 'UNKNOWN',
  replicaB: 'ENABLED' | 'DISABLED' | 'UNKNOWN',
): boolean {
  return replicaA === 'ENABLED' && replicaB === 'ENABLED';
}

export function parseExpectedPersistenceFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): S4PersistenceCounts {
  const num = (key: string): number => {
    const raw = env[key];
    if (raw == null || raw.trim() === '') return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : -1;
  };
  return {
    pipelineRegistry: num('DI_S4_KILL_INIT_EXPECTED_S4_PIPELINE_REGISTRY_ROWS'),
    workItems: num('DI_S4_KILL_INIT_EXPECTED_S4_WORK_ITEM_ROWS'),
    activeWorkItems: num('DI_S4_KILL_INIT_EXPECTED_S4_ACTIVE_WORK_ITEM_ROWS'),
    evidenceSnapshots: num('DI_S4_KILL_INIT_EXPECTED_S4_EVIDENCE_SNAPSHOT_ROWS'),
    shadowRuns: num('DI_S4_KILL_INIT_EXPECTED_S4_SHADOW_RUN_ROWS'),
    shadowIntervals: num('DI_S4_KILL_INIT_EXPECTED_S4_SHADOW_INTERVAL_ROWS'),
  };
}

export function persistenceMatchesExpected(actual: S4PersistenceCounts, expected: S4PersistenceCounts): boolean {
  return (
    actual.pipelineRegistry === expected.pipelineRegistry &&
    actual.workItems === expected.workItems &&
    actual.activeWorkItems === expected.activeWorkItems &&
    actual.evidenceSnapshots === expected.evidenceSnapshots &&
    actual.shadowRuns === expected.shadowRuns &&
    actual.shadowIntervals === expected.shadowIntervals &&
    expected.pipelineRegistry >= 0 &&
    expected.workItems >= 0 &&
    expected.activeWorkItems >= 0 &&
    expected.evidenceSnapshots >= 0 &&
    expected.shadowRuns >= 0 &&
    expected.shadowIntervals >= 0
  );
}

export function resolveDeployedInitializerScript(verifiedReleaseDir: string): string {
  return path.join(verifiedReleaseDir, DEPLOYED_INITIALIZER_REL);
}

export function assertDeployedInitializerPathPinned(input: {
  verifiedReleaseDir: string;
  resolvedInitializerPath: string;
}): { ok: boolean; substitutionRisk: boolean; deployedInitializerPath: string } {
  const backendRoot = path.resolve(input.verifiedReleaseDir, 'backend');
  const expected = path.resolve(backendRoot, 'scripts/ops/di-v0-s4-initialize-global-kill-row.ts');
  const resolved = path.resolve(input.resolvedInitializerPath);
  const withinBackend =
    resolved === backendRoot || resolved.startsWith(`${backendRoot}${path.sep}`);
  if (!withinBackend || resolved !== expected) {
    return { ok: false, substitutionRisk: true, deployedInitializerPath: expected };
  }
  return { ok: true, substitutionRisk: false, deployedInitializerPath: expected };
}

export function evaluateInitializerExecutionAuthority(input: {
  verifiedReleaseDir: string;
  verifiedReleaseSha: string;
  wrapperBackendRoot: string;
  mainCheckoutSha?: string;
  resolvedInitializerPath: string;
}): {
  deployedInitializerPath: string;
  deployedReleaseInitializerIsAuthority: boolean;
  mainCheckoutDiffersFromProduction: boolean;
  newerMainSubstitutionPossible: boolean;
  substitutionRisk: boolean;
  wrapperRequiresNewCodeDeployBeforeUse: boolean;
} {
  const pin = assertDeployedInitializerPathPinned({
    verifiedReleaseDir: input.verifiedReleaseDir,
    resolvedInitializerPath: input.resolvedInitializerPath,
  });
  const mainCheckoutDiffersFromProduction =
    input.mainCheckoutSha != null &&
    input.mainCheckoutSha.trim() !== '' &&
    input.mainCheckoutSha !== input.verifiedReleaseSha;
  return {
    deployedInitializerPath: pin.deployedInitializerPath,
    deployedReleaseInitializerIsAuthority: pin.ok,
    mainCheckoutDiffersFromProduction,
    newerMainSubstitutionPossible: false,
    substitutionRisk: pin.substitutionRisk,
    wrapperRequiresNewCodeDeployBeforeUse: false,
  };
}

export function evaluateKillInitGuards(input: KillInitGuardInput): KillInitGuardResult {
  const failures: GuardFailureCode[] = [];
  const ackOk = input.operatorAck === DI_S4_KILL_INIT_ACCEPTED_ACK;

  if (!ackOk) failures.push('ACK_INVALID');

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

  const expectedPre = parseExpectedGlobalPrestate(input.expectedPrestate);
  if (!expectedPre) {
    failures.push('PRESTATE_UNSUPPORTED');
  } else if (input.actualGlobalPrestate === 'NOT_KILLED') {
    failures.push('GLOBAL_NOT_KILLED');
  } else if (input.actualGlobalPrestate === 'MALFORMED') {
    failures.push('GLOBAL_MALFORMED');
  } else if (expectedPre !== input.actualGlobalPrestate) {
    failures.push('PRESTATE_MISMATCH');
  }

  const actorPin = validateOperatorPin(input.actor);
  if (!actorPin.ok) failures.push('ACTOR_INVALID');
  const reasonPin = validateOperatorPin(input.reason);
  if (!reasonPin.ok) failures.push('REASON_INVALID');

  if (
    !input.topology.replicaAHealthOk ||
    !input.topology.replicaBHealthOk ||
    !input.topology.replicaAProcessReleaseIdentityOk ||
    !input.topology.replicaBProcessReleaseIdentityOk ||
    !input.topology.steadyStateNoMixedReleaseIdentity ||
    !input.topology.schedulerSingleLeader ||
    !input.topology.nginxDualUpstream
  ) {
    failures.push('TOPOLOGY_UNSAFE');
  }

  if (input.envReadable) {
    const envMap = envMapFromFileContent(input.envContent);
    const s4 = assertDiV0S4OpsControlFlagsSafe(envMap);
    if (!s4.ok) failures.push('S4_FLAGS_UNSAFE');
    const lists = assertAllowlistsEffectivelyNone(envMap);
    if (!lists.orgNone) failures.push('ORG_ALLOWLIST_UNSAFE');
    if (!lists.vehicleNone) failures.push('VEHICLE_ALLOWLIST_UNSAFE');
  } else {
    failures.push('S4_FLAGS_UNSAFE');
  }

  if (input.budget.configFileState !== 'EXPLICIT_ENABLED') {
    failures.push('BUDGET_CONFIG_UNSAFE');
  }
  if (!assertGlobalBudgetRuntimeConfirmed(input.budget.replicaARuntime, input.budget.replicaBRuntime)) {
    failures.push('BUDGET_RUNTIME_UNVERIFIED');
  }
  if (!input.budget.redisReachable) failures.push('REDIS_UNREACHABLE');

  if (!persistenceMatchesExpected(input.persistence, input.expectedPersistence)) {
    failures.push('PERSISTENCE_PRESTATE_MISMATCH');
  }

  if (
    !input.deployedInitializerTracked ||
    !input.deployedInitializerWorktreeClean ||
    !input.deployedKillImplementationTracked ||
    !input.deployedKillImplementationWorktreeClean
  ) {
    failures.push('DEPLOYED_RELEASE_FILE_DIRTY');
  }

  const authority = evaluateInitializerExecutionAuthority({
    verifiedReleaseDir: input.verifiedReleaseDir,
    verifiedReleaseSha: input.actualSha ?? '',
    wrapperBackendRoot: input.wrapperBackendRoot,
    mainCheckoutSha: process.env.DI_S4F7F_MAIN_CHECKOUT_SHA,
    resolvedInitializerPath: input.deployedInitializerExists
      ? resolveDeployedInitializerScript(input.verifiedReleaseDir)
      : path.join(input.verifiedReleaseDir, DEPLOYED_INITIALIZER_REL),
  });

  if (!input.deployedInitializerExists) {
    failures.push('INITIALIZER_SCRIPT_MISSING');
  }
  if (input.initializerSubstitutionRisk || authority.substitutionRisk) {
    failures.push('INITIALIZER_SUBSTITUTION_RISK');
  }

  return {
    ok: failures.length === 0,
    failures,
    operatorAckValidated: ackOk,
    deployedInitializerPath: authority.deployedInitializerPath,
    deployedReleaseInitializerIsAuthority: authority.deployedReleaseInitializerIsAuthority,
    mainCheckoutDiffersFromProduction: input.mainCheckoutDiffersFromProduction,
    newerMainSubstitutionPossible: false,
    wrapperRequiresNewCodeDeployBeforeUse: false,
  };
}

export function classifyLiveMetricBody(body: string): 'ENABLED' | 'DISABLED' | 'UNKNOWN' {
  return classifyLiveGlobalBudgetMetricFromPrometheusBody(body);
}

export function parseInitializerOutcome(stdout: string): string | null {
  const m = stdout.match(/DI_V0_S4_GLOBAL_KILL_INIT_RESULT=(\w+)/);
  return m ? m[1] : null;
}

export function assertPostWriteGlobalRow(input: {
  globalRowCount: number;
  killState: unknown;
  reason: string | null;
  actor: string | null;
  requestedReason: string;
  requestedActor: string;
  initOutcome: string;
}): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (input.globalRowCount !== 1) failures.push('GLOBAL_ROW_COUNT');
  if (input.killState !== 'KILLED') failures.push('GLOBAL_KILL_STATE');
  if (input.initOutcome === 'INSERTED_KILLED') {
    if (input.reason !== input.requestedReason) failures.push('REASON_MISMATCH');
    if (input.actor !== input.requestedActor) failures.push('ACTOR_MISMATCH');
  }
  if (input.initOutcome !== 'INSERTED_KILLED' && input.initOutcome !== 'ALREADY_KILLED') {
    failures.push('UNEXPECTED_INIT_OUTCOME');
  }
  return { ok: failures.length === 0, failures };
}
