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

  it('rolls back trip row when global cap race is lost (no orphan reservation)', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const epoch = `epoch-race-${suffix}`;
    const fp = 'b'.repeat(64);
    const reservedAt = new Date();

    const prefill = await tryReserveStartProxyPilotProviderBudgetV1(service, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch: epoch,
      tripId: randomUUID(),
      queryFingerprint: fp,
      maxTotalAttempts: 1,
      maxRequestsPerTrip: 1,
      killSwitchActive: false,
      reservedAt,
    });
    expect(prefill.status).toBe('reserved');

    const loserTrip = randomUUID();
    const loser = await tryReserveStartProxyPilotProviderBudgetV1(service, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch: epoch,
      tripId: loserTrip,
      queryFingerprint: fp,
      maxTotalAttempts: 1,
      maxRequestsPerTrip: 1,
      killSwitchActive: false,
      reservedAt,
    });
    expect(loser).toMatchObject({ status: 'exhausted', reason: 'global_budget' });

    const orphanRows = await prisma.$queryRaw<Array<{ trip_id: string }>>`
      SELECT trip_id FROM battery_start_proxy_pilot_provider_requests
      WHERE pilot_epoch = ${epoch} AND trip_id = ${loserTrip}
    `;
    expect(orphanRows).toHaveLength(0);

    const globalRows = await prisma.$queryRaw<Array<{ total_attempts: number }>>`
      SELECT total_attempts FROM battery_start_proxy_pilot_global_budget
      WHERE pilot_epoch = ${epoch}
    `;
    expect(globalRows[0]?.total_attempts).toBe(1);
  });

  it('allows only one winner under concurrent reserve for maxTotalAttempts=1', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const epoch = `epoch-conc-${suffix}`;
    const fp = 'c'.repeat(64);
    const reservedAt = new Date();

    const outcomes = await Promise.all(
      [randomUUID(), randomUUID()].map((tripId) =>
        tryReserveStartProxyPilotProviderBudgetV1(service, {
          organizationId: org.id,
          vehicleId: vehicle.id,
          pilotEpoch: epoch,
          tripId,
          queryFingerprint: fp,
          maxTotalAttempts: 1,
          maxRequestsPerTrip: 1,
          killSwitchActive: false,
          reservedAt,
        }),
      ),
    );

    const reserved = outcomes.filter((o) => o.status === 'reserved');
    const exhausted = outcomes.filter((o) => o.status === 'exhausted');
    expect(reserved).toHaveLength(1);
    expect(exhausted).toHaveLength(1);
    expect(exhausted[0]).toMatchObject({ reason: 'global_budget' });

    const requestCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM battery_start_proxy_pilot_provider_requests
      WHERE pilot_epoch = ${epoch}
    `;
    expect(Number(requestCount[0]?.count ?? 0)).toBe(1);
  });
});
