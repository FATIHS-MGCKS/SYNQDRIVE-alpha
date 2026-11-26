/**
 * Disposable-DB synchronization for USR-P2C deterministic race proofs.
 * Uses a shared barrier row (not sleep-as-proof): bounded poll until phase or timeout failure.
 */
import type { PrismaClient } from '@prisma/client';

export const USR_P2_RACE_BARRIER_TABLE = 'usr_p2_race_barrier';

export type RaceBarrierPhase =
  | 'idle'
  | 'a_lock_acquired'
  | 'b_started'
  | 'b_waiting'
  | 'a_committed'
  | 'done';

const PHASE_NUM: Record<RaceBarrierPhase, number> = {
  idle: 0,
  a_lock_acquired: 1,
  b_started: 2,
  b_waiting: 3,
  a_committed: 4,
  done: 5,
};

export async function ensureRaceBarrierTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${USR_P2_RACE_BARRIER_TABLE} (
      race_id text PRIMARY KEY,
      phase int NOT NULL DEFAULT 0,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

export async function resetRaceBarrier(prisma: PrismaClient, raceId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO usr_p2_race_barrier (race_id, phase, meta)
    VALUES (${raceId}, 0, '{}'::jsonb)
    ON CONFLICT (race_id) DO UPDATE SET phase = 0, meta = '{}'::jsonb, updated_at = NOW()
  `;
}

export async function setRacePhase(
  prisma: PrismaClient,
  raceId: string,
  label: RaceBarrierPhase,
  meta?: Record<string, unknown>,
): Promise<void> {
  const phase = PHASE_NUM[label];
  await prisma.$executeRaw`
    INSERT INTO usr_p2_race_barrier (race_id, phase, meta)
    VALUES (${raceId}, ${phase}, ${JSON.stringify(meta ?? {})}::jsonb)
    ON CONFLICT (race_id) DO UPDATE
    SET phase = ${phase}, meta = ${JSON.stringify(meta ?? {})}::jsonb, updated_at = NOW()
  `;
}

export async function waitRacePhaseAtLeast(
  prisma: PrismaClient,
  raceId: string,
  minLabel: RaceBarrierPhase,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<void> {
  const min = PHASE_NUM[minLabel];
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const pollMs = options?.pollMs ?? 15;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ phase: number }>>`
      SELECT phase FROM usr_p2_race_barrier WHERE race_id = ${raceId}
    `;
    const phase = rows[0]?.phase ?? 0;
    if (phase >= min) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`race barrier timeout: ${raceId} waiting for phase>=${min} (${minLabel})`);
}

export async function advisoryLocksHeldForUser(
  prisma: PrismaClient,
  userId: string,
  lockClass: number,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND classid = ${lockClass}
      AND objid = hashtext(${userId})
  `;
  return Number(rows[0]?.count ?? 0n);
}

export async function withRaceBarrier<T>(
  prismaA: PrismaClient,
  prismaB: PrismaClient,
  raceId: string,
  fn: (barrier: {
    signal: (client: PrismaClient, label: RaceBarrierPhase, meta?: Record<string, unknown>) => Promise<void>;
    wait: (client: PrismaClient, label: RaceBarrierPhase) => Promise<void>;
  }) => Promise<T>,
): Promise<T> {
  await ensureRaceBarrierTable(prismaA);
  await resetRaceBarrier(prismaA, raceId);
  try {
    return await fn({
      signal: (client, label, meta) => setRacePhase(client, raceId, label, meta),
      wait: (client, label) => waitRacePhaseAtLeast(client, raceId, label),
    });
  } finally {
    await setRacePhase(prismaA, raceId, 'done').catch(() => undefined);
  }
}