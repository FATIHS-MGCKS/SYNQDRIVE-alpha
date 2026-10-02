import type { PrismaClient } from '@prisma/client';

export type DiV0S4ControlKillInitResult =
  | { outcome: 'INSERTED_KILLED' }
  | { outcome: 'ALREADY_KILLED' }
  | { outcome: 'REFUSED_NOT_KILLED' }
  | { outcome: 'REFUSED_MALFORMED' };

export interface DiV0S4ControlKillInitParams {
  reason: string;
  actor: string;
}

const GLOBAL_ID = 'GLOBAL';

function classifyKillState(value: unknown): 'KILLED' | 'NOT_KILLED' | 'MALFORMED' {
  if (value === 'KILLED') return 'KILLED';
  if (value === 'NOT_KILLED') return 'NOT_KILLED';
  return 'MALFORMED';
}

/**
 * Operator-only initializer: ensures exactly one GLOBAL row exists in KILLED state.
 * Never creates NOT_KILLED. Idempotent when already KILLED.
 * INSERT authority: only the transaction whose INSERT ... RETURNING succeeds reports INSERTED_KILLED.
 */
export async function initializeDiV0S4GlobalKillRow(
  prisma: Pick<PrismaClient, '$transaction'>,
  params: DiV0S4ControlKillInitParams,
): Promise<DiV0S4ControlKillInitResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ kill_state: unknown }>>`
      SELECT kill_state FROM di_v0_s4_control WHERE id = ${GLOBAL_ID} FOR UPDATE`;
    if (locked.length === 1) {
      const state = classifyKillState(locked[0].kill_state);
      if (state === 'MALFORMED') return { outcome: 'REFUSED_MALFORMED' };
      if (state === 'NOT_KILLED') return { outcome: 'REFUSED_NOT_KILLED' };
      return { outcome: 'ALREADY_KILLED' };
    }

    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO di_v0_s4_control (id, kill_state, reason, actor)
      VALUES (${GLOBAL_ID}, 'KILLED', ${params.reason}, ${params.actor})
      ON CONFLICT (id) DO NOTHING
      RETURNING id`;
    if (inserted.length === 1) {
      return { outcome: 'INSERTED_KILLED' };
    }

    const after = await tx.$queryRaw<Array<{ kill_state: unknown }>>`
      SELECT kill_state FROM di_v0_s4_control WHERE id = ${GLOBAL_ID} FOR UPDATE`;
    if (after.length !== 1) {
      return { outcome: 'REFUSED_MALFORMED' };
    }
    const finalState = classifyKillState(after[0].kill_state);
    if (finalState === 'MALFORMED') return { outcome: 'REFUSED_MALFORMED' };
    if (finalState === 'NOT_KILLED') return { outcome: 'REFUSED_NOT_KILLED' };
    return { outcome: 'ALREADY_KILLED' };
  });
}
