#!/usr/bin/env ts-node
/**
 * CLI for S4F-7V fresh Tiny config staging (pinned fresh authority; OTHER + exact fingerprint).
 */
import {
  applyFreshTinyStagingMutation,
  buildFreshStagingValuesMap,
  computeSemanticEnvDiff,
  deriveInternallyComputedFreshFingerprint,
  evaluateFreshTinyStagingGuards,
  intendedFreshThreeKeyDeltaLines,
  proveReplicaFreshPrimaryStagingRuntime,
  proveReplicaRecoveryPrestateRuntime,
  readFreshAuthorityFromProcessEnv,
  validateFreshAuthority,
  type FreshTinyStagingGuardInput,
} from './di-v0-s4-fresh-tiny-staging-production.lib';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
  FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS,
} from './di-v0-s4-fresh-tiny-staging-authority';
import * as fs from 'fs';

function cmdValidateFreshAuthority(): void {
  const input = readFreshAuthorityFromProcessEnv();
  const result = validateFreshAuthority(input);
  console.log(`FRESH_AUTHORITY_OK=${result.ok ? 'YES' : 'NO'}`);
  if (result.canonicalNotBefore) console.log(`CANONICAL_FRESH_NOT_BEFORE=${result.canonicalNotBefore}`);
  if (result.internallyComputedFingerprint) {
    console.log(`INTERNALLY_COMPUTED_FINGERPRINT=${result.internallyComputedFingerprint}`);
  }
  if (result.operatorExpectedFingerprint) {
    console.log(`OPERATOR_EXPECTED_FINGERPRINT=${result.operatorExpectedFingerprint}`);
  }
  console.log(
    `FRESH_FINGERPRINT_OPERATOR_INTERNAL_MATCH=${result.ok && result.internallyComputedFingerprint === result.operatorExpectedFingerprint ? 'YES' : 'NO'}`,
  );
  if (result.ageSeconds != null) console.log(`FRESH_AUTHORITY_AGE_SECONDS=${result.ageSeconds}`);
  console.log(`FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS=${FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS}`);
  if (!result.ok) {
    console.log(`FRESH_AUTHORITY_FAILURES=${result.failures.join(',')}`);
    process.exit(1);
  }
}

function cmdDeriveFingerprint(): void {
  const nb = process.argv[3];
  if (!nb) process.exit(2);
  const fp = deriveInternallyComputedFreshFingerprint(nb, CANONICAL_TINY_ORGANIZATION_ID, CANONICAL_TINY_VEHICLE_ID);
  console.log(`INTERNALLY_COMPUTED_FINGERPRINT=${fp}`);
}

function cmdProveFreshRuntime(bodyFile: string, expectedFp: string): void {
  const body = fs.readFileSync(bodyFile, 'utf8');
  const r = proveReplicaFreshPrimaryStagingRuntime(body, expectedFp);
  console.log(`FRESH_RUNTIME_PROOF_OK=${r.ok ? 'YES' : 'NO'}`);
  console.log(`ATTESTATION_STATE=${r.state}`);
  console.log(`ATTESTATION_FINGERPRINT=${r.fingerprint}`);
  console.log(`ATTESTATION_CONTRACT_VERSION=${r.contractVersion}`);
  if (!r.ok) {
    console.log(`FRESH_RUNTIME_PROOF_REASON=${r.reason ?? 'UNKNOWN'}`);
    process.exit(1);
  }
}

function cmdProveRecoveryPrestate(bodyFile: string): void {
  const body = fs.readFileSync(bodyFile, 'utf8');
  const r = proveReplicaRecoveryPrestateRuntime(body);
  console.log(`RECOVERY_PRESTATE_OK=${r.ok ? 'YES' : 'NO'}`);
  if (!r.ok) process.exit(1);
}

function cmdIntendedDelta(): void {
  cmdIntendedDeltaWithCounts();
}

function cmdApplyMutationDry(envFile: string): void {
  if (process.env.DI_S4F7V_TEST_INJECT_APPLY_DRY_FAIL === '1') {
    process.exit(1);
  }
  const input = readFreshAuthorityFromProcessEnv();
  const v = validateFreshAuthority(input);
  if (!v.ok || !v.canonicalNotBefore) process.exit(1);
  const map = buildFreshStagingValuesMap(
    v.canonicalNotBefore,
    CANONICAL_TINY_ORGANIZATION_ID,
    CANONICAL_TINY_VEHICLE_ID,
  );
  const content = fs.readFileSync(envFile, 'utf8');
  const { nextContent, targetKeyCountAfter } = applyFreshTinyStagingMutation(content, map);
  const diff = computeSemanticEnvDiff(content, nextContent);
  console.log(`DRY_RUN_ENV_MUTATION_COUNT=0`);
  console.log(`INTENDED_TARGET_KEY_COUNT_AFTER=${targetKeyCountAfter}`);
  console.log(`INTENDED_ENV_CHANGED_KEY_COUNT=${diff.envChangedKeyCount}`);
  console.log(`INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT=${diff.unexpectedChangedKeyCount}`);
  if (!diff.ok || diff.envChangedKeyCount !== 3 || diff.unexpectedChangedKeyCount !== 0) {
    process.exit(1);
  }
  console.log('---INTENDED_ENV_SNIPPET---');
  console.log(nextContent.split('\n').filter((l) => l.startsWith('DI_V0_S4_')).join('\n'));
}

