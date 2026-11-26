/**
 * Disposable-DB synchronization for USR-P2C deterministic race proofs.
 * Uses a shared barrier row (not sleep-as-proof): bounded poll until phase or timeout failure.
 */
import type { PrismaClient } from '@prisma/client';
import {
  acquireUserSessionWriteLock,
  IAM_USER_SESSION_WRITE_LOCK_CLASS,
} from '@modules/auth/refresh-token-session-concurrency';

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

export async function pgBackendPid(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
  return rows[0]!.pid;
}

/** True when `blockedPid` is waiting on another backend (pg_blocking_pids). */
export async function isBackendBlocked(
  observer: PrismaClient,
  blockedPid: number,
): Promise<boolean> {
  const rows = await observer.$queryRaw<Array<{ blocking_pid: number | null }>>`
    SELECT unnest(pg_blocking_pids(${blockedPid}::integer)) AS blocking_pid
  `;
  return rows.some((r) => r.blocking_pid != null);
}

export async function waitUntilBackendBlocked(
  observer: PrismaClient,
  blockedPid: number,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<number[]> {
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const pollMs = options?.pollMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRaw<Array<{ blocking_pid: number }>>`
      SELECT unnest(pg_blocking_pids(${blockedPid}::integer)) AS blocking_pid
    `;
    const blocking = rows.map((r) => r.blocking_pid).filter((p) => p > 0);
    if (blocking.length > 0) return blocking;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`backend pid ${blockedPid} was not observed blocked within ${timeoutMs}ms`);
}

export async function countUserAdvisoryLockWaiters(
  observer: PrismaClient,
  userId: string,
): Promise<number> {
  const rows = await observer.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND granted = false
      AND classid = ${IAM_USER_SESSION_WRITE_LOCK_CLASS}
      AND objid = hashtext(${userId}::text)
  `;
  return Number(rows[0]?.count ?? 0n);
}

export async function waitUntilAdvisoryLockWaiters(
  observer: PrismaClient,
  userId: string,
  minWaiters: number,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const pollMs = options?.pollMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await countUserAdvisoryLockWaiters(observer, userId)) >= minWaiters) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `advisory lock waiters for ${userId} did not reach ${minWaiters} within ${timeoutMs}ms`,
  );
}

export async function waitUntilUserAdvisoryLockHeld(
  observer: PrismaClient,
  userId: string,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const pollMs = options?.pollMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted = true
        AND classid = ${IAM_USER_SESSION_WRITE_LOCK_CLASS}
        AND objid = hashtext(${userId}::text)
    `;
    if (Number(rows[0]?.count ?? 0n) > 0) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`user advisory lock not observed for ${userId}`);
}

/**
 * Holds user session advisory lock until `release()` is called (open transaction).
 */
export function holdUserSessionWriteLockTransaction(
  prisma: PrismaClient,
  userId: string,
): { completion: Promise<void>; release: () => void } {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const completion = prisma.$transaction(
    async (tx) => {
      await acquireUserSessionWriteLock(tx, userId);
      await released;
    },
    { maxWait: 120_000, timeout: 120_000 },
  );
  return { completion, release };
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