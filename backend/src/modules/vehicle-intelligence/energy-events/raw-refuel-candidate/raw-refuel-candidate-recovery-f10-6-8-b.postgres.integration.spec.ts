import { randomUUID } from 'crypto';
import {
  FuelType,
  PrismaClient,
  type RawRefuelCandidate,
} from '@prisma/client';
import {
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_CANDIDATE_RECOVERY_ENABLED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelConvergenceService } from '../raw-fuel-refuel-fallback/raw-refuel-convergence.service';
import { RawRefuelCandidateRecoveryRepository } from './raw-refuel-candidate-recovery.repository';
import { RawRefuelCandidateRecoveryService } from './raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import { computeRawRefuelCandidateRecoveryWindow } from './raw-refuel-candidate-recovery-window';
import {
  RAW_REFUEL_CANDIDATE_RECOVERY_MIN_BACKOFF_MS,
  computeRawRefuelCandidateRecoveryBackoffMs,
} from './raw-refuel-candidate-recovery-backoff';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  buildSparseBridgeRefuelEpisodeSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION === '1';

function readConvergedNativeId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>).convergedNativeEnergyEventId;
  return typeof value === 'string' ? value : null;
}

function nativeSameSiblingFromCandidate(
  candidate: RawRefuelCandidate,
  suffix: string,
) {
  const start =
    candidate.riseOnsetAt ??
    candidate.physicalEvidenceStart ??
    candidate.firstObservedAt;
  const end =
    candidate.riseEndAt ??
    candidate.physicalEvidenceEnd ??
    candidate.lastObservedAt;
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

function withRecoveryEnv(): () => void {
  const prev = {
    master: process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
    persist: process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
    recovery: process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV],
    convergence: process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
    promotion: process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
  };
  process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'true';
  process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
  process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV] = 'true';
  process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
  process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = 'true';
  return () => {
    for (const [key, val] of Object.entries({
      [RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV]: prev.master,
      [RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV]: prev.persist,
      [RFRF_CANDIDATE_RECOVERY_ENABLED_ENV]: prev.recovery,
      [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: prev.convergence,
      [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: prev.promotion,
    })) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  };
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string, tokenId: number) {
  const org = await prisma.organization.create({
    data: {
      companyName: `RFRF F10.6.8-B ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `dimo-b-${suffix}`,
      tokenId,
      fuelType: 'GASOLINE',
      powertrainType: 'ICE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `B8${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `B8-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: FuelType.GASOLINE,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, tokenId, dimoVehicleId: dimoVehicle.id };
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

function buildRecoveryStack(
  prisma: PrismaClient,
  fetchImpl: () => ReturnType<typeof buildSparseBridgeRefuelEpisodeSamples> = () =>
    buildSparseBridgeRefuelEpisodeSamples(true),
) {
  let fetchCount = 0;
  const candidateService = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-19T17:00:00.000Z',
  );
  const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
  const recovery = new RawRefuelCandidateRecoveryService(
    prisma as unknown as PrismaService,
    candidateService,
    convergence,
  ).withSampleFetcher(async () => {
    fetchCount += 1;
    const samples = fetchImpl();
    return {
      status: 'OK' as const,
      samples: samples.map((s) => ({
        timestamp: s.timestamp,
        absoluteLiters: s.absoluteLiters ?? null,
        relativePercent: s.relativePercent ?? null,
      })),
    };
  });
  return { candidateService, recovery, getFetchCount: () => fetchCount };
}

async function seedSparseBridgeCandidate(
  prisma: PrismaClient,
  orgId: string,
  vehicleId: string,
): Promise<RawRefuelCandidate> {
  const scanContext = buildDetectorPhysicsContext({
    organizationId: orgId,
    vehicleId,
    scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
  });
  const partial = detectRawFuelRises({
    context: scanContext,
    samples: buildSparseBridgeRefuelEpisodeSamples(false),
  });
  const service = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-19T17:00:00.000Z',
  );
  const resolved = await service.resolveOrCreateCandidate(partial.candidates[0]);
  return prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: resolved.candidateId } });
}

(LIVE ? describe : describe.skip)(
  'raw-refuel-candidate-recovery F10.6.8-B PostgreSQL',
  () => {
    let prisma: PrismaClient;
    let restoreEnv: () => void;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('DATABASE_URL required for F10.6.8-B integration');
      }
      prisma = new PrismaClient();
      restoreEnv = withRecoveryEnv();
    }, 60_000);

    afterAll(async () => {
      restoreEnv?.();
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('WOB-shaped maturation via candidate recovery (single row, READY)', async () => {
      const suffix = randomUUID().slice(0, 8);
      const tokenId = 930000 + Math.floor(Math.random() * 10000);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix, tokenId);
      const now = new Date('2026-09-19T18:30:00.000Z');
      try {
        const candidate = await seedSparseBridgeCandidate(prisma, org.id, vehicle.id);
        const window = computeRawRefuelCandidateRecoveryWindow(candidate, now);
        const ts = (iso: string) => new Date(iso).getTime();
        expect(ts('2026-09-19T15:48:26.000Z')).toBeGreaterThanOrEqual(window.start.getTime());
        expect(ts('2026-09-19T16:11:24.000Z')).toBeLessThanOrEqual(window.end.getTime());
        expect(ts('2026-09-19T16:53:59.000Z')).toBeLessThanOrEqual(window.end.getTime());
        expect(ts('2026-09-19T16:58:31.000Z')).toBeLessThanOrEqual(window.end.getTime());
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { recoveryNextAttemptAt: now },
        });
        const { recovery } = buildRecoveryStack(prisma);
        const result = await recovery.recoverCandidateById(candidate.id, now);
        expect(['SUCCESS_MATURED_READY', 'PENDING_NATIVE_RECONCILIATION']).toContain(
          result.outcome,
        );
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(row.lifecycleState).toBe('READY_FOR_PERSIST');
        expect(row.postPlateauSampleCount).toBeGreaterThanOrEqual(3);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('two-tick READY then CONVERGED_NATIVE without second DIMO fetch', async () => {
      const suffix = randomUUID().slice(0, 8);
      const tokenId = 940000 + Math.floor(Math.random() * 10000);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix, tokenId);
      const now = new Date('2026-09-19T18:30:00.000Z');
      try {
        let candidate = await seedSparseBridgeCandidate(prisma, org.id, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { recoveryNextAttemptAt: now },
        });
        const { recovery, getFetchCount } = buildRecoveryStack(prisma);
        const tick1 = await recovery.recoverCandidateById(candidate.id, now);
        expect(tick1.dimoFetchPerformed).toBe(true);
        expect(
          await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
        ).toMatchObject({ lifecycleState: 'READY_FOR_PERSIST' });
        const fetchAfterTick1 = getFetchCount();
        const tick2Pending = await recovery.recoverCandidateById(
          candidate.id,
          new Date(now.getTime() + 60_000),
        );
        expect(tick2Pending.outcome).toBe('PENDING_NATIVE_RECONCILIATION');
        expect(tick2Pending.dimoFetchPerformed).toBe(false);
        expect(getFetchCount()).toBe(fetchAfterTick1);

        candidate = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        const native = await prisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });

        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { recoveryNextAttemptAt: new Date(now.getTime() + 120_000) },
        });
        const tick2 = await recovery.recoverCandidateById(
          candidate.id,
          new Date(now.getTime() + 120_000),
        );
        expect(tick2.outcome).toBe('SUCCESS_CONVERGED');
        expect(tick2.dimoFetchPerformed).toBe(false);
        expect(tick2.convergenceStatus).toBe('CONVERGED_NATIVE');
        expect(getFetchCount()).toBe(fetchAfterTick1);
        const finalRow = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(finalRow.lifecycleState).toBe('CONVERGED_NATIVE');
        expect(readConvergedNativeId(finalRow.qualityMeta)).toBe(native.id);
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('multi-replica claim — only one effective claim for same due candidate', async () => {
      const suffix = randomUUID().slice(0, 8);
      const tokenId = 950000 + Math.floor(Math.random() * 10000);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix, tokenId);
      const now = new Date('2026-09-19T18:30:00.000Z');
      const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
      try {
        const candidate = await seedSparseBridgeCandidate(prisma, org.id, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { recoveryNextAttemptAt: now },
        });
        const lease = new Date(now.getTime() + 300_000);
        const [a, b] = await Promise.all([
          repo.claimDueCandidates(1, now, lease),
          repo.claimDueCandidates(1, now, lease),
        ]);
        const ids = new Set([...a, ...b].map((row) => row.id));
        expect(ids.size).toBeLessThanOrEqual(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('terminal candidates are not claimed', async () => {
      const suffix = randomUUID().slice(0, 8);
      const tokenId = 960000 + Math.floor(Math.random() * 10000);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix, tokenId);
      const now = new Date('2026-09-19T18:30:00.000Z');
      const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
      try {
        const candidate = await seedSparseBridgeCandidate(prisma, org.id, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: {
            lifecycleState: 'REJECTED',
            rejectionReason: 'RISE_NOT_STABLE',
            recoveryNextAttemptAt: now,
          },
        });
        const claimed = await repo.claimDueCandidates(5, now, new Date(now.getTime() + 60_000));
        expect(claimed.some((row) => row.id === candidate.id)).toBe(false);
        const { recovery } = buildRecoveryStack(prisma);
        const terminalResult = await recovery.recoverCandidateById(candidate.id, now);
        expect(terminalResult.outcome).toBe('TERMINAL_NO_ACTION');
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('no-data backoff persists attempt state without inventing rejection', async () => {
      const suffix = randomUUID().slice(0, 8);
      const tokenId = 961000 + Math.floor(Math.random() * 10000);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix, tokenId);
      const now = new Date('2026-09-19T18:30:00.000Z');
      try {
        const candidate = await seedSparseBridgeCandidate(prisma, org.id, vehicle.id);
        const before = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { recoveryNextAttemptAt: now, recoveryAttemptCount: 2 },
        });
        const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
        const recovery = new RawRefuelCandidateRecoveryService(
          prisma as unknown as PrismaService,
          RawRefuelCandidateService.withFixedClock(
            prisma as unknown as PrismaService,
            now,
          ),
          convergence,
        ).withSampleFetcher(async () => ({ status: 'EMPTY' as const }));
        const result = await recovery.recoverCandidateById(candidate.id, now);
        expect(result.outcome).toBe('NO_MATCHING_OBSERVATION');
        const after = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(after.lifecycleState).toBe(before.lifecycleState);
        expect(after.rejectionReason).toBe(before.rejectionReason);
        expect(after.recoveryAttemptCount).toBeGreaterThanOrEqual(2);
        expect(after.recoveryNextAttemptAt).not.toBeNull();
        const backoffMs = after.recoveryNextAttemptAt!.getTime() - now.getTime();
        expect(backoffMs).toBeGreaterThanOrEqual(
          computeRawRefuelCandidateRecoveryBackoffMs(after.recoveryAttemptCount) - 5_000,
        );
        expect(backoffMs).toBeGreaterThanOrEqual(RAW_REFUEL_CANDIDATE_RECOVERY_MIN_BACKOFF_MS);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('promotion flags ON still do not create fallback VEE via recovery', async () => {
      const suffix = randomUUID().slice(0, 8);
      const tokenId = 962000 + Math.floor(Math.random() * 10000);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix, tokenId);
      const now = new Date('2026-09-19T18:30:00.000Z');
      try {
        const candidate = await seedSparseBridgeCandidate(prisma, org.id, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { recoveryNextAttemptAt: now },
        });
        const { recovery } = buildRecoveryStack(prisma);
        await recovery.recoverCandidateById(candidate.id, now);
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);
