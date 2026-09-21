import { randomUUID } from 'crypto';
import { FuelType, PrismaClient, type RawRefuelCandidate } from '@prisma/client';
import {
  RFRF_CANDIDATE_RECOVERY_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV,
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelConvergenceService } from '../raw-fuel-refuel-fallback/raw-refuel-convergence.service';
import { RawRefuelPromotionService } from '../raw-fuel-refuel-fallback/raw-refuel-promotion.service';
import { RawRefuelCandidateRecoveryRepository } from './raw-refuel-candidate-recovery.repository';
import { RawRefuelCandidateRecoveryService } from './raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import {
  linearRiseSamples,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';
import { RawFuelRefuelFallbackRuntimeService } from '../raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-runtime.service';
import { RawRefuelPromotionPreparationService } from '../raw-fuel-refuel-fallback/raw-refuel-promotion-preparation.service';
import { EnergyEventsService } from '../energy-events.service';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_C_INTEGRATION === '1';
const DEFAULT_CUTOVER = '2026-09-06T08:00:00.000Z';

function setStage5Env(promotion = true): () => void {
  const prev = {
    master: process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
    persist: process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
    convergence: process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
    promotion: process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
    recovery: process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV],
    cutover: process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV],
  };
  process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'true';
  process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
  process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
  process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = promotion ? 'true' : 'false';
  process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV] = 'true';
  process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV] = DEFAULT_CUTOVER;
  return () => {
    for (const [k, envKey] of [
      ['master', RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
      ['persist', RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
      ['convergence', RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
      ['promotion', RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
      ['recovery', RFRF_CANDIDATE_RECOVERY_ENABLED_ENV],
      ['cutover', RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV],
    ] as const) {
      const v = prev[k];
      if (v === undefined) delete process.env[envKey];
      else process.env[envKey] = v;
    }
  };
}

function syntheticRiseSamples() {
  return [
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ].map((s) => ({
    timestamp: s.timestamp,
    absoluteLiters: s.absoluteLiters ?? null,
    relativePercent: s.relativePercent ?? null,
  }));
}

(LIVE ? describe : describe.skip)('F10.6.8-C recovery → promotion liveness (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  }, 30_000);

  async function seedVehicle(suffix: string) {
    const org = await prisma.organization.create({
      data: { companyName: `C ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const dimoVehicle = await prisma.dimoVehicle.create({
      data: {
        externalId: `c-${suffix}`,
        tokenId: 980000 + Math.floor(Math.random() * 10000),
        fuelType: 'GASOLINE',
        powertrainType: 'ICE',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        dimoVehicleId: dimoVehicle.id,
        vin: `C${suffix}`.slice(0, 17).padEnd(17, '0'),
        licensePlate: `C-${suffix}`.slice(0, 12),
        make: 'Test',
        model: 'RFRF',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: 'AVAILABLE',
      },
    });
    return { org, vehicle, dimoVehicle };
  }

  async function buildRuntimeStack(samples = syntheticRiseSamples()) {
    const fetchFuelLevelSamples = jest.fn().mockResolvedValue(samples);
    const dimoSegments = {
      fetchFuelLevelSamples,
      fetchFuelLevelSamplesWithOutcome: jest.fn(async (...args: unknown[]) => ({
        status: 'SUCCESS',
        samples: await fetchFuelLevelSamples(...args),
      })),
      fetchEnergyEventSegments: jest.fn(async () => ({
        segments: [],
        outcomes: [],
      })),
    };
    const candidateService = RawRefuelCandidateService.withFixedClock(
      prisma as unknown as PrismaService,
      '2026-09-06T10:00:00.000Z',
    );
    const promotionPreparation = new RawRefuelPromotionPreparationService(
      prisma as unknown as PrismaService,
    );
    const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
    const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
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
    return { energyEvents };
  }

  async function persistReadyCandidate(vehicleId: string): Promise<RawRefuelCandidate> {
    const { energyEvents } = await buildRuntimeStack();
    await energyEvents.detectEnergyEvents(vehicleId, {
      from: new Date('2026-09-06T07:00:00.000Z'),
      to: new Date('2026-09-06T12:00:00.000Z'),
    });
    const row = await prisma.rawRefuelCandidate.findFirstOrThrow({ where: { vehicleId } });
    await prisma.rawRefuelCandidate.update({
      where: { id: row.id },
      data: {
        absoluteSignalTrust: 'TRUSTED',
        recoveryNextAttemptAt: new Date('2026-09-06T10:00:00.000Z'),
      },
    });
    return prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: row.id } });
  }

  function buildRecovery(clockRef: { now: Date }) {
    const candidateService = RawRefuelCandidateService.withFixedClock(
      prisma as unknown as PrismaService,
      clockRef.now,
    );
    const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
    const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
    return new RawRefuelCandidateRecoveryService(
      prisma as unknown as PrismaService,
      candidateService,
      convergence,
      promotion,
    )
      .withLeaseMs(2_000)
      .withRecoveryClock(() => clockRef.now);
  }

  function candidateMatcherWindow(candidate: RawRefuelCandidate) {
    const start =
      candidate.riseOnsetAt ??
      candidate.physicalEvidenceStart ??
      candidate.firstObservedAt;
    const end =
      candidate.riseEndAt ??
      candidate.physicalEvidenceEnd ??
      candidate.lastObservedAt;
    return { start, end };
  }

  it('RECOVERED_READY_PROMOTION — recovery promotes READY without rolling scan', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    const clockRef = { now: t0 };
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const recovery = buildRecovery(clockRef);
      const result = await recovery.recoverCandidateById(candidate.id, t0);
      expect(result.outcome).toBe('SUCCESS_PROMOTED');
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(1);
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      expect(row.lifecycleState).toBe('PROMOTED');
      expect(row.recoveryLastOutcome).toBe('SUCCESS_PROMOTED');
      expect(row.recoveryLeaseExpiresAt).toBeNull();
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('STALE_RECOVERY_PROMOTION — expired worker cannot create fallback VEE', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T11:00:00.000Z');
    const clockRef = { now: t0 };
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await prisma.rawRefuelCandidate.update({
        where: { id: candidate.id },
        data: { lifecycleState: 'READY_FOR_PERSIST', recoveryNextAttemptAt: t0 },
      });
      const leaseEnd = new Date(t0.getTime() + 2_000);
      await repo.claimDueCandidates(1, t0, leaseEnd);

      const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
      let releaseHold!: () => void;
      const holdPromise = new Promise<void>((resolve) => {
        releaseHold = resolve;
      });
      const originalById = promotion.evaluateAndApplyPromotionById.bind(promotion);
      promotion.evaluateAndApplyPromotionById = async (id, ctx, env, hooks, recoveryMutation) =>
        originalById(id, ctx, env, {
          ...hooks,
          afterCandidateRowLock: async () => {
            await holdPromise;
          },
        }, recoveryMutation);

      const candidateService = RawRefuelCandidateService.withFixedClock(
        prisma as unknown as PrismaService,
        t0,
      );
      const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
      const recoveryA = new RawRefuelCandidateRecoveryService(
        prisma as unknown as PrismaService,
        candidateService,
        convergence,
        promotion,
      )
        .withLeaseMs(2_000)
        .withRecoveryClock(() => clockRef.now);

      const workerA = recoveryA.recoverCandidateById(candidate.id, t0);
      await new Promise((r) => setTimeout(r, 100));
      clockRef.now = new Date(t0.getTime() + 5_000);
      let reclaimed: Awaited<ReturnType<typeof repo.claimDueCandidates>> = [];
      for (let attempt = 0; attempt < 30; attempt += 1) {
        reclaimed = await repo.claimDueCandidates(
          1,
          clockRef.now,
          new Date(clockRef.now.getTime() + 60_000),
        );
        if (reclaimed.length > 0) {
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
        clockRef.now = new Date(clockRef.now.getTime() + 250);
      }
      expect(reclaimed.length).toBe(1);
      const recoveryB = buildRecovery(clockRef);
      const workerB = recoveryB.recoverCandidateById(candidate.id, clockRef.now);
      releaseHold();
      const [resultA, resultB] = await Promise.all([workerA, workerB]);
      expect(resultA.detail).toBe('stale_claim');
      expect(resultB.outcome).toBe('SUCCESS_PROMOTED');
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(1);
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      expect(row.recoveryAttemptCount).toBe(reclaimed[0].recoveryAttemptCount);
      expect(row.recoveryLastOutcome).toBe('SUCCESS_PROMOTED');
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  }, 60_000);

  it('RECOVERY_SAME_NATIVE — converges without fallback VEE', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T10:30:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      const { start, end } = candidateMatcherWindow(candidate);
      await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-same-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          startTime: start,
          endTime: end,
          durationSeconds: Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000)),
          fuelDeltaLiters: candidate.deltaAbsoluteLiters,
          rawDetectionMeta: {
            fuelStartLiters: candidate.preFuelAbsoluteLiters,
            fuelEndLiters: candidate.postFuelAbsoluteLiters,
          },
        },
      });
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery({ now: t0 }).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).toBe('SUCCESS_CONVERGED');
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(0);
      expect(
        (await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } }))
          .lifecycleState,
      ).toBe('CONVERGED_NATIVE');
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('RECOVERY_PROMOTION_STAGE5_OFF — no fallback VEE when promotion authority off', async () => {
    const restore = setStage5Env(false);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T10:45:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery({ now: t0 }).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).toBe('PENDING_NATIVE_RECONCILIATION');
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(0);
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('RECOVERY_PROMOTION_TRUST — UNTRUSTED blocks fallback VEE', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T10:50:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await prisma.rawRefuelCandidate.update({
        where: { id: candidate.id },
        data: { absoluteSignalTrust: 'UNTRUSTED' },
      });
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery({ now: t0 }).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).toBe('AMBIGUOUS_RECOVERY_OBSERVATION');
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(0);
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('RECOVERY_PROMOTION_CUTOVER — pre-cutover candidate blocked', async () => {
    const restore = setStage5Env(true);
    const prevCutover = process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV];
    process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV] = '2099-01-01T00:00:00.000Z';
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T10:55:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery({ now: t0 }).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).toBe('NO_NEW_EVIDENCE');
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(0);
    } finally {
      if (prevCutover === undefined) delete process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV];
      else process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV] = prevCutover;
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  function nativeDistinctSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string) {
    const { end } = candidateMatcherWindow(candidate);
    const start = new Date(end.getTime() + 2 * 60 * 60 * 1000);
    const distinctEnd = new Date(start.getTime() + 30 * 60 * 1000);
    return {
      vehicleId: candidate.vehicleId,
      dimoSegmentId: `dimo-distinct-${suffix}`,
      kind: 'REFUEL' as const,
      detectionMechanism: 'refuel',
      startTime: start,
      endTime: distinctEnd,
      durationSeconds: 1800,
      fuelDeltaLiters: 20,
      rawDetectionMeta: { fuelStartLiters: 20, fuelEndLiters: 40 },
    };
  }

  function nativeSameSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string) {
    const { start, end } = candidateMatcherWindow(candidate);
    return {
      vehicleId: candidate.vehicleId,
      dimoSegmentId: `dimo-same-ambig-${suffix}`,
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

  it('RECOVERY_PROMOTION_AMBIGUITY — SAME+DISTINCT natives fail closed, no fallback VEE', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T11:10:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await prisma.vehicleEnergyEvent.createMany({
        data: [
          nativeSameSiblingFromCandidate(candidate, suffix),
          nativeDistinctSiblingFromCandidate(candidate, suffix),
        ],
      });
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery({ now: t0 }).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).toBe('AMBIGUOUS_RECOVERY_OBSERVATION');
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(0);
      expect(
        (await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } }))
          .lifecycleState,
      ).not.toBe('PROMOTED');
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('RECOVERY_PROMOTION_MULTI_REPLICA — parallel recovery attempts yield one VEE', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T11:05:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      const claimed = await repo.claimDueCandidates(2, t0, new Date(t0.getTime() + 60_000));
      expect(claimed.length).toBe(1);
      const recovery = buildRecovery({ now: t0 });
      const [a, b] = await Promise.all([
        recovery.recoverCandidateById(candidate.id, t0),
        recovery.recoverCandidateById(candidate.id, t0),
      ]);
      const promotedOutcomes = [a.outcome, b.outcome].filter((o) => o === 'SUCCESS_PROMOTED');
      expect(promotedOutcomes.length).toBe(1);
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(1);
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  function buildIndependentRecoveryStack(client: PrismaClient, now: Date) {
    const candidateService = RawRefuelCandidateService.withFixedClock(
      client as unknown as PrismaService,
      now,
    );
    const convergence = new RawRefuelConvergenceService(client as unknown as PrismaService);
    const promotion = new RawRefuelPromotionService(client as unknown as PrismaService);
    const recovery = new RawRefuelCandidateRecoveryService(
      client as unknown as PrismaService,
      candidateService,
      convergence,
      promotion,
    ).withRecoveryClock(() => now);
    return { recovery, promotion, candidateService, convergence };
  }

  it('POST_PROMOTION_CRASH_WINDOW — promotion commit alone finalizes SUCCESS_PROMOTED recovery', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T11:15:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 120_000));
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
      const apply = await promotion.evaluateAndApplyPromotionById(
        candidate.id,
        {
          capability: 'FUEL_CAPABLE',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          absoluteSignalTrust: 'TRUSTED',
        },
        process.env,
        undefined,
        {
          claim: {
            expectedClaimGeneration: row.recoveryAttemptCount,
            requireActiveLease: true,
            leaseExpiresAt: row.recoveryLeaseExpiresAt,
          },
          mutationClock: () => t0,
        },
      );
      expect(apply.status).toBe('PROMOTED');
      expect(apply.recoveryOwnedPromotionFinalized).toBe(true);
      const after = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      expect(after.lifecycleState).toBe('PROMOTED');
      expect(after.recoveryLastOutcome).toBe('SUCCESS_PROMOTED');
      expect(after.recoveryNextAttemptAt).toBeNull();
      expect(after.recoveryLeaseExpiresAt).toBeNull();
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(1);
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('RECOVERY_PROMOTION_INDEPENDENT_REPLICA — separate Prisma stacks, one VEE', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T11:20:00.000Z');
    const prismaB = new PrismaClient();
    expect(prisma).not.toBe(prismaB);
    const repoA = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await repoA.claimDueCandidates(1, t0, new Date(t0.getTime() + 120_000));
      const stackA = buildIndependentRecoveryStack(prisma, t0);
      const stackB = buildIndependentRecoveryStack(prismaB, t0);
      expect(stackA.recovery).not.toBe(stackB.recovery);
      expect(stackA.promotion).not.toBe(stackB.promotion);
      const [resultA, resultB] = await Promise.all([
        stackA.recovery.recoverCandidateById(candidate.id, t0),
        stackB.recovery.recoverCandidateById(candidate.id, t0),
      ]);
      const success = [resultA, resultB].filter((r) => r.outcome === 'SUCCESS_PROMOTED');
      expect(success.length).toBe(1);
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(1);
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      expect(row.lifecycleState).toBe('PROMOTED');
      expect(row.recoveryLastOutcome).toBe('SUCCESS_PROMOTED');
      expect(row.recoveryLeaseExpiresAt).toBeNull();
    } finally {
      await prismaB.$disconnect().catch(() => undefined);
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('TEST_HOOK cannot bypass recovery fence before VEE insert', async () => {
    const restore = setStage5Env(true);
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-06T11:25:00.000Z');
    const clockRef = { now: t0 };
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await persistReadyCandidate(vehicle.id);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 2_000));
      const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
      const originalById = promotion.evaluateAndApplyPromotionById.bind(promotion);
      promotion.evaluateAndApplyPromotionById = async (id, ctx, env, hooks, recoveryMutation) =>
        originalById(id, ctx, env, {
          ...hooks,
          beforeVeeInsert: async () => {
            clockRef.now = new Date(t0.getTime() + 10_000);
          },
        }, recoveryMutation);
      const candidateService = RawRefuelCandidateService.withFixedClock(
        prisma as unknown as PrismaService,
        t0,
      );
      const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
      const recovery = new RawRefuelCandidateRecoveryService(
        prisma as unknown as PrismaService,
        candidateService,
        convergence,
        promotion,
      )
        .withLeaseMs(2_000)
        .withRecoveryClock(() => clockRef.now);
      const result = await recovery.recoverCandidateById(candidate.id, t0);
      expect(result.detail).toBe('stale_claim');
      expect(await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
      })).toBe(0);
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      expect(row.lifecycleState).not.toBe('PROMOTED');
    } finally {
      restore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });
});