import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  releaseHvChargingCounterProviderRequestGuardV1,
  runWithHvChargingCounterProviderRequestGuardV1,
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

  it('unpinned pool acquire is not exclusive (documents pooling hazard)', async () => {
    const vehicleId = randomUUID();
    const first = await tryAcquireHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    const second = await tryAcquireHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    expect(first).toBe(true);
    expect(second).toBe(true);
    await releaseHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
    await releaseHvChargingCounterProviderRequestGuardV1(prismaService, vehicleId);
  });

  it('runWith releases lock after guarded work completes', async () => {
    const vehicleId = randomUUID();
    const first = await runWithHvChargingCounterProviderRequestGuardV1(
      prismaService,
      vehicleId,
      async () => 'first',
    );
    const second = await runWithHvChargingCounterProviderRequestGuardV1(
      prismaService,
      vehicleId,
      async () => 'second',
    );
    expect(first).toEqual({ status: 'ok', value: 'first' });
    expect(second).toEqual({ status: 'ok', value: 'second' });
  });

  it('two independent Prisma pools: runWith pins connection during guarded work', async () => {
    const vehicleId = randomUUID();
    const prismaB = new PrismaClient();
    const prismaBService = prismaB as unknown as PrismaService;

    const holdMs = 300;
    const first = runWithHvChargingCounterProviderRequestGuardV1(
      prismaService,
      vehicleId,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, holdMs));
        return 'replica-a';
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = await runWithHvChargingCounterProviderRequestGuardV1(
      prismaBService,
      vehicleId,
      async () => 'replica-b',
    );

    expect(await first).toEqual({ status: 'ok', value: 'replica-a' });
    expect(second).toEqual({ status: 'busy' });

    await prismaB.$disconnect().catch(() => undefined);
  });
});
