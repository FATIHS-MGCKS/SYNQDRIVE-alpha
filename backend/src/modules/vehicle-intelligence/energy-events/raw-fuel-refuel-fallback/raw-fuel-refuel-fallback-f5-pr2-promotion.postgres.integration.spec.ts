import { randomUUID } from 'crypto';
import { Registry } from 'prom-client';
import { PrismaClient, FuelType, type RawRefuelCandidate } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV,
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { KS_MS_661_SYNTHETIC_ABSOLUTE_FUEL_SAMPLES } from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-synthetic.fixture';
import { PrismaService } from '@shared/database/prisma.service';
import { mapRawRefuelCandidateToPromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import { RawRefuelPromotionPreparationService } from './raw-refuel-promotion-preparation.service';
import { RawRefuelPromotionService } from './raw-refuel-promotion.service';
import { RawFuelRefuelFallbackRuntimeService } from './raw-fuel-refuel-fallback-runtime.service';
import { RawFuelRefuelFallbackMetricsService } from './raw-fuel-refuel-fallback-metrics.service';
import { EnergyEventsService } from '../energy-events.service';
import { buildRefuelSegment } from '../energy-events.service.spec';
import { candidateRowToEvidenceSlice } from '../raw-refuel-candidate/raw-refuel-candidate-evidence-merge';
import { buildTestObservation } from '../raw-refuel-candidate/testing/raw-refuel-candidate-test.util';
import {
  linearRiseSamples,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_FUEL_REFUEL_F5_PR2_INTEGRATION === '1';
const DEFAULT_CUTOVER = '2026-09-06T08:00:00.000Z';

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

interface RfrfFlagRestore {
  (): void;
}

function setRfrfFlags(opts: {
  master?: boolean;
  persist?: boolean;
  convergence?: boolean;
  promotion?: boolean;
  cutoverAt?: string | null;
}): RfrfFlagRestore {
  const prev = {
    master: process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
    persist: process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
    convergence: process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
    promotion: process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
    cutover: process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV],
  };

  if (opts.master !== undefined) {
    process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = opts.master ? '1' : '0';
  }
  if (opts.persist !== undefined) {
    process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = opts.persist ? '1' : '0';
  }
  if (opts.convergence !== undefined) {
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = opts.convergence ? 'true' : 'false';
  }
  if (opts.promotion !== undefined) {
    process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = opts.promotion ? 'true' : 'false';
  }
  if (opts.cutoverAt !== undefined) {
    if (opts.cutoverAt === null) delete process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV];
    else process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV] = opts.cutoverAt;
  }

  return () => {
    for (const [key, envKey] of [
      ['master', RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
      ['persist', RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
      ['convergence', RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
      ['promotion', RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
      ['cutover', RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV],
    ] as const) {
      const value = prev[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  };
}

function setPromotionEnv(): RfrfFlagRestore {
  return setRfrfFlags({
    master: true,
    persist: true,
    convergence: true,
    promotion: true,
    cutoverAt: DEFAULT_CUTOVER,
  });
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

async function seedOrgVehicle(prisma: PrismaClient, suffix: string, tokenId = 930000 + Math.floor(Math.random() * 10000)) {
  const org = await prisma.organization.create({
    data: { companyName: `RFRF F5PR2 ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `dimo-f5pr2-${suffix}`,
      tokenId,
      fuelType: 'GASOLINE',
      powertrainType: 'ICE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `P2${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `P2-${suffix}`.slice(0, 12),
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

async function countConvergedNative(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.rawRefuelCandidate.count({
    where: { vehicleId, lifecycleState: 'CONVERGED_NATIVE' },
  });
}

function candidateMatcherWindow(candidate: RawRefuelCandidate): { start: Date; end: Date } {
  const start =
    candidate.riseOnsetAt ??
    candidate.physicalEvidenceStart ??
    candidate.firstObservedAt;
  const end =
    candidate.riseEndAt ??
    candidate.physicalEvidenceEnd ??
    (candidate.postFuelAbsoluteLiters != null || candidate.postFuelRelativePercent != null
      ? candidate.lastObservedAt
      : candidate.firstObservedAt);
  return { start, end };
}

function nativeSameSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string) {
  const { start, end } = candidateMatcherWindow(candidate);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-same-${suffix}`,
    detectionSource: 'DIMO_NATIVE' as const,
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: start,
    endTime: end,
    durationSeconds: Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000)),
    fuelDeltaLiters: candidate.deltaAbsoluteLiters,
    rawDetectionMeta: {
      fuelStartLiters: candidate.preFuelAbsoluteLiters,
      fuelEndLiters: candidate.postFuelAbsoluteLiters,
    },
  };
}

function nativeInsufficientSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string) {
  const { end } = candidateMatcherWindow(candidate);
  const start = new Date(end.getTime() - 7 * 60 * 1000);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-insuff-${suffix}`,
    detectionSource: 'DIMO_NATIVE' as const,
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: start,
    endTime: end,
    durationSeconds: Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000)),
    rawDetectionMeta: {},
  };
}

function nativeDistinctSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string) {
  const { end } = candidateMatcherWindow(candidate);
  const start = new Date(end.getTime() + 2 * 60 * 60 * 1000);
  const distinctEnd = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-distinct-${suffix}`,
    detectionSource: 'DIMO_NATIVE' as const,
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: start,
    endTime: distinctEnd,
    durationSeconds: 1800,
    fuelDeltaLiters: 20,
    rawDetectionMeta: { fuelStartLiters: 20, fuelEndLiters: 40 },
  };
}

function syntheticRiseSamples() {
  return mapSamples([
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ]);
}

function ksMs661SyntheticSamples() {
  return KS_MS_661_SYNTHETIC_ABSOLUTE_FUEL_SAMPLES.map((s) => ({
    timestamp: new Date(s.timestamp),
    absoluteLiters: s.absoluteLiters,
    relativePercent: s.relativePercent,
  }));
}

function buildRuntimeStack(
  prisma: PrismaClient,
  fetchFuelLevelSamples: jest.Mock,
  promotionService?: RawRefuelPromotionService,
  stackOptions?: {
    nativeRefuelSegments?: ReturnType<typeof buildRefuelSegment>[];
  },
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
  const nativeSegments = stackOptions?.nativeRefuelSegments ?? [];
  const dimoSegments = {
    fetchFuelLevelSamples,
    fetchFuelLevelSamplesWithOutcome,
    fetchEnergyEventSegments: jest.fn(
      async (tokenId: number, from: Date, to: Date) => ({
        tokenId,
        segments: nativeSegments,
        outcomes: [
          {
            mechanism: 'refuel',
            status: nativeSegments.length > 0 ? 'SUCCESS_WITH_EVENTS' : 'SUCCESS_EMPTY',
            segments: nativeSegments.filter((segment) => segment.mechanism === 'refuel'),
            windowFrom: from.toISOString(),
            windowTo: to.toISOString(),
          },
          {
            mechanism: 'recharge',
            status: 'SUCCESS_EMPTY',
            segments: [],
            windowFrom: from.toISOString(),
            windowTo: to.toISOString(),
          },
        ],
      }),
    ),
  };
  const candidateService = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-06T10:00:00.000Z',
  );
  const promotionPreparation = new RawRefuelPromotionPreparationService(
    prisma as unknown as PrismaService,
  );
  const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
  const promotion =
    promotionService ?? new RawRefuelPromotionService(prisma as unknown as PrismaService);
  const rawRuntime = new RawFuelRefuelFallbackRuntimeService(
    dimoSegments as never,
    candidateService,
    promotionPreparation,
    convergence,
    promotion,
  );
  const energyEvents = new EnergyEventsService(
    prisma as unknown as PrismaService,
    dimoSegments as never,
    undefined,
    undefined,
    undefined,
    rawRuntime,
  );
  return { energyEvents, convergence, promotion, candidateService };
}

async function persistReadyCandidate(
  prisma: PrismaClient,
  vehicleId: string,
  samples = syntheticRiseSamples(),
): Promise<RawRefuelCandidate> {
  const { energyEvents } = buildRuntimeStack(prisma, jest.fn().mockResolvedValue(samples));
  await energyEvents.detectEnergyEvents(vehicleId, {
    from: new Date('2026-09-06T07:00:00.000Z'),
    to: new Date('2026-09-06T12:00:00.000Z'),
  });
  const persisted = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId } });
  if (!persisted) throw new Error('expected candidate');
  return persisted;
}

const promotionContext = {
  capability: 'FUEL_CAPABLE' as const,
  absoluteDetectionAdmissibility: 'ADMISSIBLE' as const,
  absoluteSignalTrust: 'TRUSTED' as const,
};

function buildRediscoveryObservation(
  candidate: RawRefuelCandidate,
  overrides: Partial<ReturnType<typeof buildTestObservation>> = {},
) {
  const slice = candidateRowToEvidenceSlice(candidate);
  return buildTestObservation({
    organizationId: candidate.organizationId,
    vehicleId: candidate.vehicleId,
    detectionVersion: candidate.detectionVersion,
    lifecycleState: candidate.lifecycleState,
    signalChannel: slice.signalChannel,
    riseOnsetAt: slice.riseOnsetAt ?? undefined,
    riseEndAt: slice.riseEndAt ?? undefined,
    physicalEvidenceStart: slice.physicalEvidenceStart ?? undefined,
    physicalEvidenceEnd: slice.physicalEvidenceEnd ?? undefined,
    preFuelAbsoluteLiters: slice.preFuelAbsoluteLiters ?? undefined,
    postFuelAbsoluteLiters: slice.postFuelAbsoluteLiters ?? undefined,
    deltaAbsoluteLiters: slice.deltaAbsoluteLiters ?? undefined,
    prePlateauSampleCount: slice.prePlateauSampleCount ?? undefined,
    postPlateauSampleCount: slice.postPlateauSampleCount ?? undefined,
    totalSampleCount: slice.totalSampleCount ?? undefined,
    maxSampleGapSeconds: slice.maxSampleGapSeconds ?? undefined,
    scanWindowStart: slice.scanWindowStart ?? undefined,
    scanWindowEnd: slice.scanWindowEnd ?? undefined,
    absoluteSignalTrust: slice.absoluteSignalTrust ?? undefined,
    relativeSignalAvailable: slice.relativeSignalAvailable ?? undefined,
    signalProvider: slice.signalProvider ?? undefined,
    ...overrides,
  });
}

function createPromotionRowLockGate() {
  let releaseHold!: () => void;
  const holdPromise = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  let acquired = false;
  return {
    hooks: {
      afterCandidateRowLock: async () => {
        acquired = true;
        await holdPromise;
      },
    },
    releaseHold: () => releaseHold(),
    waitUntilAcquired: async (timeoutMs = 10_000) => {
      const started = Date.now();
      while (!acquired) {
        if (Date.now() - started > timeoutMs) {
          throw new Error('promotion row lock was not acquired in time');
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
  };
}

async function readPromotionAttemptedTotal(
  registry: Registry,
): Promise<number> {
  const metrics = await registry.getMetricsAsJSON();
  const metric = metrics.find((item) => item.name === 'synqdrive_rfrf_promotion_attempted_total');
  return metric?.values[0]?.value ?? 0;
}

(LIVE ? describe : describe.skip)(
  'RFRF F5-PR2 atomic promotion (RAW_FUEL_REFUEL_F5_PR2_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('RAW_FUEL_REFUEL_F5_PR2_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('P1 — fallback-only successful promotion', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('PROMOTED');
        expect(result.fallbackVehicleEnergyEventId).toBeTruthy();
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
        expect(await countPromoted(prisma, vehicle.id)).toBe(1);
        const vee = await prisma.vehicleEnergyEvent.findUnique({
          where: { id: result.fallbackVehicleEnergyEventId! },
        });
        expect(vee?.detectionSource).toBe('SYNQDRIVE_RAW_FUEL_FALLBACK');
        expect(vee?.sourceEventKey).toBe(candidate.candidateIdentityKey);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P2 — identical replay idempotency', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const first = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        const second = await promotion.evaluateAndApplyPromotionById(candidate.id, promotionContext, process.env);
        expect(first.status).toBe('PROMOTED');
        expect(second.status).toBe('ALREADY_PROMOTED');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
        expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P3 — concurrent same candidate => one fallback VEE and one PROMOTED', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const [a, b] = await Promise.all([
          promotion.evaluateAndApplyPromotionById(candidate.id, promotionContext, process.env),
          promotion.evaluateAndApplyPromotionById(candidate.id, promotionContext, process.env),
        ]);
        const statuses = new Set([a.status, b.status]);
        expect(statuses.has('PROMOTED') || statuses.has('ALREADY_PROMOTED')).toBe(true);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
        expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P4 — different vehicles may promote independently', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const a = await seedOrgVehicle(prisma, `a-${suffix}`);
      const b = await seedOrgVehicle(prisma, `b-${suffix}`);
      try {
        const candA = await persistReadyCandidate(prisma, a.vehicle.id);
        const candB = await persistReadyCandidate(prisma, b.vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const [ra, rb] = await Promise.all([
          promotion.evaluateAndApplyPromotion(candA, promotionContext, process.env),
          promotion.evaluateAndApplyPromotion(candB, promotionContext, process.env),
        ]);
        expect(ra.status).toBe('PROMOTED');
        expect(rb.status).toBe('PROMOTED');
        expect(await countFallbackVee(prisma, a.vehicle.id)).toBe(1);
        expect(await countFallbackVee(prisma, b.vehicle.id)).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, a.vehicle.id, a.org.id, a.dimoVehicleId);
        await cleanup(prisma, b.vehicle.id, b.org.id, b.dimoVehicleId);
      }
    });

    it('P5 — failure before VEE insert rolls back entire transaction', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        await expect(
          promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env, {
            beforeVeeInsert: () => {
              throw new Error('inject_before_vee_insert');
            },
          }),
        ).rejects.toThrow('inject_before_vee_insert');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidate.id } });
        expect(after?.lifecycleState).toBe('READY_FOR_PERSIST');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P6 — failure after VEE insert before lifecycle update rolls back', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        await expect(
          promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env, {
            afterVeeInsertBeforeLifecycleUpdate: () => {
              throw new Error('inject_after_vee_insert');
            },
          }),
        ).rejects.toThrow('inject_after_vee_insert');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P7 — native SAME before promotion => CONVERGED_NATIVE, zero fallback VEE', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('CONVERGED_NATIVE');
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(1);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P8 — native INSUFFICIENT => blocked', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeInsufficientSiblingFromCandidate(candidate, suffix),
        });
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P9 — SAME + INSUFFICIENT => blocked', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        await prisma.vehicleEnergyEvent.create({
          data: nativeInsufficientSiblingFromCandidate(candidate, suffix),
        });
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P10 — SAME + DISTINCT => blocked', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        await prisma.vehicleEnergyEvent.create({
          data: nativeDistinctSiblingFromCandidate(candidate, suffix),
        });
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P11 — all DISTINCT => fallback promotion permitted', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.vehicleEnergyEvent.create({
          data: nativeDistinctSiblingFromCandidate(candidate, suffix),
        });
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('PROMOTED');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P12 — delayed evidence same identity => one VEE', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const fetchMock = jest.fn().mockResolvedValue(syntheticRiseSamples());
        const { energyEvents, promotion } = buildRuntimeStack(prisma, fetchMock);
        await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        const candidate = await prisma.rawRefuelCandidate.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
        const first = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(first.status).toBe('PROMOTED');
        await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
        expect(await countPromoted(prisma, vehicle.id)).toBe(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P13 — pre-cutover evidence => blocked', async () => {
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: true,
        cutoverAt: '2026-09-07T00:00:00.000Z',
      });
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('BLOCKED_CUTOVER');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P14 — post-cutover evidence => promoted', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('PROMOTED');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P15 — candidate created post-cutover but evidence pre-cutover => blocked', async () => {
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: true,
        cutoverAt: '2026-09-06T10:00:00.000Z',
      });
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { createdAt: new Date('2026-09-06T12:00:00.000Z') },
        });
        const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(refreshed, promotionContext, process.env);
        expect(result.status).toBe('BLOCKED_CUTOVER');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P16 — missing cutover under enabled promotion => fail closed', async () => {
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: true,
        cutoverAt: null,
      });
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('BLOCKED_CUTOVER');
        expect(result.detail).toBe('cutover_unset_or_invalid');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P17 — sourceEventKey equals candidateIdentityKey on promoted VEE', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const draft = mapRawRefuelCandidateToPromotionDraft(candidate);
        expect(draft.sourceEventKey).toBe(candidate.candidateIdentityKey);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('PROMOTED');
        const vee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
          where: {
            vehicleId_sourceEventKey: {
              vehicleId: vehicle.id,
              sourceEventKey: candidate.candidateIdentityKey!,
            },
          },
        });
        expect(vee.detectionSource).toBe('SYNQDRIVE_RAW_FUEL_FALLBACK');
        expect(vee.sourceEventKey).toBe(candidate.candidateIdentityKey);
        await expect(
          prisma.vehicleEnergyEvent.create({
            data: {
              vehicleId: vehicle.id,
              dimoSegmentId: `duplicate-key-${suffix}`,
              detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK',
              sourceEventKey: candidate.candidateIdentityKey!,
              kind: 'REFUEL',
              detectionMechanism: 'refuel',
              startTime: candidate.firstObservedAt,
              endTime: candidate.lastObservedAt,
              durationSeconds: 60,
            },
          }),
        ).rejects.toThrow();
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P18 — synthetic dimoSegmentId collision => fail closed', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const draft = mapRawRefuelCandidateToPromotionDraft(candidate);
        await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            dimoSegmentId: draft.dimoSegmentIdPlaceholder,
            detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK',
            sourceEventKey: `different-key-${suffix}`,
            kind: 'REFUEL',
            detectionMechanism: 'refuel',
            startTime: candidate.firstObservedAt,
            endTime: candidate.lastObservedAt,
            durationSeconds: 60,
          },
        });
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('FAIL_CLOSED');
        expect(result.detail).toBe('synthetic_dimo_segment_id_collision');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P19 — master ON + persist ON but promotion authority OFF => zero VEE', async () => {
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: false,
        cutoverAt: DEFAULT_CUTOVER,
      });
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('SKIPPED_NOT_AUTHORIZED');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P20 — convergence ON but promotion execution OFF => zero VEE', async () => {
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: false,
        cutoverAt: DEFAULT_CUTOVER,
      });
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        const { energyEvents } = buildRuntimeStack(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
        );
        const detect = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(detect.rawFuelFallback?.promotionSkippedNotAuthorized).toBeGreaterThan(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        void candidate;
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P21 — automatic detectEnergyEvents runtime promotion E2E', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const fetchMock = jest.fn().mockResolvedValue(syntheticRiseSamples());
        const { energyEvents } = buildRuntimeStack(prisma, fetchMock);
        await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        await prisma.rawRefuelCandidate.updateMany({
          where: { vehicleId: vehicle.id },
          data: {
            absoluteSignalTrust: 'TRUSTED',
            qualityMeta: { absoluteDetectionAdmissibility: 'ADMISSIBLE' },
          },
        });
        const detect = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(detect.rawFuelFallback?.promotionCommitted).toBeGreaterThan(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
        expect(await countPromoted(prisma, vehicle.id)).toBe(1);
        const outcome = detect.rawFuelFallback?.candidateOutcomes.find((o) => o.promotionApply);
        expect(outcome?.promotionApply?.status).toBe('PROMOTED');
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P24 — convergence OFF + promotion ON => zero VEE and fail-closed authority', async () => {
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        convergence: false,
        promotion: true,
        cutoverAt: DEFAULT_CUTOVER,
      });
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { absoluteSignalTrust: 'TRUSTED' },
        });
        const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        const { promotion, energyEvents } = buildRuntimeStack(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
        );
        const direct = await promotion.evaluateAndApplyPromotion(
          refreshed,
          promotionContext,
          process.env,
        );
        expect(direct.status).toBe('SKIPPED_NOT_AUTHORIZED');
        expect(direct.detail).toBe('convergence_not_authorized');
        const detect = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(detect.rawFuelFallback?.promotionSkippedNotAuthorized).toBeGreaterThan(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
        expect(await countConvergedNative(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P25 — direct RawRefuelPromotionService cannot bypass convergence authority', async () => {
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        convergence: false,
        promotion: true,
        cutoverAt: DEFAULT_CUTOVER,
      });
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { absoluteSignalTrust: 'TRUSTED' },
        });
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const byId = await promotion.evaluateAndApplyPromotionById(
          candidate.id,
          promotionContext,
          process.env,
        );
        const byRow = await promotion.evaluateAndApplyPromotion(
          await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
          promotionContext,
          process.env,
        );
        expect(byId.status).toBe('SKIPPED_NOT_AUTHORIZED');
        expect(byId.detail).toBe('convergence_not_authorized');
        expect(byRow.status).toBe('SKIPPED_NOT_AUTHORIZED');
        expect(byRow.detail).toBe('convergence_not_authorized');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P26 — F2 rediscovery blocked while promotion holds candidate FOR UPDATE', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const prisma2 = new PrismaClient();
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { absoluteSignalTrust: 'TRUSTED' },
        });
        const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        const originalPostFuel = refreshed.postFuelAbsoluteLiters;
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        let rowLockHeld = false;
        const promoted = await promotion.evaluateAndApplyPromotion(
          refreshed,
          promotionContext,
          process.env,
          {
            afterCandidateRowLock: async () => {
              rowLockHeld = true;
              await expect(
                prisma2.$queryRaw<Array<{ id: string }>>`
                  SELECT id
                  FROM raw_refuel_candidates
                  WHERE id = ${candidate.id}
                  FOR UPDATE NOWAIT
                `,
              ).rejects.toThrow(/could not obtain lock|55P03/i);
            },
          },
        );
        expect(rowLockHeld).toBe(true);
        expect(promoted.status).toBe('PROMOTED');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
        expect(await countPromoted(prisma, vehicle.id)).toBe(1);
        const terminal = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(terminal.postFuelAbsoluteLiters).toBe(originalPostFuel);
        expect(terminal.lifecycleState).toBe('PROMOTED');
        const f2Service = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          '2026-09-06T12:00:00.000Z',
        );
        const maturationObservation = buildRediscoveryObservation(refreshed, {
          postFuelAbsoluteLiters: (originalPostFuel ?? 30) + 1,
          deltaAbsoluteLiters: (refreshed.deltaAbsoluteLiters ?? 20) + 1,
          lifecycleState: 'READY_FOR_PERSIST',
        });
        const f2Result = await f2Service.resolveOrCreateCandidate(maturationObservation);
        expect(f2Result.candidateId).toBe(candidate.id);
        expect(f2Result.updated).toBe(false);
        expect(f2Result.created).toBe(false);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        restore();
        await prisma2.$disconnect().catch(() => undefined);
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    }, 20_000);

    it('P27 — promotion rollback after row lock releases competing F2 update', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const prisma2 = new PrismaClient();
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { absoluteSignalTrust: 'TRUSTED' },
        });
        const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        const maturationObservation = buildRediscoveryObservation(refreshed, {
          postFuelAbsoluteLiters: (refreshed.postFuelAbsoluteLiters ?? 30) + 1,
          deltaAbsoluteLiters: (refreshed.deltaAbsoluteLiters ?? 20) + 1,
          lifecycleState: 'READY_FOR_PERSIST',
        });
        const f2Service = RawRefuelCandidateService.withFixedClock(
          prisma2 as unknown as PrismaService,
          '2026-09-06T12:00:00.000Z',
        );
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        let rowLockAcquired = false;
        let releaseRowLockWait!: () => void;
        const rowLockWait = new Promise<void>((resolve) => {
          releaseRowLockWait = resolve;
        });
        const f2Promise = (async () => {
          await rowLockWait;
          return f2Service.resolveOrCreateCandidate(maturationObservation);
        })();
        await expect(
          promotion.evaluateAndApplyPromotion(refreshed, promotionContext, process.env, {
            afterCandidateRowLock: async () => {
              rowLockAcquired = true;
              releaseRowLockWait();
              await new Promise((resolve) => setTimeout(resolve, 800));
            },
            beforeVeeInsert: () => {
              throw new Error('P27_inject_promotion_rollback');
            },
          }),
        ).rejects.toThrow('P27_inject_promotion_rollback');
        expect(rowLockAcquired).toBe(true);
        const f2Result = await f2Promise;
        expect(f2Result.candidateId).toBe(candidate.id);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
        const after = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(after.lifecycleState).toBe('READY_FOR_PERSIST');
        expect(after.postFuelAbsoluteLiters).toBe(maturationObservation.postFuelAbsoluteLiters);
        expect(after.evidenceRevisionFingerprint).not.toBe(
          refreshed.evidenceRevisionFingerprint,
        );
      } finally {
        restore();
        await prisma2.$disconnect().catch(() => undefined);
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    }, 20_000);

    it('P28 — thrown promotion failure isolated from successful native path', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, tokenId, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const nativeRefuel = buildRefuelSegment({
          segmentId: `dimo-native-${suffix}`,
          startTime: '2026-09-06T07:00:00.000Z',
          endTime: '2026-09-06T07:30:00.000Z',
        });
        const fetchMock = jest.fn().mockResolvedValue(syntheticRiseSamples());
        const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
        const originalApply = promotion.evaluateAndApplyPromotion.bind(promotion);
        jest.spyOn(promotion, 'evaluateAndApplyPromotion').mockImplementation(
          (candidate, context, env, hooks) =>
            originalApply(candidate, context, env, {
              ...hooks,
              beforeVeeInsert: () => {
                throw new Error('P28_inject_promotion_throw');
              },
            }),
        );
        const { energyEvents } = buildRuntimeStack(prisma, fetchMock, promotion, {
          nativeRefuelSegments: [nativeRefuel],
        });
        const first = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(first.created).toBeGreaterThan(0);
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, dimoSegmentId: nativeRefuel.segmentId },
          }),
        ).toBeGreaterThan(0);
        await prisma.rawRefuelCandidate.updateMany({
          where: { vehicleId: vehicle.id },
          data: {
            absoluteSignalTrust: 'TRUSTED',
            qualityMeta: { absoluteDetectionAdmissibility: 'ADMISSIBLE' },
          },
        });
        const second = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, dimoSegmentId: nativeRefuel.segmentId },
          }),
        ).toBeGreaterThan(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await countPromoted(prisma, vehicle.id)).toBe(0);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        const outcome = second.rawFuelFallback?.candidateOutcomes.find(
          (item) => item.promotionApplyError || item.promotionApply,
        );
        expect(outcome?.promotionApplyError).toContain('P28_inject_promotion_throw');
        void tokenId;
      } finally {
        restore();
        jest.restoreAllMocks();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('P29 — promotionAttempted metric single ownership on authorized automatic attempt', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const registry = new Registry();
        const metrics = new RawFuelRefuelFallbackMetricsService({
          registry,
        } as TripMetricsService);
        const promotion = new RawRefuelPromotionService(
          prisma as unknown as PrismaService,
          metrics,
        );
        const fetchMock = jest.fn().mockResolvedValue(syntheticRiseSamples());
        const { energyEvents } = buildRuntimeStack(prisma, fetchMock, promotion);
        await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        await prisma.rawRefuelCandidate.updateMany({
          where: { vehicleId: vehicle.id },
          data: {
            absoluteSignalTrust: 'TRUSTED',
            qualityMeta: { absoluteDetectionAdmissibility: 'ADMISSIBLE' },
          },
        });
        const before = await readPromotionAttemptedTotal(registry);
        const detect = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        const after = await readPromotionAttemptedTotal(registry);
        expect(after - before).toBe(1);
        expect(detect.rawFuelFallback?.promotionExecutionAttempted).toBe(1);
        expect(detect.rawFuelFallback?.promotionCommitted).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('KS MS 661 SYNTHETIC_FULL_LIFECYCLE — eligible post-cutover promotion', async () => {
      const restore = setPromotionEnv();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix, 900661);
      try {
        const candidate = await persistReadyCandidate(prisma, vehicle.id, ksMs661SyntheticSamples());
        const { promotion } = buildRuntimeStack(prisma, jest.fn());
        const result = await promotion.evaluateAndApplyPromotion(candidate, promotionContext, process.env);
        expect(result.status).toBe('PROMOTED');
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
        const vee = await prisma.vehicleEnergyEvent.findFirst({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        });
        expect(vee?.sourceEventKey).toBe(candidate.candidateIdentityKey);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('failure isolation — promotion error does not block raw branch candidate persist', async () => {
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: true,
        cutoverAt: null,
      });
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const { energyEvents } = buildRuntimeStack(
          prisma,
          jest.fn().mockResolvedValue(syntheticRiseSamples()),
        );
        const detect = await energyEvents.detectEnergyEvents(vehicle.id, {
          from: new Date('2026-09-06T07:00:00.000Z'),
          to: new Date('2026-09-06T12:00:00.000Z'),
        });
        expect(detect.rawFuelFallback?.candidatesCreated).toBeGreaterThan(0);
        expect(detect.rawFuelFallback?.promotionBlockedByCutover).toBeGreaterThan(0);
        expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);
