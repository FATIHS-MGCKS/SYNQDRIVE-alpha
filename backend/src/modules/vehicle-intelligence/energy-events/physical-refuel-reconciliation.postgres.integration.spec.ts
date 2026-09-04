import { PrismaClient } from '@prisma/client';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { buildPhysicalRefuelReconciliationLockKey } from './physical-refuel-reconciliation.design';

const LIVE = process.env.PHYSICAL_REFUEL_RECONCILIATION_POSTGRES_INTEGRATION === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

(LIVE ? describe : describe.skip)(
  'Physical refuel reconciliation PostgreSQL advisory lock (DATABASE_URL)',
  () => {
    let prismaA: PrismaClient;
    let prismaB: PrismaClient;
    const vehicleId = 'pg-lock-test-vehicle';
    const lockKey = buildPhysicalRefuelReconciliationLockKey(vehicleId);

    beforeAll(async () => {
      const ok = await probeDatabase();
      if (!ok) {
        throw new Error(
          'PHYSICAL_REFUEL_RECONCILIATION_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL',
        );
      }
      prismaA = new PrismaClient();
      prismaB = new PrismaClient();
    }, 60_000);

    afterAll(async () => {
      await prismaA?.$disconnect().catch(() => undefined);
      await prismaB?.$disconnect().catch(() => undefined);
    });

    it('serializes two concurrent transactions on the same vehicle lock key', async () => {
      const order: string[] = [];

      const hold = prismaA.$transaction(async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, lockKey);
        order.push('A-acquired');
        await new Promise((resolve) => setTimeout(resolve, 300));
        order.push('A-release');
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const wait = prismaB.$transaction(async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, lockKey);
        order.push('B-acquired');
      });

      await Promise.all([hold, wait]);
      expect(order.indexOf('A-acquired')).toBeLessThan(order.indexOf('B-acquired'));
      expect(order.indexOf('A-release')).toBeLessThan(order.indexOf('B-acquired'));
    });

    it('allows different vehicle lock keys in parallel', async () => {
      const keyB = buildPhysicalRefuelReconciliationLockKey('other-vehicle');
      const started: string[] = [];

      await Promise.all([
        prismaA.$transaction(async (tx) => {
          await acquirePgAdvisoryXactLock64(tx, lockKey);
          started.push('A');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }),
        prismaB.$transaction(async (tx) => {
          await acquirePgAdvisoryXactLock64(tx, keyB);
          started.push('B');
        }),
      ]);

      expect(started).toContain('A');
      expect(started).toContain('B');
    });
  },
);
