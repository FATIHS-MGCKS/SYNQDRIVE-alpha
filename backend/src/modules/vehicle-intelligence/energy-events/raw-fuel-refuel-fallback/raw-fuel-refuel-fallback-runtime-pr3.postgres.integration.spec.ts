import { randomUUID } from 'crypto';
import { PrismaClient, FuelType } from '@prisma/client';
import {
  KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES,
  KS_MS_661_OBSERVED_DETECTION_WINDOW,
} from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-observed.fixture';
import {
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { EnergyEventsService } from '../energy-events.service';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { RawFuelRefuelFallbackRuntimeService } from './raw-fuel-refuel-fallback-runtime.service';
import { RawRefuelPromotionPreparationService } from './raw-refuel-promotion-preparation.service';
import {
  linearRiseSamples,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_FUEL_REFUEL_F4_PR3_INTEGRATION === '1';

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

function setRfrfFlags(master: boolean, persist: boolean): () => void {
  const prevMaster = process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV];
  const prevPersist = process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV];
  process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = master ? '1' : '0';
  process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = persist ? '1' : '0';
  return () => {
    if (prevMaster === undefined) delete process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV];
    else process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = prevMaster;
    if (prevPersist === undefined) delete process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV];
    else process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = prevPersist;
  };
}

