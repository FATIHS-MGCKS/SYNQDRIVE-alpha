import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  releaseHvChargingCounterProviderRequestGuardV1,
  tryAcquireHvChargingCounterProviderRequestGuardV1,
} from './hv-charging-counter-evidence.provider-request-guard.v1';

const LIVE = process.env.BATTERY_V2_HV_CHARGING_COUNTER_INTEGRATION === '1';

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

const describePostgres = LIVE ? describe : describe.skip;

describePostgres('HvChargingCounter provider request guard (postgres)', () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;

  beforeAll(async () => {
    if (!(await probeDatabase())) {
      throw new Error('DATABASE_URL must reach PostgreSQL for R22 guard integration tests');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

  it('allows only one concurrent replica lock per vehicle', async () => {
    const vehicleId = randomUUID();
    const first = await tryAcquireHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    const second = await tryAcquireHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    expect(first).toBe(true);
    expect(second).toBe(false);
    await releaseHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    const third = await tryAcquireHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    expect(third).toBe(true);
    await releaseHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
  });

  it('dual-replica simulation: second replica gets guard_busy outcome path', async () => {
    const vehicleId = randomUUID();
    const replicaA = await tryAcquireHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    const replicaB = await tryAcquireHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    expect(replicaA).toBe(true);
    expect(replicaB).toBe(false);
    await releaseHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
  });
});
