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
 */
export async function initializeDiV0S4GlobalKillRow(
  prisma: Pick<PrismaClient, '$transaction'>,
  params: DiV0S4ControlKillInitParams,
): Promise<DiV0S4ControlKillInitResult> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.$queryRaw<Array<{ kill_state: unknown }>>`
      SELECT kill_state FROM di_v0_s4_control WHERE id = ${GLOBAL_ID} FOR UPDATE`;
    const hadRow = before.length === 1;
    if (!hadRow) {
      await tx.$executeRaw`
        INSERT INTO di_v0_s4_control (id, kill_state, reason, actor)
        VALUES (${GLOBAL_ID}, 'KILLED', ${params.reason}, ${params.actor})
        ON CONFLICT (id) DO NOTHING`;
    }
    const after = await tx.$queryRaw<Array<{ kill_state: unknown }>>`
      SELECT kill_state FROM di_v0_s4_control WHERE id = ${GLOBAL_ID} FOR UPDATE`;
    if (after.length !== 1) {
      return { outcome: 'REFUSED_MALFORMED' };
    }
    const state = classifyKillState(after[0].kill_state);
    if (state === 'MALFORMED') return { outcome: 'REFUSED_MALFORMED' };
    if (state === 'NOT_KILLED') return { outcome: 'REFUSED_NOT_KILLED' };
    if (!hadRow) return { outcome: 'INSERTED_KILLED' };
    return { outcome: 'ALREADY_KILLED' };
  });
}
