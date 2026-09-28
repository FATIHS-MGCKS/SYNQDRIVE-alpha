import { randomUUID } from 'crypto';
import { FuelType, PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelPromotionPreparationService } from './raw-refuel-promotion-preparation.service';
import { buildKsMx20240916StaleBaselineCandidate } from './testing/wob-2026-09-19-stretched-end.fixture';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';
import { buildKsMx20260916FreshPre5Samples } from './testing/ks-mx-2026-09-16-baseline-recency.fixture';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';

const LIVE = process.env.RAW_FUEL_REFUEL_BASELINE_RECENCY_INTEGRATION === '1';

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

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: { companyName: `BLR ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `dimo-blr-${suffix}`,
      tokenId: 940000 + Math.floor(Math.random() * 10000),
      fuelType: 'GASOLINE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `BL${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `BL-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: FuelType.GASOLINE,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, dimoVehicleId: dimoVehicle.id };
}

async function cleanup(
  prisma: PrismaClient,
  vehicleId: string,
  orgId: string,
  dimoVehicleId: string,
) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

(LIVE ? describe : describe.skip)(
  'RFRF baseline recency promotion firewall (RAW_FUEL_REFUEL_BASELINE_RECENCY_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let preparation: RawRefuelPromotionPreparationService;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('RAW_FUEL_REFUEL_BASELINE_RECENCY_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
      preparation = new RawRefuelPromotionPreparationService(prisma as unknown as PrismaService);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('stale KS-MX-shaped READY without recency proof cannot promote', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const stale = buildKsMx20240916StaleBaselineCandidate({
          vehicleId: vehicle.id,
          organizationId: org.id,
          evidenceMeta: {},
        });
        await prisma.rawRefuelCandidate.create({ data: stale as never });
        const result = await preparation.preparePromotionById(stale.id, {
          capability: 'FUEL_CAPABLE',
          absoluteSignalTrust: 'TRUSTED',
        });
        expect(result?.eligibility.status).toBe('BLOCKED_BASELINE_RECENCY');
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('fresh-baseline READY passes recency gate but remains trust-blocked', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const partial = detectRawFuelRises({
          context: buildDetectorPhysicsContext({
            organizationId: org.id,
            vehicleId: vehicle.id,
            scanWindowStart: new Date('2026-09-16T10:00:00.000Z'),
            scanWindowEnd: new Date('2026-09-16T22:00:00.000Z'),
          }),
          samples: buildKsMx20260916FreshPre5Samples(),
        });
        const service = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          '2026-09-16T21:00:00.000Z',
        );
        const resolved = await service.resolveOrCreateCandidate({
          ...partial.candidates[0],
          organizationId: org.id,
          vehicleId: vehicle.id,
        });
        await prisma.rawRefuelCandidate.update({
          where: { id: resolved.candidateId },
          data: { lifecycleState: 'READY_FOR_PERSIST' },
        });
        const result = await preparation.preparePromotionById(resolved.candidateId, {
          capability: 'FUEL_CAPABLE',
          absoluteSignalTrust: 'UNKNOWN',
        });
        expect(result?.eligibility.status).toBe('BLOCKED_PROMOTION_TRUST');
        expect(result?.eligibility.status).not.toBe('BLOCKED_BASELINE_RECENCY');
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);
