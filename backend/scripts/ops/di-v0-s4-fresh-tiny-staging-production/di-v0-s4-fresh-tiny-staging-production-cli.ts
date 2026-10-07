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
  SUPPORTED_ENV_MUTATION_KEY_COUNT,
  type FreshTinyStagingGuardInput,
} from './di-v0-s4-fresh-tiny-staging-production.lib';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
  FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS,
} from './di-v0-s4-fresh-tiny-staging-authority';
import * as fs from 'fs';
import * as path from 'path';
import {
  accidentalLiveTestControlsPresent,
  DI_S4F7V_LEGACY_LIVE_STAGING_AUTHORIZED_ENV,
  DI_S4F7Y_LIVE_STAGING_AUTHORIZED_ENV,
  evaluateEngineeringTestHarnessContract,
  evaluateForensicProductionSimulationContract,
  isApprovedLiveFixtureHarness,
  evaluateLiveStagingAuthorizationGate,
  evaluateNoBackfillFinalTripGate,
  isExternalLiveStagingAuthorized,
  readLiveStagingAuthorizationPacketFromEnv,
  type LiveStagingObservedExecutionPacket,
} from './di-v0-s4-fresh-tiny-staging-live-authority.lib';
import { verifyLiveStagingPostState } from './di-v0-s4-fresh-tiny-staging-live-poststate.lib';

