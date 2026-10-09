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

export type LiveOpenOrchestrationOutcome =
  | 'OPEN_VERIFIED_NOT_KILLED'
  | 'OPEN_REFUSED'
  | 'OPEN_COMMITTED_POST_VERIFY_UNEXPECTED_REKILL_VERIFIED'
  | 'OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED'
  | 'CRITICAL_RECOVERY_STATE';

export interface LiveOpenOrchestrationResult {
  outcome: LiveOpenOrchestrationOutcome;
  openResult: OpenGlobalKillTransitionResult;
  postOpenRead?: GlobalKillReadResult;
  compensatingRekillResult?: EmergencyRekillTransitionResult;
  postRekillRead?: GlobalKillReadResult;
}

/**
 * Live OPEN with mandatory post-commit verification and compensating EMERGENCY_REKILL on drift.
 */
export async function orchestrateLiveOpenWithRecovery(
  prisma: PrismaClient,
  audit: DiV0S4GlobalKillTransitionAudit,
): Promise<LiveOpenOrchestrationResult> {
  const openResult = await prisma.$transaction((tx) => openGlobalKillRow(tx, audit));
  if (openResult.outcome !== 'OPENED_NOT_KILLED') {
    return { outcome: 'OPEN_REFUSED', openResult };
  }

  const postOpenRead = await readGlobalKillState(prisma);
  if (postOpenRead.ok && postOpenRead.killState === 'NOT_KILLED') {
    return { outcome: 'OPEN_VERIFIED_NOT_KILLED', openResult, postOpenRead };
  }

  const compensatingRekillResult = await prisma.$transaction((tx) => emergencyRekillGlobalRow(tx, audit));
  const postRekillRead = await readGlobalKillState(prisma);

  if (postRekillRead.ok && postRekillRead.killState === 'KILLED') {
    const outcome =
      postOpenRead.ok === false && postOpenRead.reason === 'READ_ERROR'
        ? 'OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED'
        : 'OPEN_COMMITTED_POST_VERIFY_UNEXPECTED_REKILL_VERIFIED';
    return {
      outcome,
      openResult,
      postOpenRead,
      compensatingRekillResult,
      postRekillRead,
    };
  }

  return {
    outcome: 'CRITICAL_RECOVERY_STATE',
    openResult,
    postOpenRead,
    compensatingRekillResult,
    postRekillRead,
  };
}
