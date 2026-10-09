import type { PrismaClient } from '@prisma/client';
import {
  emergencyRekillGlobalRow,
  openGlobalKillRow,
  type DiV0S4GlobalKillTransitionAudit,
  type EmergencyRekillTransitionResult,
  type OpenGlobalKillTransitionResult,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-global-kill-transition';

export type GlobalKillReadResult =
  | { ok: true; killState: 'KILLED' | 'NOT_KILLED' }
  | { ok: false; reason: 'MISSING_ROW' | 'MALFORMED' | 'READ_ERROR'; detail?: string };

export async function readGlobalKillState(client: Pick<PrismaClient, '$queryRaw'>): Promise<GlobalKillReadResult> {
  try {
    const rows = await client.$queryRaw<Array<{ kill_state: unknown }>>`
      SELECT kill_state::text AS kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    if (rows.length === 0) return { ok: false, reason: 'MISSING_ROW' };
    if (rows.length !== 1) return { ok: false, reason: 'MALFORMED' };
    const state = rows[0].kill_state;
    if (state === 'KILLED' || state === 'NOT_KILLED') return { ok: true, killState: state };
    return { ok: false, reason: 'MALFORMED' };
  } catch (error) {
    return {
      ok: false,
      reason: 'READ_ERROR',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export type OpenTransactionPhase =
  | { phase: 'SUCCESS'; result: OpenGlobalKillTransitionResult }
  | { phase: 'REFUSED'; result: OpenGlobalKillTransitionResult }
  | { phase: 'COMMIT_OUTCOME_UNKNOWN'; error: string };

export type RekillTransactionPhase =
  | { phase: 'SUCCESS'; result: EmergencyRekillTransitionResult }
  | { phase: 'COMMIT_OUTCOME_UNKNOWN'; error: string };

export async function runOpenTransaction(
  prisma: PrismaClient,
  audit: DiV0S4GlobalKillTransitionAudit,
): Promise<OpenTransactionPhase> {
  try {
    const result = await prisma.$transaction((tx) => openGlobalKillRow(tx, audit));
    if (result.outcome === 'OPENED_NOT_KILLED') return { phase: 'SUCCESS', result };
    return { phase: 'REFUSED', result };
  } catch (error) {
    return {
      phase: 'COMMIT_OUTCOME_UNKNOWN',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runRekillTransaction(
  prisma: PrismaClient,
  audit: DiV0S4GlobalKillTransitionAudit,
): Promise<RekillTransactionPhase> {
  try {
    const result = await prisma.$transaction((tx) => emergencyRekillGlobalRow(tx, audit));
    return { phase: 'SUCCESS', result };
  } catch (error) {
    return {
      phase: 'COMMIT_OUTCOME_UNKNOWN',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface CompensatingRekillAttempt {
  rekillPhase?: RekillTransactionPhase;
  rekillException?: string;
  postRead: GlobalKillReadResult;
  killedProven: boolean;
}

/**
 * Attempt EMERGENCY_REKILL when GLOBAL is NOT_KILLED or state is unknown; success only when KILLED is proven by read.
 */
export async function attemptCompensatingRekillToKilled(
  prisma: PrismaClient,
  audit: DiV0S4GlobalKillTransitionAudit,
): Promise<CompensatingRekillAttempt> {
  const before = await readGlobalKillState(prisma);
  if (before.ok && before.killState === 'KILLED') {
    return { postRead: before, killedProven: true };
  }

  let rekillPhase: RekillTransactionPhase | undefined;
  let rekillException: string | undefined;
  try {
    rekillPhase = await runRekillTransaction(prisma, audit);
  } catch (error) {
    rekillException = error instanceof Error ? error.message : String(error);
  }

  const postRead = await readGlobalKillState(prisma);
  const killedProven = postRead.ok && postRead.killState === 'KILLED';
  return { rekillPhase, rekillException, postRead, killedProven };
}

export type LiveOpenOrchestrationOutcome =
  | 'OPEN_VERIFIED_NOT_KILLED'
  | 'OPEN_REFUSED'
  | 'OPEN_REFUSED_PRESTATE_NOT_KILLED'
  | 'OPEN_COMMITTED_POST_VERIFY_UNEXPECTED_REKILL_VERIFIED'
  | 'OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED'
  | 'OPEN_COMMIT_UNKNOWN_REKILL_VERIFIED_KILLED'
  | 'OPEN_COMMIT_UNKNOWN_ALREADY_KILLED'
  | 'CRITICAL_RECOVERY_STATE';

export interface LiveOpenOrchestrationResult {
  outcome: LiveOpenOrchestrationOutcome;
  openResult?: OpenGlobalKillTransitionResult;
  openCommitUnknown?: boolean;
  openTransactionError?: string;
  postOpenRead?: GlobalKillReadResult;
  compensatingRekill?: CompensatingRekillAttempt;
}

const REFUSED_PLACEHOLDER: OpenGlobalKillTransitionResult = { outcome: 'REFUSED_MALFORMED' };

export async function orchestrateLiveOpenWithRecovery(
  prisma: PrismaClient,
  audit: DiV0S4GlobalKillTransitionAudit,
): Promise<LiveOpenOrchestrationResult> {
  const preOpen = await readGlobalKillState(prisma);
  if (!preOpen.ok || preOpen.killState !== 'KILLED') {
    return {
      outcome: 'OPEN_REFUSED_PRESTATE_NOT_KILLED',
      openResult: REFUSED_PLACEHOLDER,
      postOpenRead: preOpen,
    };
  }

  const openPhase = await runOpenTransaction(prisma, audit);

  if (openPhase.phase === 'REFUSED') {
    return { outcome: 'OPEN_REFUSED', openResult: openPhase.result };
  }

  if (openPhase.phase === 'COMMIT_OUTCOME_UNKNOWN') {
    const compensatingRekill = await attemptCompensatingRekillToKilled(prisma, audit);
    if (compensatingRekill.killedProven) {
      const alreadyKilledBeforeRekill =
        compensatingRekill.rekillPhase === undefined && compensatingRekill.rekillException === undefined;
      const outcome = alreadyKilledBeforeRekill
        ? 'OPEN_COMMIT_UNKNOWN_ALREADY_KILLED'
        : 'OPEN_COMMIT_UNKNOWN_REKILL_VERIFIED_KILLED';
      return {
        outcome,
        openCommitUnknown: true,
        openTransactionError: openPhase.error,
        compensatingRekill,
      };
    }
    return {
      outcome: 'CRITICAL_RECOVERY_STATE',
      openCommitUnknown: true,
      openTransactionError: openPhase.error,
      compensatingRekill,
    };
  }

  const postOpenRead = await readGlobalKillState(prisma);
  if (postOpenRead.ok && postOpenRead.killState === 'NOT_KILLED') {
    return {
      outcome: 'OPEN_VERIFIED_NOT_KILLED',
      openResult: openPhase.result,
      postOpenRead,
    };
  }

  const compensatingRekill = await attemptCompensatingRekillToKilled(prisma, audit);
  if (compensatingRekill.killedProven) {
    const outcome =
      postOpenRead.ok === false && postOpenRead.reason === 'READ_ERROR'
        ? 'OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED'
        : 'OPEN_COMMITTED_POST_VERIFY_UNEXPECTED_REKILL_VERIFIED';
    return {
      outcome,
      openResult: openPhase.result,
      postOpenRead,
      compensatingRekill,
    };
  }

  return {
    outcome: 'CRITICAL_RECOVERY_STATE',
    openResult: openPhase.result,
    postOpenRead,
    compensatingRekill,
  };
}