function mapSamples(
  samples: ReturnType<typeof stablePlateauSamples>,
): Array<{ timestamp: Date; absoluteLiters: number | null; relativePercent: number | null }> {
  return samples.map((s) => ({
    timestamp: s.timestamp,
    absoluteLiters: s.absoluteLiters ?? null,
    relativePercent: s.relativePercent ?? null,
  }));
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string, tokenId = 910000 + Math.floor(Math.random() * 10000)) {
  const org = await prisma.organization.create({
    data: { companyName: `RFRF F4PR3 ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `dimo-f4pr3-${suffix}`,
      tokenId,
      fuelType: 'GASOLINE',
      powertrainType: 'ICE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `P3${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `P3-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: FuelType.GASOLINE,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, tokenId, dimoVehicleId: dimoVehicle.id };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, orgId: string, dimoVehicleId: string) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

async function countFallbackVee(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.vehicleEnergyEvent.count({
    where: { vehicleId, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
  });
}

async function countPromoted(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.rawRefuelCandidate.count({
    where: { vehicleId, lifecycleState: 'PROMOTED' },
  });
}

function buildService(
  prisma: PrismaClient,
  fetchFuelLevelSamples: jest.Mock,
  fetchEnergyEventSegments: jest.Mock,
) {
  const fetchFuelLevelSamplesWithOutcome = jest.fn(async (...args: unknown[]) => {
    try {
      const result = await fetchFuelLevelSamples(...args);
      if (result && typeof result === 'object' && 'status' in (result as Record<string, unknown>)) {
        return result;
      }
      return { status: 'SUCCESS', samples: result };
    } catch (error) {
      return {
        status: 'ERROR',
        samples: [],
        errorClass: 'PROVIDER_QUERY_FAILED',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const dimoSegments = { fetchFuelLevelSamples, fetchFuelLevelSamplesWithOutcome, fetchEnergyEventSegments };
  const candidateService = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-06T10:00:00.000Z',
  );
  const promotionPreparation = new RawRefuelPromotionPreparationService(
    prisma as unknown as PrismaService,
  );
  const rawRuntime = new RawFuelRefuelFallbackRuntimeService(
    dimoSegments as never,
    candidateService,
    promotionPreparation,
  );
  return new EnergyEventsService(
    prisma as unknown as PrismaService,
    dimoSegments as never,
    undefined,
    undefined,
    undefined,
    rawRuntime,
  );
}

function syntheticRiseSamples() {
  return mapSamples([
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ]);
}

function ksMs661Samples() {
  return KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES.map((s) => ({
    timestamp: new Date(s.timestamp),
    absoluteLiters: s.absoluteLiters ?? null,
    relativePercent: s.relativePercent ?? null,
  }));
}

(LIVE ? describe : describe.skip)(
  'RFRF F4-PR3 ready/promotion gate (RAW_FUEL_REFUEL_F4_PR3_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('RAW_FUEL_REFUEL_F4_PR3_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('A — OBSERVED maturation path evaluates readiness without VEE', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const service = buildService(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
          jest.fn().mockResolvedValue({ segments: [], outcomes: [] }),
        );
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.rawFuelFallback?.promotionPreparationAttempted).toBeGreaterThan(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('B — identical replay preserves promotion identity', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const service = buildService(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
          jest.fn().mockResolvedValue({ segments: [], outcomes: [] }),
        );
        const window = {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        };
        const first = await service.detectEnergyEvents(vehicle.id, window);
        const second = await service.detectEnergyEvents(vehicle.id, window);
        const draftKeys = [
          ...(first.rawFuelFallback?.candidateOutcomes ?? []),
          ...(second.rawFuelFallback?.candidateOutcomes ?? []),
        ]
          .map((o) => o.promotionPreparation?.promotionDraft?.sourceEventKey)
          .filter(Boolean);
        expect(new Set(draftKeys).size).toBeLessThanOrEqual(1);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('D — two distinct refuels => two identities', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
          ...stablePlateauSamples('2026-09-06T10:00:00.000Z', 20, 3, 300),
          ...linearRiseSamples('2026-09-06T10:16:00.000Z', [25, 32, 38, 40], 120),
          ...stablePlateauSamples('2026-09-06T10:28:00.000Z', 40, 4, 120),
        ]);
        const service = buildService(
          prisma,
          jest.fn().mockResolvedValue(samples),
          jest.fn().mockResolvedValue({ segments: [], outcomes: [] }),
        );
        await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        const keys = await prisma.rawRefuelCandidate.findMany({
          where: { vehicleId: vehicle.id },
          select: { candidateIdentityKey: true },
        });
        expect(keys.filter((k) => k.candidateIdentityKey).length).toBe(2);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('K/L — READY + F5 gate absent => draft may exist, zero fallback VEE', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const service = buildService(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
          jest.fn().mockResolvedValue({ segments: [], outcomes: [] }),
        );
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.rawFuelFallback?.promotionBlockedByF5Gate).toBeGreaterThan(0);
        for (const outcome of result.rawFuelFallback?.candidateOutcomes ?? []) {
          expect(outcome.promotionPreparation?.canCreateFallbackVehicleEnergyEvent).toBe(false);
        }
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('M — persist flag ON cannot authorize VEE', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const service = buildService(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
          jest.fn().mockResolvedValue({ segments: [], outcomes: [] }),
        );
        await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('Q — KS MS 661 absolute-only path reaches F4 pre-promotion without VEE', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const service = buildService(
          prisma,
          jest.fn().mockResolvedValue(ksMs661Samples()),
          jest.fn().mockResolvedValue({ segments: [], outcomes: [] }),
        );
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
          to: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
        });
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(result.rawFuelFallback?.promotionPreparationAttempted).toBeGreaterThan(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('R — provider sample error with native success leaves native intact', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, tokenId, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const refuelSegment = {
          segmentId: `dimo-native-${suffix}`,
          mechanism: 'refuel' as const,
          startTime: '2026-09-06T08:10:00.000Z',
          endTime: '2026-09-06T08:25:00.000Z',
          isOngoing: false,
          startedBeforeRange: false,
          durationSeconds: 900,
          startLatitude: 51.31,
          startLongitude: 9.49,
          endLatitude: 51.31,
          endLongitude: 9.49,
          odometerStartKm: 12000,
          odometerEndKm: 12000,
          fuelStartLiters: 10,
          fuelEndLiters: 30,
          fuelDeltaLiters: 20,
          fuelStartPercent: 20,
          fuelEndPercent: 50,
          fuelDeltaPercent: 30,
          socStartPercent: null,
          socEndPercent: null,
          socDeltaPercent: null,
          energyDeltaKwh: null,
        };
        let fuelCalls = 0;
        const fetchFuel = jest.fn().mockImplementation(async () => {
          fuelCalls += 1;
          if (fuelCalls === 1) return [];
          throw new Error('provider down');
        });
        const fetchSegments = jest.fn().mockResolvedValue({
          tokenId,
          segments: [refuelSegment],
          outcomes: [
            {
              mechanism: 'refuel',
              status: 'SUCCESS_WITH_EVENTS',
              segments: [refuelSegment],
              windowFrom: '2026-09-06T07:00:00.000Z',
              windowTo: '2026-09-06T12:00:00.000Z',
            },
            {
              mechanism: 'recharge',
              status: 'SUCCESS_EMPTY',
              segments: [],
              windowFrom: '2026-09-06T07:00:00.000Z',
              windowTo: '2026-09-06T12:00:00.000Z',
            },
          ],
        });
        const service = buildService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.created).toBe(1);
        expect(result.rawFuelFallback?.skipReason).toBe('sample_fetch_failed');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);
