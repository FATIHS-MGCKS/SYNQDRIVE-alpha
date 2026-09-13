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

const LIVE = process.env.RAW_FUEL_REFUEL_F4_PR2_INTEGRATION === '1';

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

async function seedOrgVehicle(
  prisma: PrismaClient,
  suffix: string,
  tokenId = 900000 + Math.floor(Math.random() * 10000),
  options: {
    fuelType?: FuelType;
    dimoPowertrainType?: string;
    dimoFuelType?: string;
  } = {},
) {
  const fuelType = options.fuelType ?? FuelType.GASOLINE;
  const org = await prisma.organization.create({
    data: {
      companyName: `RFRF F4PR2 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `dimo-f4pr2-${suffix}`,
      tokenId,
      fuelType: options.dimoFuelType ?? 'GASOLINE',
      powertrainType: options.dimoPowertrainType ?? 'ICE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `F4${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `F4-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, tokenId, dimoVehicleId: dimoVehicle.id };
}

function syntheticTwoRefuelSamples() {
  return mapSamples([
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
    ...stablePlateauSamples('2026-09-06T10:00:00.000Z', 20, 3, 300),
    ...linearRiseSamples('2026-09-06T10:16:00.000Z', [25, 32, 38, 40], 120),
    ...stablePlateauSamples('2026-09-06T10:28:00.000Z', 40, 4, 120),
  ]);
}

function nativeRefuelOutcome(refuelSegment: { segmentId: string; startTime: string; endTime: string }) {
  return {
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
  };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, orgId: string, dimoVehicleId: string) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

function buildEnergyEventsService(
  prisma: PrismaClient,
  fetchFuelLevelSamples: jest.Mock,
  fetchEnergyEventSegments: jest.Mock,
) {
  const fetchFuelLevelSamplesWithOutcome = jest.fn(async (...args: unknown[]) => {
    try {
      const result = await fetchFuelLevelSamples(...args);
      if (
        result &&
        typeof result === 'object' &&
        'status' in (result as Record<string, unknown>)
      ) {
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
  const dimoSegments = {
    fetchFuelLevelSamples,
    fetchFuelLevelSamplesWithOutcome,
    fetchEnergyEventSegments,
  };
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

(LIVE ? describe : describe.skip)(
  'RFRF F4-PR2 dark runtime (RAW_FUEL_REFUEL_F4_PR2_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('RAW_FUEL_REFUEL_F4_PR2_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('A — identical replay yields one RawRefuelCandidate', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ]);
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const window = {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        };
        await service.detectEnergyEvents(vehicle.id, window);
        await service.detectEnergyEvents(vehicle.id, window);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('B — overlapping window replay same physical candidate', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ]);
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T08:00:00.000Z'),
          to: new Date('2026-09-06T09:00:00.000Z'),
        });
        await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('E — concurrent same refuel one row', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ]);
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const window = {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        };
        await Promise.all([
          service.detectEnergyEvents(vehicle.id, window),
          service.detectEnergyEvents(vehicle.id, window),
        ]);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('I — two distinct raw refuels two candidates', async () => {
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
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(2);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('J — master off zero raw DB writes', async () => {
      const restore = setRfrfFlags(false, false);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ]);
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.rawFuelFallback?.skipReason).toBe('master_disabled');
        expect(fetchFuel).not.toHaveBeenCalled();
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('K — master on persist off zero candidate writes', async () => {
      const restore = setRfrfFlags(true, false);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ]);
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.rawFuelFallback?.observationsEmitted).toBe(1);
        expect(result.rawFuelFallback?.persistSkippedBecauseFlagOff).toBe(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('O — KS MS 661 observed one candidate zero VEE', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES.map((row) => ({
          timestamp: new Date(row.timestamp),
          absoluteLiters: row.absoluteLiters,
          relativePercent: row.relativePercent,
        }));
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
          to: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
        });
        expect(result.rawFuelFallback?.observationsEmitted).toBeGreaterThanOrEqual(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(0);
        const row = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId: vehicle.id } });
        expect(row?.absoluteSignalTrust).toBe('UNKNOWN');
        const qm = row?.qualityMeta as Record<string, unknown> | null;
        expect(qm?.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('C — delayed telemetry rediscovers same candidate', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const partial = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ]);
        const full = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 6, 120),
        ]);
        let call = 0;
        const fetchFuel = jest.fn().mockImplementation(async () => {
          call += 1;
          return call === 1 ? partial : full;
        });
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const window = {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        };
        await service.detectEnergyEvents(vehicle.id, window);
        await service.detectEnergyEvents(vehicle.id, window);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('D — evidence revision may change without identity mutation', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const narrow = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 2, 120),
        ]);
        const expanded = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 8, 120),
        ]);
        let call = 0;
        const fetchFuel = jest.fn().mockImplementation(async () => {
          call += 1;
          return call === 1 ? narrow : expanded;
        });
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const window = {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        };
        await service.detectEnergyEvents(vehicle.id, window);
        const first = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId: vehicle.id } });
        await service.detectEnergyEvents(vehicle.id, window);
        const second = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId: vehicle.id } });
        expect(first?.candidateIdentityKey).toBeTruthy();
        expect(second?.candidateIdentityKey).toBe(first?.candidateIdentityKey);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('F — independent vehicles parallel without cross-vehicle bleed', async () => {
      const restore = setRfrfFlags(true, true);
      const suffixA = randomUUID().slice(0, 8);
      const suffixB = randomUUID().slice(0, 8);
      const seededA = await seedOrgVehicle(prisma, suffixA);
      const seededB = await seedOrgVehicle(prisma, suffixB);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ]);
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const serviceA = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const serviceB = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const window = {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        };
        await Promise.all([
          serviceA.detectEnergyEvents(seededA.vehicle.id, window),
          serviceB.detectEnergyEvents(seededB.vehicle.id, window),
        ]);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: seededA.vehicle.id } })).toBe(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: seededB.vehicle.id } })).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, seededA.vehicle.id, seededA.org.id, seededA.dimoVehicleId);
        await cleanup(prisma, seededB.vehicle.id, seededB.org.id, seededB.dimoVehicleId);
      }
    });

    it('G — native and raw branches coexist in one window with zero fallback VEE', async () => {
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
        const samples = syntheticTwoRefuelSamples();
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({
          tokenId,
          ...nativeRefuelOutcome(refuelSegment),
        });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.created).toBe(1);
        expect(result.rawFuelFallback?.observationsEmitted).toBeGreaterThanOrEqual(1);
        expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBeGreaterThanOrEqual(1);
        for (const vee of await prisma.vehicleEnergyEvent.findMany({ where: { vehicleId: vehicle.id } })) {
          expect(vee.detectionSource).toBeNull();
          expect(vee.sourceEventKey).toBeNull();
        }
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('H — native A does not suppress missed raw B staging', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, tokenId, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const refuelSegment = {
          segmentId: `dimo-native-a-${suffix}`,
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
        const samples = syntheticTwoRefuelSamples();
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({
          tokenId,
          ...nativeRefuelOutcome(refuelSegment),
        });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.created).toBe(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(2);
        expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('L — master on persist on writes candidates and zero fallback VEE', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ]);
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.rawFuelFallback?.candidatesCreated).toBe(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('M — raw branch failure after native success preserves native VEE', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, tokenId, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const refuelSegment = {
          segmentId: `dimo-native-m-${suffix}`,
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
          throw new Error('raw fetch failed');
        });
        const fetchSegments = jest.fn().mockResolvedValue({
          tokenId,
          ...nativeRefuelOutcome(refuelSegment),
        });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.created).toBe(1);
        expect(result.rawFuelFallback?.skipReason).toBe('sample_fetch_failed');
        expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('N — capability UNKNOWN fail-closed with native path unaffected', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, tokenId, dimoVehicleId } = await seedOrgVehicle(prisma, suffix, undefined, {
        fuelType: FuelType.OTHER,
      });
      try {
        const refuelSegment = {
          segmentId: `dimo-native-n-${suffix}`,
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
        const fetchFuel = jest.fn().mockResolvedValue([]);
        const fetchSegments = jest.fn().mockResolvedValue({
          tokenId,
          ...nativeRefuelOutcome(refuelSegment),
        });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        const result = await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(result.created).toBe(1);
        expect(result.rawFuelFallback?.skipReason).toBe('capability_unknown');
        expect(fetchFuel).toHaveBeenCalledTimes(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('F3/F2 tolerance — window expansion one identity', async () => {
      const restore = setRfrfFlags(true, true);
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const samples = mapSamples([
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ]);
        const fetchFuel = jest.fn().mockResolvedValue(samples);
        const fetchSegments = jest.fn().mockResolvedValue({ segments: [], outcomes: [] });
        const service = buildEnergyEventsService(prisma, fetchFuel, fetchSegments);
        await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T08:00:00.000Z'),
          to: new Date('2026-09-06T09:00:00.000Z'),
        });
        const first = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId: vehicle.id } });
        expect(first).not.toBeNull();
        await service.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        const rows = await prisma.rawRefuelCandidate.findMany({ where: { vehicleId: vehicle.id } });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.candidateIdentityKey).toBe(first?.candidateIdentityKey);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);
