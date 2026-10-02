#!/usr/bin/env ts-node
/**
 * CLI for S4F-7J Tiny config staging (exactly three frozen env keys; no S4 enable flags; no GLOBAL DB writes).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  applyTinyStagingMutation,
  assertTargetKeyCardinality,
  computeSemanticEnvDiff,
  evaluateTinyStagingGuards,
  FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE,
  FROZEN_ORGANIZATION_ALLOWLIST,
  FROZEN_STAGING_VALUES,
  FROZEN_VEHICLE_ALLOWLIST,
  parseProcEnvironForProof,
  parseVehicleDbProofLines,
  classifyPreMutationTargetKeyStates,
  proveReplicaRuntime,
  R1_PROVIDER_LINK_DB_AUTHORITY,
  RUNTIME_PROOF_KEYS,
  sha256FileContent,
  SUPPORTED_ENV_MUTATION_KEY_COUNT,
  TINY_STAGING_TARGET_KEYS,
  validateFrozenAllowlists,
  validateFrozenNotBefore,
  assertPreMutationTargetKeysAllMissing,
  type TinyStagingGuardInput,
  type TinyStagingRuntimeProofMode,
} from './di-v0-s4-tiny-staging-production.lib';
import { assertDiV0S4OpsControlFlagsSafe } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-ops-s4-control-preflight';
import {
  classifyConfigFileFromEnvContent,
  envMapFromFileContent,
} from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import { parseGlobalRowDbLines, parseS4PersistenceDbLines } from '../di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production.lib';

function readFile(pathname: string): string {
  return fs.readFileSync(pathname, 'utf8');
}

function atomicWriteFilePreserveOwnership(target: string, content: string): void {
  const st = fs.statSync(target);
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.s4f7j.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: st.mode });
  try {
    if (typeof st.uid === 'number' && typeof st.gid === 'number') {
      fs.chownSync(tmp, st.uid, st.gid);
    }
  } catch {
    console.log('BACKEND_ENV_UID_PRESERVED=NO');
    fs.unlinkSync(tmp);
    process.exit(1);
  }
  fs.renameSync(tmp, target);
  console.log('ATOMIC_ENV_PROMOTION=YES');
}

function cmdFrozenAuthority(): void {
  const nb = validateFrozenNotBefore();
  const al = validateFrozenAllowlists();
  console.log(`SUPPORTED_ENV_MUTATION_KEY_COUNT=${SUPPORTED_ENV_MUTATION_KEY_COUNT}`);
  console.log('ARBITRARY_ENV_MUTATION_SUPPORTED=NO');
  console.log('S4_ENABLE_FLAG_MUTATION_SUPPORTED=NO');
  console.log('GLOBAL_DB_MUTATION_SUPPORTED=NO');
  console.log(`FROZEN_NOT_BEFORE=${FROZEN_DISCOVERY_TRIP_END_NOT_BEFORE}`);
  console.log(`FROZEN_ORG_ALLOWLIST=${FROZEN_ORGANIZATION_ALLOWLIST}`);
  console.log(`FROZEN_VEHICLE_ALLOWLIST=${FROZEN_VEHICLE_ALLOWLIST}`);
  console.log(`NOT_BEFORE_CANONICAL_VALID=${nb.canonicalValid ? 'YES' : 'NO'}`);
  console.log(`NOT_BEFORE_TIMEZONE=${nb.timezone}`);
  console.log('NOT_BEFORE_COMPARISON_AUTHORITY=vehicle_trips.end_time >= cutoff');
  console.log(`ORG_ALLOWLIST_PARSE_COUNT=${al.orgParseCount}`);
  console.log(`VEHICLE_ALLOWLIST_PARSE_COUNT=${al.vehicleParseCount}`);
  console.log(`WILDCARD_PRESENT=${al.wildcardPresent ? 'YES' : 'NO'}`);
  console.log(`MALFORMED_ALLOWLIST_ENTRY_PRESENT=${al.malformedPresent ? 'YES' : 'NO'}`);
  if (!nb.ok || !al.ok) process.exit(1);
}

function cmdS4Safe(file: string): void {
  const content = readFile(file);
  const env = envMapFromFileContent(content);
  const { ok, unsafeKeys } = assertDiV0S4OpsControlFlagsSafe(env);
  if (!ok) {
    console.log(`S4_FLAGS_PRE_STATE_SAFE=NO unsafe=${unsafeKeys.join(',')}`);
    process.exit(1);
  }
  console.log('S4_FLAGS_PRE_STATE_SAFE=YES');
  console.log('MASTER=OFF');
  console.log('DISCOVERY=OFF');
  console.log('WORKER=OFF');
  console.log('POSITION=OFF');
  console.log('R1=OFF');
  console.log('NATIVE=OFF');
}

function cmdValidateGlobalPrestate(lines: string[]): void {
  const parsed = parseGlobalRowDbLines(lines, false);
  if (!parsed.ok) {
    console.log('GLOBAL_PRESTATE_READ_FAILED=YES');
    process.exit(1);
  }
  console.log(`GLOBAL_ROW_COUNT=${parsed.rowCount}`);
  console.log(`GLOBAL_ROW_ID=GLOBAL`);
  console.log(`GLOBAL_KILL_STATE=${parsed.killState ?? 'MISSING'}`);
  if (parsed.rowCount !== 1 || parsed.killState !== 'KILLED') {
    console.log('GLOBAL_KILLED_REQUIRED=NO');
    process.exit(1);
  }
  console.log('GLOBAL_KILLED_REQUIRED=YES');
}

function cmdValidateS4Persistence(lines: string[]): void {
  const parsed = parseS4PersistenceDbLines(lines);
  if (!parsed.ok) {
    console.log('S4_PERSISTENCE_READ_FAILED=YES');
    process.exit(1);
  }
  const c = parsed.counts;
  console.log(`S4_PIPELINE_REGISTRY_ROWS=${c.pipelineRegistry}`);
  console.log(`S4_WORK_ITEM_ROWS=${c.workItems}`);
  console.log(`S4_ACTIVE_WORK_ITEM_ROWS=${c.activeWorkItems}`);
  console.log(`S4_EVIDENCE_SNAPSHOT_ROWS=${c.evidenceSnapshots}`);
  console.log(`S4_SHADOW_RUN_ROWS=${c.shadowRuns}`);
  console.log(`S4_SHADOW_INTERVAL_ROWS=${c.shadowIntervals}`);
}

function cmdValidateVehicleDb(lines: string[]): void {
  const proof = parseVehicleDbProofLines(lines);
  console.log(`TINY_VEHICLE_EXISTS=${proof.vehicleExists ? 'YES' : 'NO'}`);
  console.log(`TINY_REGISTRY_LIFECYCLE=${proof.registryLifecycle || 'UNKNOWN'}`);
  console.log(`TINY_HARDWARE_TYPE=${proof.hardwareType || 'UNKNOWN'}`);
  console.log(`TINY_DIMO_PROVIDER_CONSENT_ACTIVE=${proof.dimoProviderConsentActive ? 'YES' : 'NO'}`);
  console.log(`TINY_DIMO_VEHICLE_LINKED=${proof.dimoVehicleLinked ? 'YES' : 'NO'}`);
  console.log(`R1_PROVIDER_LINK_DB_AUTHORITY=${R1_PROVIDER_LINK_DB_AUTHORITY}`);
  console.log(`TINY_VEHICLE_BELONGS_TO_ORG=${proof.organizationId === FROZEN_ORGANIZATION_ALLOWLIST ? 'YES' : 'NO'}`);
  if (!proof.ok) {
    console.log('VEHICLE_DB_PROOF=FAIL');
    process.exit(1);
  }
  console.log('VEHICLE_DB_PROOF=PASS');
}

function cmdGuards(): void {
  const input: TinyStagingGuardInput = {
    operatorAck: process.env.DI_S4_TINY_STAGING_ACK,
    requiredSha: process.env.DI_S4_TINY_STAGING_REQUIRED_SHA,
    actualSha: process.env.DI_S4_TINY_STAGING_ACTUAL_SHA,
    requiredReleaseId: process.env.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID,
    actualReleaseId: process.env.DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID,
    requiredEnvSha256: process.env.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256,
    actualEnvSha256: process.env.DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256,
    expectedGlobalState: process.env.DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE,
    globalRowLines: (process.env.DI_S4F7J_GLOBAL_ROW_LINES ?? '').split('\n').filter((l) => l.length > 0),
    s4PersistenceLines: (process.env.DI_S4F7J_S4_PERSISTENCE_LINES ?? '').split('\n').filter((l) => l.length > 0),
    envContent: process.env.DI_S4F7J_ENV_CONTENT ?? '',
    envReadable: process.env.DI_S4F7J_ENV_READABLE === 'YES',
    vehicleDbLines: (process.env.DI_S4F7J_VEHICLE_DB_LINES ?? '').split('\n').filter((l) => l.length > 0),
    preNotBeforeState: (process.env.PRE_NOT_BEFORE_STATE ?? 'MISSING') as TinyStagingGuardInput['preNotBeforeState'],
    preOrgAllowlistState: (process.env.PRE_ORG_ALLOWLIST_STATE ?? 'MISSING') as TinyStagingGuardInput['preOrgAllowlistState'],
    preVehicleAllowlistState: (process.env.PRE_VEHICLE_ALLOWLIST_STATE ?? 'MISSING') as TinyStagingGuardInput['preVehicleAllowlistState'],
    topologyOk: process.env.DI_S4F7J_TOPOLOGY_OK === 'YES',
    budgetConfigExplicitEnabled: process.env.DI_S4F7J_BUDGET_CONFIG_EXPLICIT_ENABLED === 'YES',
    budgetRuntimeBothEnabled: process.env.DI_S4F7J_BUDGET_RUNTIME_BOTH_ENABLED === 'YES',
    redisReachable: process.env.DI_S4F7J_REDIS_REACHABLE === 'YES',
    dryRun: process.env.DRY_RUN === '1',
  };
  const result = evaluateTinyStagingGuards(input);
  console.log(`GUARDS_OK=${result.ok ? 'YES' : 'NO'}`);
  if (result.failures.length > 0) {
    console.log(`GUARD_FAILURES=${result.failures.join(',')}`);
    process.exit(1);
  }
}

function cmdValidatePrestateKeys(file: string): void {
  const content = readFile(file);
  const states = classifyPreMutationTargetKeyStates(content);
  console.log(`PRE_NOT_BEFORE_STATE=${states.notBefore}`);
  console.log(`PRE_ORG_ALLOWLIST_STATE=${states.organization}`);
  console.log(`PRE_VEHICLE_ALLOWLIST_STATE=${states.vehicle}`);
  const pre = assertPreMutationTargetKeysAllMissing(content);
  if (!pre.ok) {
    console.log(`TARGET_KEY_PRESTATE_INVALID=YES key=${pre.key} state=${pre.state}`);
    process.exit(1);
  }
  console.log('TARGET_KEY_PRESTATE_VALID=YES');
}

function cmdBudgetConfigState(file: string): void {
  const content = readFile(file);
  const state = classifyConfigFileFromEnvContent(content, true);
  console.log(`DIMO_GLOBAL_BUDGET_CONFIG_STATE=${state}`);
  if (state !== 'EXPLICIT_ENABLED') {
    process.exit(1);
  }
}

function cmdMutate(file: string): void {
  const before = readFile(file);
  const cardinality = assertTargetKeyCardinality(before);
  if (!cardinality.ok) {
    console.log(`TARGET_ENV_DUPLICATE_FAILS_CLOSED=YES key=${cardinality.duplicateKey}`);
    process.exit(1);
  }
  const prestate = assertPreMutationTargetKeysAllMissing(before);
  if (!prestate.ok) {
    console.log(`TARGET_KEY_PRESTATE_INVALID=YES key=${prestate.key} state=${prestate.state}`);
    process.exit(1);
  }
  const beforeSha = sha256FileContent(before);
  console.log(`BACKEND_ENV_SHA256_BEFORE=${beforeSha}`);
  let nextContent: string;
  try {
    const result = applyTinyStagingMutation(before);
    nextContent = result.nextContent;
    console.log(`TARGET_KEY_COUNT_AFTER=${result.targetKeyCountAfter}`);
  } catch (e) {
    console.log(`MUTATION_VALIDATION=FAIL reason=${String(e)}`);
    process.exit(1);
  }
  const diff = computeSemanticEnvDiff(before, nextContent);
  console.log(`ENV_CHANGED_KEY_COUNT=${diff.envChangedKeyCount}`);
  console.log(`ENV_CHANGED_KEYS=${diff.changedKeys.join(',')}`);
  console.log(`UNEXPECTED_ENV_CHANGED_KEY_COUNT=${diff.unexpectedChangedKeyCount}`);
  if (!diff.ok || diff.envChangedKeyCount !== SUPPORTED_ENV_MUTATION_KEY_COUNT) {
    console.log('SEMANTIC_DIFF_AUTHORITY=FAIL');
    process.exit(1);
  }
  console.log('SEMANTIC_DIFF_AUTHORITY=PASS');
  console.log('EXACT_THREE_KEY_DIFF_REQUIRED=YES');
  console.log('UNRELATED_ENV_PRESERVED=YES');
  atomicWriteFilePreserveOwnership(file, nextContent);
  const afterOnDisk = readFile(file);
  const postDiff = computeSemanticEnvDiff(before, afterOnDisk);
  console.log(`POST_WRITE_ENV_CHANGED_KEY_COUNT=${postDiff.envChangedKeyCount}`);
  if (!postDiff.ok || postDiff.envChangedKeyCount !== SUPPORTED_ENV_MUTATION_KEY_COUNT) {
    console.log('POST_WRITE_SEMANTIC_DIFF_INDEPENDENTLY_VERIFIED=NO');
    process.exit(1);
  }
  console.log('POST_WRITE_SEMANTIC_DIFF_INDEPENDENTLY_VERIFIED=YES');
  const afterSha = sha256FileContent(afterOnDisk);
  console.log(`BACKEND_ENV_SHA256_AFTER=${afterSha}`);
  console.log('MUTATION_VALIDATION=PASS');
}

function cmdSemanticDiff(beforePath: string, afterPath: string): void {
  const before = readFile(beforePath);
  const after = readFile(afterPath);
  const diff = computeSemanticEnvDiff(before, after);
  console.log(`ENV_CHANGED_KEY_COUNT=${diff.envChangedKeyCount}`);
  console.log(`ENV_CHANGED_KEYS=${diff.changedKeys.join(',')}`);
  console.log(`UNEXPECTED_ENV_CHANGED_KEY_COUNT=${diff.unexpectedChangedKeyCount}`);
  if (!diff.ok) process.exit(1);
}

function cmdProcEnvironProof(label: string, environPath: string, modeArg?: string): void {
  const mode: TinyStagingRuntimeProofMode =
    modeArg === 'RECOVERY_PRESTATE' ? 'RECOVERY_PRESTATE' : 'PRIMARY_STAGING';
  let raw: string;
  try {
    raw = readFile(environPath);
  } catch {
    console.log(`REPLICA_${label}_RUNTIME_PROOF=FAIL`);
    process.exit(1);
  }
  const map = parseProcEnvironForProof(raw, RUNTIME_PROOF_KEYS);
  const proof = proveReplicaRuntime(map, mode);
  console.log(`RUNTIME_PROOF_MODE=${mode}`);
  console.log(`RECOVERY_EXPECTS_STAGED_VALUES=${mode === 'RECOVERY_PRESTATE' ? 'NO' : 'YES'}`);
  console.log(`RECOVERY_EXPECTS_EXACT_PRESTATE=${mode === 'RECOVERY_PRESTATE' ? 'YES' : 'NO'}`);
  if (mode === 'PRIMARY_STAGING') {
    console.log(`REPLICA_${label}_RUNTIME_NOT_BEFORE_EXACT=${proof.notBeforeExact ? 'YES' : 'NO'}`);
    console.log(`REPLICA_${label}_RUNTIME_ORG_ALLOWLIST_EXACT=${proof.orgAllowlistExact ? 'YES' : 'NO'}`);
    console.log(`REPLICA_${label}_RUNTIME_VEHICLE_ALLOWLIST_EXACT=${proof.vehicleAllowlistExact ? 'YES' : 'NO'}`);
  } else {
    console.log(`REPLICA_${label}_RUNTIME_STAGING_KEYS_ABSENT=${proof.stagingKeysAbsent ? 'YES' : 'NO'}`);
  }
  console.log(`REPLICA_${label}_ALL_S4_ENABLE_FLAGS_OFF=${proof.allS4EnableFlagsOff ? 'YES' : 'NO'}`);
  console.log('RUNTIME_PROOF_EXPOSES_FULL_ENV=NO');
  console.log('FULL_PROCESS_ENV_LOGGED=NO');
  const keysListed = [...map.keys()].sort().join(',');
  console.log(`RUNTIME_PROOF_KEY_ALLOWLIST_ONLY=${keysListed}`);
  if (!proof.ok) {
    process.exit(1);
  }
}

function cmdPrintFrozenValues(): void {
  for (const key of TINY_STAGING_TARGET_KEYS) {
    console.log(`${key}=${FROZEN_STAGING_VALUES[key]}`);
  }
}

function main(): void {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'frozen-authority':
      cmdFrozenAuthority();
      break;
    case 's4-safe':
      cmdS4Safe(args[0]);
      break;
    case 'validate-global-prestate':
      cmdValidateGlobalPrestate(args);
      break;
    case 'validate-s4-persistence':
      cmdValidateS4Persistence(args);
      break;
    case 'validate-vehicle-db':
      cmdValidateVehicleDb(args);
      break;
    case 'validate-prestate-keys':
      cmdValidatePrestateKeys(args[0]);
      break;
    case 'budget-config-state':
      cmdBudgetConfigState(args[0]);
      break;
    case 'guards':
      cmdGuards();
      break;
    case 'mutate':
      cmdMutate(args[0]);
      break;
    case 'semantic-diff':
      cmdSemanticDiff(args[0], args[1]);
      break;
    case 'proc-environ-proof':
      cmdProcEnvironProof(args[0], args[1], args[2]);
      break;
    case 'print-frozen':
      cmdPrintFrozenValues();
      break;
    default:
      console.error(`unknown command: ${cmd ?? ''}`);
      process.exit(1);
  }
}

main();
