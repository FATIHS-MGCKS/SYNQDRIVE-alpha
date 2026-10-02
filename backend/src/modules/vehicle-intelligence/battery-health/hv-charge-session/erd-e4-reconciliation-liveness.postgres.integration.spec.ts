import { randomUUID } from 'crypto';
import { FuelType, PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { getBatteryV2ReconciliationIntervalMs } from '@config/battery-health-v2.config';
import {
  fetchHvRechargePeriodicReconcileTargets,
  fetchHvRechargePeriodicTargetCandidates,
} from './hv-recharge-reconcile-target.query';
import {
  computeHvRechargePeriodicMaxWaitBoundTicks,
} from './hv-recharge-periodic-target.policy';
import {
  HV_ERD_SOC_SIGNAL_KEY,
} from './hv-erd-reconcile-eligibility.policy';
import { HV_ERD_SIGNAL_KEYS } from '../hv-erd-capability-signal-keys';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2HvFallbackChargeSessionEnabled: () => true,
    isBatteryV2HvRechargeSessionEnabled: () => true,
  };
});

const LIVE = process.env.ERD_E4_POSTGRES_REDIS_INTEGRATION === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function seedVehicle(prisma: PrismaClient, suffix: string, fuelType: FuelType) {
  const org = await prisma.organization.create({
    data: {
      companyName: `ERD E4 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });
  const dimo = await prisma.dimoVehicle.create({
    data: {
      externalId: `erd-e4-${suffix}-${randomUUID()}`,
      tokenId: Math.floor(Math.random() * 900_000) + 100_000,
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimo.id,
      vin: `E4${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E4-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'ERD',
      year: 2024,
      fuelType,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, dimo };
}

async function upsertCap(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  signalKey: string,
) {
  await prisma.vehicleBatteryCapability.upsert({
    where: {
      vehicleId_signalKey: { vehicleId, signalKey },
    },
    create: {
      organizationId,
      vehicleId,
      signalKey,
      status: 'AVAILABLE',
      checkedAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      status: 'AVAILABLE',
      checkedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}

async function cleanupFleet(
  prisma: PrismaClient,
  ids: { orgIds: string[]; dimoIds: string[]; vehicleIds: string[] },
) {
  for (const id of ids.vehicleIds) {
    await prisma.vehicleBatteryCapability.deleteMany({ where: { vehicleId: id } });
    await prisma.hvChargeSession.deleteMany({ where: { vehicleId: id } });
    await prisma.vehicle.deleteMany({ where: { id } });
  }
  for (const id of ids.dimoIds) {
    await prisma.dimoVehicle.deleteMany({ where: { id } });
  }
  for (const id of ids.orgIds) {
    await prisma.organization.deleteMany({ where: { id } });
  }
}

(LIVE ? describe : describe.skip)(
  'ERD E4 reconciliation liveness PostgreSQL gate',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('ERD_E4_POSTGRES_REDIS_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('selects SOC+cable fallback vehicle without hv.is_charging', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimo } = await seedVehicle(prisma, suffix, FuelType.ELECTRIC);
      await upsertCap(prisma, org.id, vehicle.id, HV_ERD_SOC_SIGNAL_KEY);
      await upsertCap(prisma, org.id, vehicle.id, HV_ERD_SIGNAL_KEYS.cableConnected);

      const candidates = await fetchHvRechargePeriodicTargetCandidates(
        prisma as unknown as PrismaService,
        20,
      );
      expect(candidates.some((c) => c.vehicleId === vehicle.id)).toBe(true);

      await cleanupFleet(prisma, {
        orgIds: [org.id],
        dimoIds: [dimo.id],
        vehicleIds: [vehicle.id],
      });
    });

    it('selects SOC+hv.charging_power and rejects SOC+hv.current_power only', async () => {
      const suffix = randomUUID().slice(0, 6);
      const charging = await seedVehicle(prisma, `${suffix}-cp`, FuelType.ELECTRIC);
      const currentOnly = await seedVehicle(prisma, `${suffix}-cur`, FuelType.ELECTRIC);
      await upsertCap(prisma, charging.org.id, charging.vehicle.id, HV_ERD_SOC_SIGNAL_KEY);
      await upsertCap(prisma, charging.org.id, charging.vehicle.id, HV_ERD_SIGNAL_KEYS.chargingPower);
      await upsertCap(prisma, currentOnly.org.id, currentOnly.vehicle.id, HV_ERD_SOC_SIGNAL_KEY);
      await upsertCap(prisma, currentOnly.org.id, currentOnly.vehicle.id, HV_ERD_SIGNAL_KEYS.currentPower);

      const candidates = await fetchHvRechargePeriodicTargetCandidates(
        prisma as unknown as PrismaService,
        50,
      );
      expect(candidates.some((c) => c.vehicleId === charging.vehicle.id)).toBe(true);
      expect(candidates.some((c) => c.vehicleId === currentOnly.vehicle.id)).toBe(false);

      await cleanupFleet(prisma, {
        orgIds: [charging.org.id, currentOnly.org.id],
        dimoIds: [charging.dimo.id, currentOnly.dimo.id],
        vehicleIds: [charging.vehicle.id, currentOnly.vehicle.id],
      });
    });

    it('bounded DB fairness covers >3× old maxScan fleet without global truncation', async () => {
      const batch = 3;
      const oldMaxScan = batch * 12;
      const fleetSize = oldMaxScan * 3 + 1;
      expect(fleetSize).toBeGreaterThan(3 * oldMaxScan);

      const suffix = randomUUID().slice(0, 5);
      const orgIds: string[] = [];
      const dimoIds: string[] = [];
      const vehicleIds: string[] = [];

      for (let i = 0; i < fleetSize; i += 1) {
        const { org, vehicle, dimo } = await seedVehicle(
          prisma,
          `${suffix}-${i}`,
          FuelType.ELECTRIC,
        );
        orgIds.push(org.id);
        dimoIds.push(dimo.id);
        vehicleIds.push(vehicle.id);
        await upsertCap(prisma, org.id, vehicle.id, HV_ERD_SOC_SIGNAL_KEY);
        await upsertCap(prisma, org.id, vehicle.id, HV_ERD_SIGNAL_KEYS.addedEnergy);
      }

      const allEligible = await fetchHvRechargePeriodicTargetCandidates(
        prisma as unknown as PrismaService,
        batch,
      );
      const ours = allEligible.filter((c) => vehicleIds.includes(c.vehicleId));
      expect(ours.length).toBe(fleetSize);

      const intervalMs = getBatteryV2ReconciliationIntervalMs();
      const maxWait = computeHvRechargePeriodicMaxWaitBoundTicks({
        eligibleCount: fleetSize,
        batchSize: batch,
      });
      const seen = new Set<string>();
      const base = Date.parse('2026-09-24T00:00:00.000Z');

      for (let tick = 0; tick < maxWait; tick += 1) {
        const selected = await fetchHvRechargePeriodicReconcileTargets(
          prisma as unknown as PrismaService,
          batch,
          new Date(base + tick * intervalMs),
        );
        for (const row of selected) {
          if (vehicleIds.includes(row.vehicleId)) {
            seen.add(row.vehicleId);
          }
        }
      }

      expect(seen.size).toBe(fleetSize);

      await cleanupFleet(prisma, { orgIds, dimoIds, vehicleIds });
    }, 120_000);

    it('restart at same periodIndex yields identical bounded selection', async () => {
      const suffix = randomUUID().slice(0, 6);
      const { org, vehicle, dimo } = await seedVehicle(prisma, suffix, FuelType.ELECTRIC);
      await upsertCap(prisma, org.id, vehicle.id, HV_ERD_SOC_SIGNAL_KEY);
      await upsertCap(prisma, org.id, vehicle.id, HV_ERD_SIGNAL_KEYS.chargingPower);
      const at = new Date('2026-09-24T08:00:00.000Z');
      const svc = prisma as unknown as PrismaService;
      const first = await fetchHvRechargePeriodicReconcileTargets(svc, 5, at);
      const second = await fetchHvRechargePeriodicReconcileTargets(svc, 5, at);
      expect(second).toEqual(first);

      await cleanupFleet(prisma, {
        orgIds: [org.id],
        dimoIds: [dimo.id],
        vehicleIds: [vehicle.id],
      });
    });
  },
);
