import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  finalizeStartProxyPilotProviderBudgetV1,
  tryReserveStartProxyPilotProviderBudgetV1,
} from './start-proxy-pilot-provider-budget.persistence.v1';
import { START_PROXY_PILOT_PROVIDER_LIFECYCLE } from './start-proxy-pilot-provider-budget.v1';

const LIVE = process.env.BATTERY_V2_START_PROXY_PILOT_INTEGRATION === '1';

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

async function createTenantVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `P4C start proxy pilot ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `SP${suffix}`.padEnd(17, '0'),
      licensePlate: `SP-${suffix}`,
      make: 'VW',
      model: 'Tiguan',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true },
  });
  return { org, vehicle };
}

const describePostgres = LIVE ? describe : describe.skip;

describePostgres('start-proxy pilot provider budget (postgres)', () => {
  const prisma = new PrismaClient();
  const service = prisma as unknown as PrismaService;

  beforeAll(async () => {
    if (!(await probeDatabase())) {
      throw new Error('DATABASE_URL must reach PostgreSQL for start-proxy pilot budget tests');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

  it('enforces per-trip duplicate and global cap', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const epoch = `epoch-${suffix}`;
    const tripA = randomUUID();
    const tripB = randomUUID();
    const fp = 'a'.repeat(64);

    const first = await tryReserveStartProxyPilotProviderBudgetV1(service, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch: epoch,
      tripId: tripA,
      queryFingerprint: fp,
      maxTotalAttempts: 1,
      maxRequestsPerTrip: 1,
      killSwitchActive: false,
      reservedAt: new Date(),
    });
    expect(first.status).toBe('reserved');

    const dup = await tryReserveStartProxyPilotProviderBudgetV1(service, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch: epoch,
      tripId: tripA,
      queryFingerprint: fp,
      maxTotalAttempts: 1,
      maxRequestsPerTrip: 1,
      killSwitchActive: false,
      reservedAt: new Date(),
    });
    expect(dup).toMatchObject({ status: 'exhausted', reason: 'per_trip_duplicate' });

    await finalizeStartProxyPilotProviderBudgetV1(service, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch: epoch,
      tripId: tripA,
      lifecycleState: START_PROXY_PILOT_PROVIDER_LIFECYCLE.COMPLETED,
      terminalAt: new Date(),
    });

    const secondTrip = await tryReserveStartProxyPilotProviderBudgetV1(service, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch: epoch,
      tripId: tripB,
      queryFingerprint: fp,
      maxTotalAttempts: 1,
      maxRequestsPerTrip: 1,
      killSwitchActive: false,
      reservedAt: new Date(),
    });
    expect(secondTrip).toMatchObject({ status: 'exhausted', reason: 'global_budget' });
  });
});
