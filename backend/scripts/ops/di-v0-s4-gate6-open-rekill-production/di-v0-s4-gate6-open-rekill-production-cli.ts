#!/usr/bin/env ts-node
/**
 * EXP-021 S4F-7AS — Gate-6 GLOBAL kill OPEN / EMERGENCY_REKILL operator CLI.
 */
import { PrismaClient } from '@prisma/client';
import {
  emergencyRekillGlobalRow,
  openGlobalKillRowDryRun,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-global-kill-transition';
import {
  evaluateEmergencyRekillAck,
  evaluateGate6OpenGuards,
  type Gate6OpenGuardInput,
} from './di-v0-s4-gate6-open-rekill-production.lib';
import {
  DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV,
  DI_S4_GATE6_DISPATCH_TOKEN_DIR_ENV,
  issueLiveOpenDispatchToken,
} from './di-v0-s4-gate6-dispatch-token.lib';
import { resolveApprovalConsumptionRegisterDir, reserveApprovalIdForDispatch } from './di-v0-s4-gate6-approval-consumption.lib';
import { approvalIdFromVerified, loadAndVerifyHumanApprovalFile } from './di-v0-s4-gate6-human-approval.lib';
import {
  consumeGate6LiveOpenDispatchFromEnv,
  evaluateGate6ProductionPathIsolation,
  isCanonicalProductionBackendEnv,
} from './di-v0-s4-gate6-live-authority.lib';
import { orchestrateLiveOpenWithRecovery, readGlobalKillState } from './di-v0-s4-gate6-open-orchestration.lib';
import { evaluateTrustedLiveOpenAuthority, resolveCanonicalBackendEnvPathFromFilesystem } from './di-v0-s4-gate6-trusted-authority.lib';

function buildOpenGuardInputFromEnv(): Gate6OpenGuardInput {
  return {
    gate6Ack: process.env.DI_S4_GATE6_OPEN_ACK,
    gate6Authorized: process.env.DI_S4_GATE6_OPEN_AUTHORIZED,
    requiredSha: process.env.DI_S4_TINY_STAGING_REQUIRED_SHA,
    actualSha: process.env.DI_S4_TINY_STAGING_ACTUAL_SHA,
    requiredReleaseId: process.env.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID,
    actualReleaseId: process.env.DI_S4_TINY_STAGING_ACTUAL_RELEASE_ID,
    requiredEnvSha256: process.env.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256,
    actualEnvSha256: process.env.DI_S4_TINY_STAGING_ACTUAL_ENV_SHA256,
    expectedAttestationFingerprint: process.env.DI_S4_GATE6_EXPECTED_ATTESTATION_FINGERPRINT,
    replicaAFingerprint: process.env.DI_S4_GATE6_REPLICA_A_ATTESTATION_FINGERPRINT,
    replicaBFingerprint: process.env.DI_S4_GATE6_REPLICA_B_ATTESTATION_FINGERPRINT,
    globalRowLines: (process.env.DI_S4F7AS_GLOBAL_ROW_LINES ?? '').split('\n').filter(Boolean),
    s4PersistenceLines: (process.env.DI_S4F7AS_S4_PERSISTENCE_LINES ?? '').split('\n').filter(Boolean),
    envContent: process.env.DI_S4F7AS_ENV_CONTENT ?? '',
    vehicleDbLines: (process.env.DI_S4F7AS_VEHICLE_DB_LINES ?? '').split('\n').filter(Boolean),
    topologyOk: process.env.DI_S4F7AS_TOPOLOGY_OK === 'YES',
    budgetConfigOk: process.env.DI_S4F7AS_BUDGET_CONFIG_OK === 'YES',
    budgetRuntimeOk: process.env.DI_S4F7AS_BUDGET_RUNTIME_OK === 'YES',
    redisOk: process.env.DI_S4F7AS_REDIS_OK === 'YES',
  };
}

function auditFromEnv(): { reason: string; actor: string } {
  const reason = (process.env.DI_S4_GATE6_OPERATOR_REASON ?? '').trim();
  const actor = (process.env.DI_S4_GATE6_OPERATOR_ACTOR ?? '').trim();
  return { reason, actor };
}

function assertProductionFixtureAllowedForCommand(): void {
  const isolation = evaluateGate6ProductionPathIsolation(process.env);
  if (!isolation.ok) {
    console.log(`PRODUCTION_FIXTURE_ISOLATION_FAILURES=${isolation.failures.join(',')}`);
    process.exit(1);
  }
}

function assertFixtureModeAllowed(): void {
  if (isCanonicalProductionBackendEnv(process.env)) {
    console.log('PRODUCTION_FIXTURE_MODE_FORBIDDEN=YES');
    process.exit(1);
  }
}

function exportCanonicalBackendEnvFromFilesystem(): void {
  const resolved = resolveCanonicalBackendEnvPathFromFilesystem(process.env);
  if (resolved.ok) {
    process.env.SYNQDRIVE_BACKEND_ENV_CANONICAL = resolved.canonicalPath;
  }
}

async function main(): Promise<void> {
  exportCanonicalBackendEnvFromFilesystem();
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'guards-open': {
      const r = evaluateGate6OpenGuards(buildOpenGuardInputFromEnv());
      if (!r.ok) {
        console.log(`GUARD_FAILURES=${r.failures.join(',')}`);
        process.exit(1);
      }
      console.log('GUARDS_OK=YES');
      console.log('GLOBAL_PRESTATE_KILLED=YES');
      break;
    }
    case 'issue-dispatch-token': {
      const audit = auditFromEnv();
      if (!audit.reason || !audit.actor) {
        console.log('AUDIT_FIELDS_MISSING=YES');
        process.exit(1);
      }
      const tokenDir = (process.env[DI_S4_GATE6_DISPATCH_TOKEN_DIR_ENV] ?? '').trim();
      if (!tokenDir) {
        console.log('DISPATCH_TOKEN_DIR_MISSING=YES');
        process.exit(1);
      }
      const pins = {
        requiredSha: process.env.DI_S4_TINY_STAGING_REQUIRED_SHA ?? '',
        requiredReleaseId: process.env.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID ?? '',
        requiredEnvSha256: process.env.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 ?? '',
        reason: audit.reason,
        actor: audit.actor,
      };
      const approval = loadAndVerifyHumanApprovalFile(process.env, pins);
      if (!approval.ok) {
        if (approval.failures.includes('INDEPENDENT_APPROVAL_AUTHORITY_BLOCKED')) {
          console.log('INDEPENDENT_APPROVAL_AUTHORITY=BLOCKED');
        }
        console.log(`HUMAN_APPROVAL_FAILURES=${approval.failures.join(',')}`);
        process.exit(1);
      }
      console.log('INDEPENDENT_APPROVAL_AUTHORITY=VERIFIED');
      const approvalId = approvalIdFromVerified(approval.verified);
      const registerResolved = resolveApprovalConsumptionRegisterDir(process.env);
      if (!registerResolved.ok) {
        console.log(`APPROVAL_CONSUMPTION_FAILURE=${registerResolved.failure}`);
        process.exit(1);
      }
      const reserved = reserveApprovalIdForDispatch(registerResolved.dir, approvalId);
      if (!reserved.ok) {
        console.log(`APPROVAL_CONSUMPTION_FAILURE=${reserved.failure}`);
        process.exit(1);
      }
      console.log('APPROVAL_ID_CONSUMPTION_RESERVED=YES');
      const { filePath, signingKeyFilePath } = issueLiveOpenDispatchToken(tokenDir, {
        approvalId,
        requiredSha: pins.requiredSha,
        requiredReleaseId: pins.requiredReleaseId,
        requiredEnvSha256: pins.requiredEnvSha256,
        reason: audit.reason,
        actor: audit.actor,
      });
      console.log(`DISPATCH_TOKEN_FILE=${filePath}`);
      console.log(`DISPATCH_SIGNING_KEY_FILE=${signingKeyFilePath}`);
      console.log(`LIVE_OPEN_APPROVAL_ID=${approvalId}`);
      console.log('DISPATCH_TOKEN_ISSUED=YES');
      console.log('HMAC_KEY_SEPARATION=YES');
      break;
    }
    case 'dry-run-open': {
      assertProductionFixtureAllowedForCommand();
      const audit = auditFromEnv();
      if (!audit.reason || !audit.actor) {
        console.log('AUDIT_FIELDS_MISSING=YES');
        process.exit(1);
      }
      const guardInput = buildOpenGuardInputFromEnv();
      const guard = evaluateGate6OpenGuards(guardInput);
      if (!guard.ok) {
        console.log(`GUARD_FAILURES=${guard.failures.join(',')}`);
        process.exit(1);
      }
      if (process.env.DI_S4F7AS_FIXTURE_MODE === '1') {
        assertFixtureModeAllowed();
        console.log('DRY_RUN_OPEN_OUTCOME=OPENED_NOT_KILLED');
        console.log('DRY_RUN_DB_MUTATION_ROLLED_BACK=YES');
        console.log('S4_PROCESSING_OCCURRED=NO');
        break;
      }
      const prisma = new PrismaClient();
      try {
        const result = await openGlobalKillRowDryRun(prisma, audit);
        console.log(`DRY_RUN_OPEN_OUTCOME=${result.outcome}`);
        if (result.outcome !== 'OPENED_NOT_KILLED') process.exit(1);
        console.log('DRY_RUN_DB_MUTATION_ROLLED_BACK=YES');
        console.log('S4_PROCESSING_OCCURRED=NO');
      } finally {
        await prisma.$disconnect();
      }
      break;
    }
    case 'live-open': {
      console.log('DIRECT_CLI_LIVE_OPEN_FORBIDDEN=YES');
      console.log('REQUIRED_COMMAND=live-open-authorized');
      process.exit(1);
      break;
    }
    case 'live-open-authorized': {
      assertProductionFixtureAllowedForCommand();
      const audit = auditFromEnv();
      const consumed = consumeGate6LiveOpenDispatchFromEnv(process.env);
      if (!consumed.ok) {
        console.log(`LIVE_OPEN_DISPATCH_FAILURES=${consumed.failures.join(',')}`);
        process.exit(1);
      }
      console.log('DISPATCH_TOKEN_CONSUMED=YES');
      const prisma = new PrismaClient();
      try {
        const trusted = await evaluateTrustedLiveOpenAuthority(prisma, buildOpenGuardInputFromEnv(), consumed.record, process.env);
        if (!trusted.ok) {
          console.log(`LIVE_OPEN_AUTHORITY_FAILURES=${trusted.failures.join(',')}`);
          process.exit(1);
        }
        console.log('TRUSTED_BACKEND_ENV_VERIFIED=YES');
        console.log('TRUSTED_GLOBAL_PRESTATE_KILLED=YES');
        const orchestration = await orchestrateLiveOpenWithRecovery(prisma, audit);
        console.log(`LIVE_OPEN_OUTCOME=${orchestration.openResult?.outcome ?? 'COMMIT_OUTCOME_UNKNOWN'}`);
        console.log(`LIVE_OPEN_ORCHESTRATION=${orchestration.outcome}`);
        if (orchestration.openCommitUnknown) {
          console.log('OPEN_COMMIT_OUTCOME_UNKNOWN=YES');
          console.log(`OPEN_TRANSACTION_ERROR=${orchestration.openTransactionError ?? 'UNKNOWN'}`);
        }
        if (orchestration.postOpenRead) {
          console.log(`POST_OPEN_READ_OK=${orchestration.postOpenRead.ok ? 'YES' : 'NO'}`);
        }
        if (orchestration.compensatingRekill?.rekillPhase) {
          console.log(`COMPENSATING_REKILL_PHASE=${orchestration.compensatingRekill.rekillPhase.phase}`);
          if (orchestration.compensatingRekill.rekillPhase.phase === 'SUCCESS') {
            console.log(`COMPENSATING_REKILL_OUTCOME=${orchestration.compensatingRekill.rekillPhase.result.outcome}`);
          } else {
            console.log(`COMPENSATING_REKILL_ERROR=${orchestration.compensatingRekill.rekillPhase.error}`);
          }
        }
        if (orchestration.compensatingRekill?.rekillException) {
          console.log(`COMPENSATING_REKILL_EXCEPTION=${orchestration.compensatingRekill.rekillException}`);
        }
        if (orchestration.compensatingRekill?.postRead) {
          console.log(
            `POST_REKILL_GLOBAL_STATE=${orchestration.compensatingRekill.postRead.ok ? orchestration.compensatingRekill.postRead.killState : 'UNREADABLE'}`,
          );
        }
        if (orchestration.outcome === 'OPEN_VERIFIED_NOT_KILLED') {
          console.log('GLOBAL_DB_MUTATION_OCCURRED=YES');
          console.log('GLOBAL_KILL_OPENED=YES');
          console.log('ENV_MUTATION_OCCURRED=NO');
          console.log('RESTART_OCCURRED=NO');
          break;
        }
        if (
          orchestration.outcome === 'OPEN_COMMITTED_POST_VERIFY_UNEXPECTED_REKILL_VERIFIED' ||
          orchestration.outcome === 'OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED' ||
          orchestration.outcome === 'OPEN_COMMIT_UNKNOWN_REKILL_VERIFIED_KILLED' ||
          orchestration.outcome === 'OPEN_COMMIT_UNKNOWN_ALREADY_KILLED'
        ) {
          console.log('GLOBAL_DB_MUTATION_OCCURRED=YES');
          console.log('COMPENSATING_REKILL_APPLIED=YES');
          console.log('GLOBAL_KILL_RESTORED_KILLED=YES');
          console.log('KILLED_STATE_PROOF=YES');
          console.log('CRITICAL_RECOVERY_STATE=NO');
          process.exit(1);
        }
        if (orchestration.outcome === 'OPEN_REFUSED' || orchestration.outcome === 'OPEN_REFUSED_PRESTATE_NOT_KILLED') {
          process.exit(1);
        }
        console.log('CRITICAL_RECOVERY_STATE=YES');
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
      break;
    }
    case 'live-rekill': {
      assertProductionFixtureAllowedForCommand();
      const ack = process.env.DI_S4_GATE6_EMERGENCY_REKILL_ACK;
      const audit = auditFromEnv();
      if (!evaluateEmergencyRekillAck(ack, audit.reason, audit.actor)) {
        console.log('EMERGENCY_REKILL_ACK_INVALID=YES');
        process.exit(1);
      }
      if (process.env.DI_S4F7AS_FIXTURE_MODE === '1') {
        assertFixtureModeAllowed();
        console.log('LIVE_REKILL_OUTCOME=REKILLED');
        console.log('GLOBAL_DB_MUTATION_OCCURRED=YES');
        break;
      }
      const prisma = new PrismaClient();
      try {
        const result = await prisma.$transaction((tx) => emergencyRekillGlobalRow(tx, audit));
        console.log(`LIVE_REKILL_OUTCOME=${result.outcome}`);
        const post = await readGlobalKillState(prisma);
        if (!post.ok || post.killState !== 'KILLED') {
          console.log('POST_REKILL_VERIFY=FAILED');
          console.log('CRITICAL_RECOVERY_STATE=YES');
          process.exit(1);
        }
        if (result.outcome !== 'REKILLED' && result.outcome !== 'ALREADY_KILLED') process.exit(1);
        console.log('GLOBAL_DB_MUTATION_OCCURRED=YES');
        console.log('POST_REKILL_VERIFY=KILLED');
      } finally {
        await prisma.$disconnect();
      }
      break;
    }
    case 'read-global': {
      if (process.env.DI_S4F7AS_FIXTURE_MODE === '1') {
        assertFixtureModeAllowed();
        const state = process.env.DI_S4F7J_FIXTURE_GLOBAL_KILL_STATE ?? 'KILLED';
        console.log(`GLOBAL_KILL_STATE=${state}`);
        break;
      }
      const prisma = new PrismaClient();
      try {
        const post = await readGlobalKillState(prisma);
        if (!post.ok) {
          console.log(`GLOBAL_ROW_READ=${post.reason}`);
          process.exit(1);
        }
        console.log(`GLOBAL_KILL_STATE=${post.killState}`);
      } finally {
        await prisma.$disconnect();
      }
      break;
    }
    case 'prove-attestation': {
      const [metricsFile, expected] = args;
      const fs = await import('fs');
      const body = fs.readFileSync(metricsFile, 'utf8');
      const { parseReplicaAttestationFingerprint } = await import('./di-v0-s4-gate6-open-rekill-production.lib');
      const fp = parseReplicaAttestationFingerprint(body);
      console.log(`ATTESTATION_FINGERPRINT=${fp}`);
      console.log(`EXPECTED_ATTESTATION_FINGERPRINT=${expected}`);
      if (fp !== expected) process.exit(1);
      console.log('ATTESTATION_MATCH=YES');
      break;
    }
    default:
      console.log('UNKNOWN_COMMAND');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