function sha256FileContent(content: string): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function atomicWriteFilePreserveOwnership(target: string, content: string): void {
  const st = fs.statSync(target);
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.s4f7y.${Date.now()}.tmp`);
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
  console.log('OWNERSHIP_MODE_PRESERVATION=YES');
}

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

function cmdValidateLiveAuthorization(): void {
  const packet = readLiveStagingAuthorizationPacketFromEnv();
  const observed: LiveStagingObservedExecutionPacket = {
    actualToolSha: (process.env.DI_S4F7V_TOOL_CHECKOUT_SHA ?? '').trim(),
    actualProductionSha: (process.env.DI_S4_TINY_STAGING_ACTUAL_SHA ?? '').trim(),
    actualProductionReleaseId: (process.env.DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID ?? '').trim(),
    actualPreEnvSha256: (process.env.DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256 ?? '').trim(),
    actualFreshNotBefore: (process.env.DI_S4_TINY_FRESH_NOT_BEFORE ?? '').trim(),
    actualFreshExpectedFingerprint: (process.env.DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT ?? '').trim(),
    actualOrganizationAllowlist: (process.env.DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST ?? '').trim(),
    actualVehicleAllowlist: (process.env.DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST ?? '').trim(),
  };
  const testHarness = isApprovedLiveFixtureHarness(process.env);
  const accidentalFixture =
    accidentalLiveTestControlsPresent(process.env) && !testHarness && process.env.DRY_RUN !== '1';
  const gate = evaluateLiveStagingAuthorizationGate({
    operatorAck: process.env.DI_S4_TINY_STAGING_ACK,
    liveStagingAuthorized: process.env[DI_S4F7Y_LIVE_STAGING_AUTHORIZED_ENV],
    legacyS4f7vLiveAuthorized: process.env[DI_S4F7V_LEGACY_LIVE_STAGING_AUTHORIZED_ENV],
    testHarnessActive: testHarness,
    accidentalFixtureControlsPresent: accidentalFixture,
    packet,
    observed,
  });
  console.log(`LIVE_STAGING_AUTHORIZATION_VALID=${gate.ok ? 'YES' : 'NO'}`);
  if (!gate.ok) {
    console.log(`LIVE_AUTHORIZATION_FAILURES=${gate.failures.join(',')}`);
    process.exit(1);
  }
  console.log('AUTHORIZED_TOOL_SHA_BOUND=YES');
  console.log('AUTHORIZED_PRODUCTION_SHA_BOUND=YES');
  console.log('AUTHORIZED_PRODUCTION_RELEASE_BOUND=YES');
  console.log('AUTHORIZED_PRE_ENV_SHA_BOUND=YES');
  console.log('AUTHORIZED_FRESH_NOT_BEFORE_BOUND=YES');
  console.log('AUTHORIZED_FRESH_FINGERPRINT_BOUND=YES');
  console.log('AUTHORIZED_ORG_BOUND=YES');
  console.log('AUTHORIZED_VEHICLE_BOUND=YES');
}

function cmdValidateNoBackfillFinal(): void {
  const nb = (process.env.AUTHORIZED_FRESH_NOT_BEFORE ?? process.env.DI_S4_TINY_FRESH_NOT_BEFORE ?? '').trim();
  const latest = (process.env.FINAL_LATEST_COMPLETED_TRIP_END_TIME ?? '').trim();
  const futureCount = Number(process.env.FINAL_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT ?? '0');
  const eligibleCount = Number(process.env.FINAL_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT ?? '0');
  const gate = evaluateNoBackfillFinalTripGate({
    authorizedFreshNotBeforeCanonical: nb,
    latestCompletedTripEndTime: latest === '' || latest === 'NULL' ? null : latest,
    completedTripEndTimeInFutureCount: futureCount,
    existingEligibleCompletedTripCount: eligibleCount,
  });
  console.log(`FINAL_LATEST_COMPLETED_TRIP_END_TIME=${latest || 'NULL'}`);
  console.log(`FINAL_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT=${futureCount}`);
  console.log(`FINAL_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT=${eligibleCount}`);
  console.log(`NO_BACKFILL_FINAL_GATE=${gate.ok ? 'PASS' : 'FAIL'}`);
  if (!gate.ok) {
    console.log(`NO_BACKFILL_FINAL_GATE_REASON=${gate.reason ?? 'UNKNOWN'}`);
    process.exit(1);
  }
}

function cmdApplyMutationLive(envFile: string): void {
  if (process.env.DI_S4F7Y_TEST_INJECT_MUTATION_FAIL === '1') {
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
  const before = fs.readFileSync(envFile, 'utf8');
  const { nextContent, targetKeyCountAfter } = applyFreshTinyStagingMutation(before, map);
  const diff = computeSemanticEnvDiff(before, nextContent);
  console.log(`ENV_CHANGED_KEY_COUNT=${diff.envChangedKeyCount}`);
  console.log(`UNEXPECTED_ENV_CHANGED_KEY_COUNT=${diff.unexpectedChangedKeyCount}`);
  console.log(`TARGET_KEY_COUNT_AFTER=${targetKeyCountAfter}`);
  if (!diff.ok || diff.envChangedKeyCount !== SUPPORTED_ENV_MUTATION_KEY_COUNT || diff.unexpectedChangedKeyCount !== 0) {
    console.log('POST_WRITE_SEMANTIC_DIFF_INDEPENDENTLY_VERIFIED=NO');
    process.exit(1);
  }
  atomicWriteFilePreserveOwnership(envFile, nextContent);
  const afterOnDisk = fs.readFileSync(envFile, 'utf8');
  const postDiff = computeSemanticEnvDiff(before, afterOnDisk);
  if (!postDiff.ok || postDiff.envChangedKeyCount !== SUPPORTED_ENV_MUTATION_KEY_COUNT) {
    console.log('POST_WRITE_SEMANTIC_DIFF_INDEPENDENTLY_VERIFIED=NO');
    process.exit(1);
  }
  console.log('POST_WRITE_SEMANTIC_DIFF_INDEPENDENTLY_VERIFIED=YES');
  console.log(`BACKEND_ENV_SHA256_AFTER=${sha256FileContent(afterOnDisk)}`);
}

function cmdRevalidateExternalLiveAuthorization(): void {
  if (!isExternalLiveStagingAuthorized()) {
    console.log('LIVE_AUTHORIZATION_REVALIDATED_IMMEDIATELY_PRE_MUTATION=NO');
    console.log('LIVE_TRANSACTION_SYNTHESIZES_AUTHORIZATION=NO');
    process.exit(1);
  }
  console.log('LIVE_AUTHORIZATION_SOURCE=EXTERNAL_OPERATOR_EXECUTION_ENV');
  console.log('LIVE_TRANSACTION_SYNTHESIZES_AUTHORIZATION=NO');
  console.log('LIVE_AUTHORIZATION_REVALIDATED_IMMEDIATELY_PRE_MUTATION=YES');
}

function cmdValidateEngineeringHarness(): void {
  const r = evaluateEngineeringTestHarnessContract();
  console.log(`ENGINEERING_TEST_HARNESS_CONTRACT_OK=${r.ok ? 'YES' : 'NO'}`);
  if (!r.ok) {
    console.log(`ENGINEERING_TEST_HARNESS_FAILURES=${r.failures.join(',')}`);
    process.exit(1);
  }
  console.log('PRODUCTION_BACKEND_ENV_ALLOWED_IN_TEST_HARNESS=NO');
}

function cmdValidateForensicHarness(): void {
  const r = evaluateForensicProductionSimulationContract();
  console.log(`FORENSIC_PRODUCTION_SIMULATION_CONTRACT_OK=${r.ok ? 'YES' : 'NO'}`);
  if (!r.ok) {
    console.log(`FORENSIC_PRODUCTION_SIMULATION_FAILURES=${r.failures.join(',')}`);
    process.exit(1);
  }
  console.log('PRODUCTION_BACKEND_ENV_ALLOWED_IN_TEST_HARNESS=NO');
}

function cmdVerifyLivePoststate(backupPath: string, currentPath: string): void {
  if (process.env.DI_S4F7Y_TEST_INJECT_FINAL_POSTSTATE_FAIL === '1') {
    console.log('FINAL_ENV_POSTSTATE_REVERIFY=FAIL');
    process.exit(1);
  }
  const backupContent = fs.readFileSync(backupPath, 'utf8');
  const currentContent = fs.readFileSync(currentPath, 'utf8');
  const input = readFreshAuthorityFromProcessEnv();
  const v = validateFreshAuthority(input);
  if (!v.ok || !v.canonicalNotBefore) process.exit(1);
  const map = buildFreshStagingValuesMap(
    v.canonicalNotBefore,
    CANONICAL_TINY_ORGANIZATION_ID,
    CANONICAL_TINY_VEHICLE_ID,
  );
  const authorizedPre =
    (process.env.AUTHORIZED_PRE_ENV_SHA256 ?? process.env.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 ?? '').trim();
  const result = verifyLiveStagingPostState({
    backupContent,
    currentContent,
    authorizedPreEnvSha256: authorizedPre,
    authorizedStagingValues: map,
  });
  console.log(`FINAL_ENV_BACKUP_AUTHORITY_MATCH=${result.backupShaMatches ? 'YES' : 'NO'}`);
  console.log(`FINAL_ENV_AUTHORIZED_VALUES_EXACT=${result.authorizedValuesExact ? 'YES' : 'NO'}`);
  console.log(`FINAL_ENV_CHANGED_KEY_COUNT=${result.envChangedKeyCount}`);
  console.log(`FINAL_ENV_UNEXPECTED_CHANGED_KEY_COUNT=${result.unexpectedChangedKeyCount}`);
  console.log(`FINAL_ENV_TARGET_CARDINALITY=${result.targetCardinalityOk ? 'PASS' : 'FAIL'}`);
  console.log(`FINAL_ENV_POSTSTATE_REVERIFY=${result.ok ? 'PASS' : 'FAIL'}`);
  if (!result.ok) process.exit(1);
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
    case 'validate-live-authorization':
      cmdValidateLiveAuthorization();
      break;
    case 'validate-no-backfill-final':
      cmdValidateNoBackfillFinal();
      break;
    case 'apply-mutation-live':
      cmdApplyMutationLive(process.argv[3] ?? '');
      break;
    case 'revalidate-external-live-authorization':
      cmdRevalidateExternalLiveAuthorization();
      break;
    case 'validate-engineering-harness':
      cmdValidateEngineeringHarness();
      break;
    case 'validate-forensic-harness':
      cmdValidateForensicHarness();
      break;
    case 'verify-live-poststate':
      cmdVerifyLivePoststate(process.argv[3] ?? '', process.argv[4] ?? '');
      break;
    default:
      console.error(
        'usage: cli.ts <validate-fresh-authority|derive-fingerprint|prove-fresh-runtime|prove-recovery-prestate|intended-delta|apply-mutation-dry|apply-mutation-live|guards|validate-live-authorization|validate-no-backfill-final|revalidate-external-live-authorization|validate-engineering-harness|validate-forensic-harness|verify-live-poststate>',
      );
      process.exit(2);
  }
}

main().catch(() => process.exit(1));
