import type { PrismaClient } from '@prisma/client';

export const DI_V0_S4_GLOBAL_CONTROL_ID = 'GLOBAL';

export type DiV0S4KillState = 'KILLED' | 'NOT_KILLED';

export type OpenGlobalKillTransitionResult =
  | { outcome: 'OPENED_NOT_KILLED'; previousState: 'KILLED' }
  | { outcome: 'REFUSED_MISSING_ROW' }
  | { outcome: 'REFUSED_ALREADY_NOT_KILLED' }
  | { outcome: 'REFUSED_MALFORMED' };

export type EmergencyRekillTransitionResult =
  | { outcome: 'REKILLED'; previousState: 'NOT_KILLED' }
  | { outcome: 'ALREADY_KILLED'; previousState: 'KILLED' }
  | { outcome: 'REFUSED_MISSING_ROW' }
  | { outcome: 'REFUSED_MALFORMED' };

export interface DiV0S4GlobalKillTransitionAudit {
  reason: string;
  actor: string;
}

function classifyKillState(value: unknown): DiV0S4KillState | 'MALFORMED' {
  if (value === 'KILLED') return 'KILLED';
  if (value === 'NOT_KILLED') return 'NOT_KILLED';
  return 'MALFORMED';
}

type TxClient = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

/**
 * Gate-6 OPEN: KILLED → NOT_KILLED on the existing GLOBAL row only (never inserts).
 * Uses SELECT … FOR UPDATE inside the caller's transaction.
 */
export async function openGlobalKillRow(
  tx: TxClient,
  audit: DiV0S4GlobalKillTransitionAudit,
): Promise<OpenGlobalKillTransitionResult> {
  const locked = await tx.$queryRaw<Array<{ kill_state: unknown }>>`
    SELECT kill_state FROM di_v0_s4_control WHERE id = ${DI_V0_S4_GLOBAL_CONTROL_ID} FOR UPDATE`;
  if (locked.length === 0) return { outcome: 'REFUSED_MISSING_ROW' };
  if (locked.length !== 1) return { outcome: 'REFUSED_MALFORMED' };

  const state = classifyKillState(locked[0].kill_state);
  if (state === 'MALFORMED') return { outcome: 'REFUSED_MALFORMED' };
  if (state === 'NOT_KILLED') return { outcome: 'REFUSED_ALREADY_NOT_KILLED' };

  const updated = await tx.$queryRaw<Array<{ kill_state: unknown }>>`
    UPDATE di_v0_s4_control
    SET kill_state = 'NOT_KILLED',
        reason = ${audit.reason},
        actor = ${audit.actor},
        updated_at = now()
    WHERE id = ${DI_V0_S4_GLOBAL_CONTROL_ID} AND kill_state = 'KILLED'
    RETURNING kill_state`;
  if (updated.length !== 1 || classifyKillState(updated[0].kill_state) !== 'NOT_KILLED') {
    return { outcome: 'REFUSED_MALFORMED' };
  }
  return { outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' };
}

/**
 * Gate-6 EMERGENCY_REKILL: NOT_KILLED → KILLED (idempotent when already KILLED).
 * Does not depend on S4 runtime health; only the GLOBAL control row.
 */
export async function emergencyRekillGlobalRow(
  tx: TxClient,
  audit: DiV0S4GlobalKillTransitionAudit,
): Promise<EmergencyRekillTransitionResult> {
  const locked = await tx.$queryRaw<Array<{ kill_state: unknown }>>`
    SELECT kill_state FROM di_v0_s4_control WHERE id = ${DI_V0_S4_GLOBAL_CONTROL_ID} FOR UPDATE`;
  if (locked.length === 0) return { outcome: 'REFUSED_MISSING_ROW' };
  if (locked.length !== 1) return { outcome: 'REFUSED_MALFORMED' };

  const state = classifyKillState(locked[0].kill_state);
  if (state === 'MALFORMED') return { outcome: 'REFUSED_MALFORMED' };
  if (state === 'KILLED') return { outcome: 'ALREADY_KILLED', previousState: 'KILLED' };

  const updated = await tx.$queryRaw<Array<{ kill_state: unknown }>>`
    UPDATE di_v0_s4_control
    SET kill_state = 'KILLED',
        reason = ${audit.reason},
        actor = ${audit.actor},
        updated_at = now()
    WHERE id = ${DI_V0_S4_GLOBAL_CONTROL_ID} AND kill_state = 'NOT_KILLED'
    RETURNING kill_state`;
  if (updated.length !== 1 || classifyKillState(updated[0].kill_state) !== 'KILLED') {
    return { outcome: 'REFUSED_MALFORMED' };
  }
  return { outcome: 'REKILLED', previousState: 'NOT_KILLED' };
}

export class DiV0S4Gate6DryRunRollback extends Error {
  readonly dryRunResult: OpenGlobalKillTransitionResult;
  constructor(dryRunResult: OpenGlobalKillTransitionResult) {
    super('DI_V0_S4_GATE6_DRY_RUN_ROLLBACK');
    this.dryRunResult = dryRunResult;
  }
}

/** Simulates OPEN inside a transaction and rolls back (no durable DB change). */
export async function openGlobalKillRowDryRun(
  prisma: Pick<PrismaClient, '$transaction'>,
  audit: DiV0S4GlobalKillTransitionAudit,
): Promise<OpenGlobalKillTransitionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const result = await openGlobalKillRow(tx, audit);
      throw new DiV0S4Gate6DryRunRollback(result);
    });
  } catch (error) {
    if (error instanceof DiV0S4Gate6DryRunRollback) {
      return error.dryRunResult;
    }
    throw error;
  }
  return { outcome: 'REFUSED_MALFORMED' };
}
