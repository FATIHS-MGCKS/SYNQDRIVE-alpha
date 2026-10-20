import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE } from './hv-charging-counter-evidence.pilot-provider-budget.v1';
import {
  finalizePilotProviderRequestBudgetV1,
  tryReservePilotProviderRequestBudgetV1,
} from './hv-charging-counter-evidence.pilot-provider-budget.persistence.v1';

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

async function createTenantVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `R22 pilot budget ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `PB${suffix}`.padEnd(17, '0'),
      licensePlate: `PB-${suffix}`,
      make: 'Tesla',
      model: 'M3',
      year: 2024,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
    select: { id: true },
  });
  return { org, vehicle };
}

const describePostgres = LIVE ? describe : describe.skip;

describePostgres('HvChargingCounter pilot provider budget (postgres)', () => {
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  const serviceA = prismaA as unknown as PrismaService;
  const serviceB = prismaB as unknown as PrismaService;

  beforeAll(async () => {
    if (!(await probeDatabase())) {
      throw new Error('DATABASE_URL must reach ephemeral PostgreSQL for pilot budget tests');
    }
  });

  afterAll(async () => {
    await prismaA.$disconnect().catch(() => undefined);
    await prismaB.$disconnect().catch(() => undefined);
  });

  it('allows exactly one atomic reservation per pilot epoch and session', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prismaA, suffix);
    const sessionId = randomUUID();
    const pilotEpoch = `epoch-${suffix}`;
    const now = new Date();

    const first = await tryReservePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionId,
      reservedAt: now,
    });
    const second = await tryReservePilotProviderRequestBudgetV1(serviceB, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionId,
      reservedAt: now,
    });

    expect(first).toEqual({
      status: 'reserved',
      lifecycleState: HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.REQUEST_STARTED,
    });
    expect(second.status).toBe('exhausted');
  });

  it('concurrent reservations: only one replica wins', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prismaA, suffix);
    const sessionId = randomUUID();
    const pilotEpoch = `epoch-concurrent-${suffix}`;
    const now = new Date();

    const [a, b] = await Promise.all([
      tryReservePilotProviderRequestBudgetV1(serviceA, {
        organizationId: org.id,
        vehicleId: vehicle.id,
        pilotEpoch,
        sourceHvChargeSessionId: sessionId,
        reservedAt: now,
      }),
      tryReservePilotProviderRequestBudgetV1(serviceB, {
        organizationId: org.id,
        vehicleId: vehicle.id,
        pilotEpoch,
        sourceHvChargeSessionId: sessionId,
        reservedAt: now,
      }),
    ]);

    const winners = [a, b].filter((r) => r.status === 'reserved');
    expect(winners).toHaveLength(1);
  });

  it('survives process restart: second client cannot re-reserve', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prismaA, suffix);
    const sessionId = randomUUID();
    const pilotEpoch = `epoch-restart-${suffix}`;
    const now = new Date();

    await tryReservePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionId,
      reservedAt: now,
    });

    const restarted = new PrismaClient();
    const restartedService = restarted as unknown as PrismaService;
    const retry = await tryReservePilotProviderRequestBudgetV1(restartedService, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionId,
      reservedAt: new Date(now.getTime() + 6 * 60 * 60 * 1000),
    });
    await restarted.$disconnect().catch(() => undefined);

    expect(retry.status).toBe('exhausted');
  });

  it('new pilot epoch allows a fresh reservation for the same session id', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prismaA, suffix);
    const sessionId = randomUUID();
    const now = new Date();

    const epochA = `epoch-a-${suffix}`;
    const epochB = `epoch-b-${suffix}`;

    const first = await tryReservePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch: epochA,
      sourceHvChargeSessionId: sessionId,
      reservedAt: now,
    });
    const secondEpoch = await tryReservePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch: epochB,
      sourceHvChargeSessionId: sessionId,
      reservedAt: now,
    });

    expect(first.status).toBe('reserved');
    expect(secondEpoch.status).toBe('reserved');
  });

  it('UNKNOWN_OUTCOME terminal state blocks further reservations in same epoch', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prismaA, suffix);
    const sessionId = randomUUID();
    const pilotEpoch = `epoch-unknown-${suffix}`;
    const now = new Date();

    await tryReservePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionId,
      reservedAt: now,
    });

    await finalizePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionId,
      lifecycleState: HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME,
      outcomeDetail: 'provider_timeout',
      terminalAt: now,
    });

    const retry = await tryReservePilotProviderRequestBudgetV1(serviceB, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionId,
      reservedAt: new Date(now.getTime() + 1),
    });

    expect(retry.status).toBe('exhausted');
    expect(retry.lifecycleState).toBe(
      HV_CHARGING_COUNTER_PILOT_PROVIDER_LIFECYCLE.UNKNOWN_OUTCOME,
    );
  });

  it('isolates budget per vehicle and session', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prismaA, suffix);
    const otherVehicle = await prismaA.vehicle.create({
      data: {
        organizationId: org.id,
        vin: `PB2${suffix}`.padEnd(17, '0'),
        licensePlate: `PB2-${suffix}`,
        make: 'Tesla',
        model: 'M3',
        year: 2024,
        fuelType: 'ELECTRIC',
        status: 'AVAILABLE',
      },
      select: { id: true },
    });

    const pilotEpoch = `epoch-scope-${suffix}`;
    const sessionA = randomUUID();
    const sessionB = randomUUID();
    const now = new Date();

    const a = await tryReservePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionA,
      reservedAt: now,
    });
    const otherVehicleReserve = await tryReservePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: otherVehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionA,
      reservedAt: now,
    });
    const otherSessionReserve = await tryReservePilotProviderRequestBudgetV1(serviceA, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      pilotEpoch,
      sourceHvChargeSessionId: sessionB,
      reservedAt: now,
    });

    expect(a.status).toBe('reserved');
    expect(otherVehicleReserve.status).toBe('reserved');
    expect(otherSessionReserve.status).toBe('reserved');
  });
});
