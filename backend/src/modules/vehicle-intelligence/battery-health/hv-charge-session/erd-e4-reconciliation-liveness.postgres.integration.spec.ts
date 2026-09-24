import { randomUUID } from 'crypto';
import { FuelType, PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { fetchHvRechargePeriodicTargetCandidates } from './hv-recharge-reconcile-target.query';
import { selectFairPeriodicReconcileTargets } from './hv-recharge-periodic-target.policy';
import { buildHvRechargePeriodicPeriodBucket } from './hv-recharge-session-reconcile.policy';
import { HV_ERD_SOC_SIGNAL_KEY } from './hv-erd-reconcile-eligibility.policy';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2HvFallbackChargeSessionEnabled: () => true,
  isBatteryV2HvRechargeSessionEnabled: () => true,
}));

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
      await upsertCap(prisma, org.id, vehicle.id, 'hv.cable_connected');

      const candidates = await fetchHvRechargePeriodicTargetCandidates(
        prisma as unknown as PrismaService,
        20,
      );
      expect(candidates.some((c) => c.vehicleId === vehicle.id)).toBe(true);

      await prisma.vehicleBatteryCapability.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimo.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    });

    it('fairness: >3× batch candidates all selected across rotating buckets', async () => {
      const batch = 3;
      const suffix = randomUUID().slice(0, 6);
      const ids: string[] = [];
      const orgIds: string[] = [];
      const dimoIds: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const { org, vehicle, dimo } = await seedVehicle(
          prisma,
          `${suffix}-${i}`,
          FuelType.ELECTRIC,
        );
        orgIds.push(org.id);
        dimoIds.push(dimo.id);
        ids.push(vehicle.id);
        await upsertCap(prisma, org.id, vehicle.id, HV_ERD_SOC_SIGNAL_KEY);
        await upsertCap(prisma, org.id, vehicle.id, 'hv.added_energy');
      }

      const candidates = await fetchHvRechargePeriodicTargetCandidates(
        prisma as unknown as PrismaService,
        batch,
      );
      const ours = candidates.filter((c) => ids.includes(c.vehicleId));
      expect(ours.length).toBeGreaterThanOrEqual(10);

      const seen = new Set<string>();
      const base = new Date('2026-07-16T12:00:00.000Z');
      for (let i = 0; i < 24; i += 1) {
        const at = new Date(base.getTime() + i * 60_000);
        const bucket = buildHvRechargePeriodicPeriodBucket(at);
        const selected = selectFairPeriodicReconcileTargets(ours, batch, bucket);
        for (const row of selected) seen.add(row.vehicleId);
      }
      expect(seen.size).toBe(ours.length);

      for (const id of ids) {
        await prisma.vehicleBatteryCapability.deleteMany({ where: { vehicleId: id } });
        await prisma.vehicle.deleteMany({ where: { id } });
      }
      for (const id of dimoIds) {
        await prisma.dimoVehicle.deleteMany({ where: { id } });
      }
      for (const id of orgIds) {
        await prisma.organization.deleteMany({ where: { id } });
      }
    });
  },
);