function cmdGuards(): void {
  const input: FreshTinyStagingGuardInput = {
    operatorAck: process.env.DI_S4_TINY_STAGING_ACK,
    requiredSha: process.env.DI_S4_TINY_STAGING_REQUIRED_SHA,
    actualSha: process.env.DI_S4_TINY_STAGING_ACTUAL_SHA,
    requiredReleaseId: process.env.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID,
    actualReleaseId: process.env.DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID,
    requiredEnvSha256: process.env.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256,
    actualEnvSha256: process.env.DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256,
    expectedGlobalState: process.env.DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE,
    globalRowLines: (process.env.DI_S4F7V_GLOBAL_ROW_LINES ?? '').split('\n').filter(Boolean),
    s4PersistenceLines: (process.env.DI_S4F7V_S4_PERSISTENCE_LINES ?? '').split('\n').filter(Boolean),
    envContent: process.env.DI_S4F7V_ENV_CONTENT ?? '',
    envReadable: process.env.DI_S4F7V_ENV_CONTENT_READABLE === 'YES',
    vehicleDbLines: (process.env.DI_S4F7V_VEHICLE_DB_LINES ?? '').split('\n').filter(Boolean),
    preNotBeforeState: (process.env.PRE_NOT_BEFORE_STATE ?? 'MISSING') as FreshTinyStagingGuardInput['preNotBeforeState'],
    preOrgAllowlistState: (process.env.PRE_ORG_ALLOWLIST_STATE ?? 'MISSING') as FreshTinyStagingGuardInput['preOrgAllowlistState'],
    preVehicleAllowlistState: (process.env.PRE_VEHICLE_ALLOWLIST_STATE ?? 'MISSING') as FreshTinyStagingGuardInput['preVehicleAllowlistState'],
    topologyOk: process.env.DI_S4F7V_TOPOLOGY_OK === 'YES',
    budgetConfigExplicitEnabled: process.env.DI_S4F7V_BUDGET_CONFIG_EXPLICIT_ENABLED === 'YES',
    budgetRuntimeBothEnabled: process.env.DI_S4F7V_BUDGET_RUNTIME_BOTH_ENABLED === 'YES',
    redisReachable: process.env.DI_S4F7V_REDIS_REACHABLE === 'YES',
    dryRun: process.env.DRY_RUN === '1',
    freshAuthority: readFreshAuthorityFromProcessEnv(),
    toolCheckoutSha: process.env.DI_S4F7V_TOOL_CHECKOUT_SHA,
    requiredToolSha: process.env.EXPECTED_FRESH_TINY_STAGING_TOOL_SHA,
    finalPreMutationDbClock: process.env.DI_S4F7V_FINAL_DB_CLOCK_CANONICAL_UTC,
  };
  const result = evaluateFreshTinyStagingGuards(input);
  console.log(`GUARDS_OK=${result.ok ? 'YES' : 'NO'}`);
  if (!result.ok) {
    console.log(`GUARD_FAILURES=${result.failures.join(',')}`);
    process.exit(1);
  }
  console.log('GLOBAL_KILLED_PRECONDITION=PASS');
  console.log('ALL_S4_FLAGS_OFF_PRECONDITION=PASS');
  console.log('ALL_THREE_TARGET_KEYS_MISSING_PRECONDITION=PASS');
  console.log('S4_ZERO_STATE_PRECONDITION=PASS');
  console.log('TINY_IDENTITY_DB_PRECONDITION=PASS');
  console.log('TOPOLOGY_PRECONDITION=PASS');
  console.log('BUDGET_RUNTIME_PRECONDITION=PASS');
  console.log('REDIS_PRECONDITION=PASS');
}

function cmdIntendedDeltaWithCounts(): void {
  if (process.env.DI_S4F7V_TEST_INJECT_INTENDED_DELTA_FAIL === '1') {
    process.exit(1);
  }
  const input = readFreshAuthorityFromProcessEnv();
  const v = validateFreshAuthority(input);
  if (!v.ok || !v.canonicalNotBefore) process.exit(1);
  const map = buildFreshStagingValuesMap(
    v.canonicalNotBefore,
    CANONICAL_TINY_ORGANIZATION_ID,
    CANONICAL_TINY_VEHICLE_ID,
  );
  for (const line of intendedFreshThreeKeyDeltaLines(map)) {
    console.log(line);
  }
  console.log('INTENDED_ENV_CHANGED_KEY_COUNT=3');
  console.log('INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT=0');
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'validate-fresh-authority':
      cmdValidateFreshAuthority();
      break;
    case 'derive-fingerprint':
      cmdDeriveFingerprint();
      break;
    case 'prove-fresh-runtime':
      cmdProveFreshRuntime(process.argv[3] ?? '', process.argv[4] ?? '');
      break;
    case 'prove-recovery-prestate':
      cmdProveRecoveryPrestate(process.argv[3] ?? '');
      break;
    case 'intended-delta':
      cmdIntendedDelta();
      break;
    case 'apply-mutation-dry':
      cmdApplyMutationDry(process.argv[3] ?? '');
      break;
    case 'guards':
      cmdGuards();
      break;
    default:
      console.error(
        'usage: cli.ts <validate-fresh-authority|derive-fingerprint|prove-fresh-runtime|prove-recovery-prestate|intended-delta|apply-mutation-dry|guards>',
      );
      process.exit(2);
  }
}

main().catch(() => process.exit(1));
