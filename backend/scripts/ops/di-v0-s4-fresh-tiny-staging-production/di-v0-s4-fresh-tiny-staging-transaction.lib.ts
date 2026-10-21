/**
 * EXP-021 S4F-7V — pure staging transaction state machine (ops tests; no Production execution in engineering slice).
 */
import {
  applyFreshTinyStagingMutation,
  proveReplicaFreshPrimaryStagingRuntime,
  proveReplicaRecoveryPrestateRuntime,
} from './di-v0-s4-fresh-tiny-staging-production.lib';

export type FreshStagingTxPhase =
  | 'PRE_MUTATION'
  | 'MUTATED'
  | 'REPLICA_A_RESTARTED'
  | 'REPLICA_A_ATTESTED'
  | 'REPLICA_B_RESTARTED'
  | 'COMMITTED'
  | 'ROLLBACK';

export interface FreshStagingTransactionContext {
  phase: FreshStagingTxPhase;
  originalEnvBytes: string;
  currentEnvBytes: string;
  expectedFreshFingerprint: string;
  replicaAAttestationOk: boolean;
  replicaBAttestationOk: boolean;
  rollbackRequired: boolean;
}

export function restoreExactEnvBytes(originalBytes: string, _mutatedBytes: string): string {
  return originalBytes;
}

export function shouldBlockReplicaBRestart(replicaAAttestationOk: boolean): boolean {
  return !replicaAAttestationOk;
}

export function applyMutationPhase(
  originalEnvBytes: string,
  stagingValues: Readonly<Record<string, string>>,
): { ok: true; nextBytes: string } | { ok: false; reason: string } {
  try {
    const { nextContent } = applyFreshTinyStagingMutation(originalEnvBytes, stagingValues);
    return { ok: true, nextBytes: nextContent };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg };
  }
}

export function evaluateReplicaAAttestation(metricsBody: string, expectedFreshFingerprint: string): boolean {
  return proveReplicaFreshPrimaryStagingRuntime(metricsBody, expectedFreshFingerprint).ok;
}

export function evaluateReplicaBAttestation(metricsBody: string, expectedFreshFingerprint: string): boolean {
  return proveReplicaFreshPrimaryStagingRuntime(metricsBody, expectedFreshFingerprint).ok;
}

export function evaluateRollbackRecoveryAttestation(metricsBody: string): boolean {
  return proveReplicaRecoveryPrestateRuntime(metricsBody).ok;
}

export function advanceFreshStagingTransaction(
  ctx: FreshStagingTransactionContext,
  event:
    | 'MUTATION_OK'
    | 'MUTATION_FAIL'
    | 'A_RESTART_OK'
    | 'A_RESTART_FAIL'
    | 'A_ATTESTATION_OK'
    | 'A_ATTESTATION_FAIL'
    | 'B_RESTART_OK'
    | 'B_RESTART_FAIL'
    | 'B_ATTESTATION_OK'
    | 'B_ATTESTATION_FAIL'
    | 'TOPOLOGY_FAIL',
): FreshStagingTransactionContext {
  const next = { ...ctx };
  switch (event) {
    case 'MUTATION_OK':
      next.phase = 'MUTATED';
      break;
    case 'MUTATION_FAIL':
      next.rollbackRequired = false;
      next.phase = 'PRE_MUTATION';
      break;
    case 'A_RESTART_OK':
      next.phase = 'REPLICA_A_RESTARTED';
      break;
    case 'A_RESTART_FAIL':
      next.rollbackRequired = true;
      next.phase = 'ROLLBACK';
      next.currentEnvBytes = restoreExactEnvBytes(ctx.originalEnvBytes, ctx.currentEnvBytes);
      break;
    case 'A_ATTESTATION_OK':
      next.replicaAAttestationOk = true;
      next.phase = 'REPLICA_A_ATTESTED';
      break;
    case 'A_ATTESTATION_FAIL':
      next.rollbackRequired = true;
      next.phase = 'ROLLBACK';
      next.currentEnvBytes = restoreExactEnvBytes(ctx.originalEnvBytes, ctx.currentEnvBytes);
      break;
    case 'B_RESTART_OK':
      if (shouldBlockReplicaBRestart(ctx.replicaAAttestationOk)) {
        next.rollbackRequired = true;
        next.phase = 'ROLLBACK';
        break;
      }
      next.phase = 'REPLICA_B_RESTARTED';
      break;
    case 'B_RESTART_FAIL':
    case 'B_ATTESTATION_FAIL':
    case 'TOPOLOGY_FAIL':
      next.rollbackRequired = true;
      next.phase = 'ROLLBACK';
      next.currentEnvBytes = restoreExactEnvBytes(ctx.originalEnvBytes, ctx.currentEnvBytes);
      break;
    case 'B_ATTESTATION_OK':
      next.replicaBAttestationOk = true;
      next.phase = 'COMMITTED';
      break;
    default:
      break;
  }
  return next;
}
