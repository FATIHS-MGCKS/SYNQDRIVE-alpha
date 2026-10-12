#!/usr/bin/env ts-node
/**
 * EXP-021 S4F-7AO — five S4 enable flags ON (native OFF); preserves staged Tiny keys; GLOBAL KILLED only.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  applyFiveFlagMutation,
  assertDiscoveryWorkerInertWhileKilled,
  assertNativeRemainsOff,
  assertStagingKeysPresentAndPinned,
  computeFiveFlagSemanticDiff,
  deriveFiveFlagAttestationFingerprint,
  evaluateFiveFlagGuards,
  FIVE_FLAG_ON_KEYS,
  FIVE_FLAG_SUPPORTED_MUTATION_KEY_COUNT,
  FIVE_FLAG_TRUE_VALUE,
  NATIVE_FLAG_KEY,
  NATIVE_FALSE_VALUE,
  proveFiveFlagReplicaAttestation,
  type FiveFlagGuardInput,
} from './di-v0-s4-five-flag-tiny-activation-production.lib';
import { assertDiV0S4OpsControlFlagsSafe } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-ops-s4-control-preflight';
import {
  classifyConfigFileFromEnvContent,
  envMapFromFileContent,
} from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import { parseGlobalRowDbLines, parseS4PersistenceDbLines } from '../di-v0-s4-global-kill-init-production/di-v0-s4-global-kill-init-production.lib';
import { parseVehicleDbProofLines } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib';

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function atomicWriteFilePreserveOwnership(target: string, content: string): void {
  const st = fs.statSync(target);
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.s4f7ao.${Date.now()}.tmp`);
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

function buildGuardInputFromEnv(): FiveFlagGuardInput {
  return {
    operatorAck: process.env.DI_S4_FIVE_FLAG_TINY_ACTIVATION_ACK,
    fiveFlagAuthorized: process.env.DI_S4F7AO_FIVE_FLAG_AUTHORIZED,
    requiredSha: process.env.DI_S4_TINY_STAGING_REQUIRED_SHA,
    actualSha: process.env.DI_S4_TINY_STAGING_ACTUAL_SHA,
    requiredReleaseId: process.env.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID,
    actualReleaseId: process.env.DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID,
    requiredEnvSha256: process.env.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256,
    actualEnvSha256: process.env.DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256,
    expectedGlobalState: process.env.DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE,
    globalRowLines: (process.env.DI_S4F7AO_GLOBAL_ROW_LINES ?? '').split('\n').filter(Boolean),
    s4PersistenceLines: (process.env.DI_S4F7AO_S4_PERSISTENCE_LINES ?? '').split('\n').filter(Boolean),
    envContent: process.env.DI_S4F7AO_ENV_CONTENT ?? '',
    envReadable: process.env.DI_S4F7AO_ENV_READABLE === 'YES',
    vehicleDbLines: (process.env.DI_S4F7AO_VEHICLE_DB_LINES ?? '').split('\n').filter(Boolean),
    topologyOk: process.env.DI_S4F7AO_TOPOLOGY_OK === 'YES',
    budgetConfigExplicitEnabled: process.env.DI_S4F7AO_BUDGET_CONFIG_OK === 'YES',
    budgetRuntimeBothEnabled: process.env.DI_S4F7AO_BUDGET_RUNTIME_OK === 'YES',
    redisReachable: process.env.DI_S4F7AO_REDIS_OK === 'YES',
  };
}

function cmdGuards(): void {
  const r = evaluateFiveFlagGuards(buildGuardInputFromEnv());
  if (!r.ok) {
    console.log(`GUARD_FAILURES=${r.failures.join(',')}`);
    process.exit(1);
  }
  console.log('GUARDS_OK=YES');
  console.log('GLOBAL_KILL_ENFORCED=YES');
  console.log('STAGED_KEYS_PRESERVED_CONTRACT=YES');
}

function cmdS4Safe(file: string): void {
  const content = readFile(file);
  const { ok, unsafeKeys } = assertDiV0S4OpsControlFlagsSafe(envMapFromFileContent(content));
  if (!ok) {
    console.log(`S4_FLAGS_PRE_STATE_SAFE=NO unsafe=${unsafeKeys.join(',')}`);
    process.exit(1);
  }
  console.log('S4_FLAGS_PRE_STATE_SAFE=YES');
}

function cmdValidateStaged(file: string): void {
  const content = readFile(file);
  const r = assertStagingKeysPresentAndPinned(content);
  if (!r.ok) {
    console.log(`STAGED_KEYS_VALID=NO failures=${r.failures.join(',')}`);
    process.exit(1);
  }
  console.log('STAGED_KEYS_VALID=YES');
  console.log('TENANT_PIN_VALID=YES');
}

function cmdApplyMutationLive(target: string): void {
  const before = readFile(target);
  const { nextContent } = applyFiveFlagMutation(before);
  atomicWriteFilePreserveOwnership(target, nextContent);
  console.log('FIVE_FLAG_LIVE_MUTATION=YES');
  console.log(`LIVE_MUTATION_EXACT_CHANGED_KEY_COUNT=${FIVE_FLAG_SUPPORTED_MUTATION_KEY_COUNT}`);
}

function cmdApplyMutationDry(copyPath: string): void {
  const before = readFile(copyPath);
  const { nextContent } = applyFiveFlagMutation(before);
  fs.writeFileSync(copyPath, nextContent, 'utf8');
  console.log('DRY_RUN_MUTATION_SIMULATION=YES');
}

function cmdIntendedDelta(file: string): void {
  const before = readFile(file);
  const { nextContent } = applyFiveFlagMutation(before);
  const diff = computeFiveFlagSemanticDiff(before, nextContent);
  console.log(`INTENDED_ENV_CHANGED_KEY_COUNT=${diff.envChangedKeyCount}`);
  console.log(`INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT=${diff.unexpectedChangedKeyCount}`);
  if (!diff.ok) process.exit(1);
}

function cmdPostMutationConfigAudit(file: string): void {
  const content = readFile(file);
  const staging = assertStagingKeysPresentAndPinned(content);
  const nativeOff = assertNativeRemainsOff(content);
  const inert = assertDiscoveryWorkerInertWhileKilled(envMapFromFileContent(content));
  const cfg = classifyConfigFileFromEnvContent(content, true);
  console.log(`DIMO_GLOBAL_BUDGET_CONFIG_STATE=${cfg}`);
  console.log(`NATIVE_REMAINS_OFF=${nativeOff ? 'YES' : 'NO'}`);
  console.log(`DISCOVERY_EFFECTIVE_ENABLED=${inert.discoveryEnabled ? 'YES' : 'NO'}`);
  console.log(`WORKER_EFFECTIVE_ENABLED=${inert.workerEnabled ? 'YES' : 'NO'}`);
  console.log(`MAINTENANCE_EFFECTIVE_ENABLED=${inert.maintenanceEnabled ? 'YES' : 'NO'}`);
  if (!staging.ok || !nativeOff || inert.discoveryEnabled || inert.workerEnabled) process.exit(1);
  for (const key of FIVE_FLAG_ON_KEYS) {
    const v = envMapFromFileContent(content)[key];
    if (v !== FIVE_FLAG_TRUE_VALUE) {
      console.log(`FIVE_FLAG_NOT_TRUE=${key}`);
      process.exit(1);
    }
  }
  console.log('POST_MUTATION_FIVE_FLAG_CONFIG_AUDIT=PASS');
}

function cmdProveAttestation(metricsFile: string, expectedFp: string): void {
  const body = readFile(metricsFile);
  const proof = proveFiveFlagReplicaAttestation(body);
  console.log(`ATTESTATION_STATE=${proof.state}`);
  console.log(`ATTESTATION_FINGERPRINT=${proof.fingerprint}`);
  console.log(`EXPECTED_ATTESTATION_FINGERPRINT=${expectedFp}`);
  if (!proof.ok || proof.fingerprint !== expectedFp) process.exit(1);
  console.log('FIVE_FLAG_RUNTIME_ATTESTATION=PASS');
}

function cmdDeriveFingerprint(file: string): void {
  const env = envMapFromFileContent(readFile(file));
  const fp = deriveFiveFlagAttestationFingerprint(env);
  console.log(`INTERNALLY_COMPUTED_FINGERPRINT=${fp}`);
}

function cmdValidateGlobalPrestate(lines: string[]): void {
  const parsed = parseGlobalRowDbLines(lines, false);
  if (!parsed.ok || parsed.rowCount !== 1 || parsed.killState !== 'KILLED') {
    console.log('GLOBAL_KILLED_REQUIRED=NO');
    process.exit(1);
  }
  console.log('GLOBAL_KILLED_REQUIRED=YES');
  console.log(`GLOBAL_KILL_STATE=${parsed.killState}`);
}

function cmdValidateS4Persistence(lines: string[]): void {
  const parsed = parseS4PersistenceDbLines(lines);
  if (!parsed.ok) process.exit(1);
  const c = parsed.counts;
  const nonzero = c.pipelineRegistry + c.workItems + c.activeWorkItems > 0;
  if (nonzero) process.exit(1);
  console.log('S4_ZERO_STATE_PRECONDITION=PASS');
}

function cmdValidateVehicle(lines: string[]): void {
  if (!parseVehicleDbProofLines(lines).ok) process.exit(1);
  console.log('TINY_IDENTITY_DB_PRECONDITION=PASS');
}

function main(): void {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'guards':
      cmdGuards();
      break;
    case 's4-safe':
      cmdS4Safe(args[0]);
      break;
    case 'validate-staged':
      cmdValidateStaged(args[0]);
      break;
    case 'apply-mutation-live':
      cmdApplyMutationLive(args[0]);
      break;
    case 'apply-mutation-dry':
      cmdApplyMutationDry(args[0]);
      break;
    case 'intended-delta':
      cmdIntendedDelta(args[0]);
      break;
    case 'post-mutation-audit':
      cmdPostMutationConfigAudit(args[0]);
      break;
    case 'prove-attestation':
      cmdProveAttestation(args[0], args[1]);
      break;
    case 'derive-fingerprint':
      cmdDeriveFingerprint(args[0]);
      break;
    case 'validate-global-prestate':
      cmdValidateGlobalPrestate(args);
      break;
    case 'validate-s4-persistence':
      cmdValidateS4Persistence(args);
      break;
    case 'validate-vehicle-db':
      cmdValidateVehicle(args);
      break;
    case 'print-contract':
      console.log(`SUPPORTED_ENV_MUTATION_KEY_COUNT=${FIVE_FLAG_SUPPORTED_MUTATION_KEY_COUNT}`);
      console.log(`FIVE_FLAG_ON_KEYS=${FIVE_FLAG_ON_KEYS.join(',')}`);
      console.log(`${NATIVE_FLAG_KEY}=${NATIVE_FALSE_VALUE}`);
      console.log('GLOBAL_DB_MUTATION_SUPPORTED=NO');
      console.log('S4_ACTIVATION_OCCURRED=NO');
      break;
    default:
      console.error(`unknown command: ${cmd}`);
      process.exit(1);
  }
}

main();
