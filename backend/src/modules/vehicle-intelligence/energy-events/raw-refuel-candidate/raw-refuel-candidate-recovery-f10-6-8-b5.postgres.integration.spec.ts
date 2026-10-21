import { randomUUID } from 'crypto';
import { FuelType, PrismaClient } from '@prisma/client';
import {
  RFRF_CANDIDATE_RECOVERY_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelConvergenceService } from '../raw-fuel-refuel-fallback/raw-refuel-convergence.service';
import * as recoveryFencing from './raw-refuel-candidate-recovery-fencing';
import { RawRefuelCandidateRecoveryRepository } from './raw-refuel-candidate-recovery.repository';
import { RawRefuelCandidateRecoveryService } from './raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  buildSparseBridgeRefuelEpisodeSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('F10.6.8-B5 recovery fencing (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL required');
    }
    process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'true';
    process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
    process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV] = 'true';
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  async function seedVehicle(suffix: string) {
    const org = await prisma.organization.create({
      data: {
        companyName: `B5 ${suffix}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    const dimoVehicle = await prisma.dimoVehicle.create({
      data: {
        externalId: `b5-${suffix}`,
        tokenId: 990000 + Math.floor(Math.random() * 10000),
        fuelType: 'GASOLINE',
        powertrainType: 'ICE',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        dimoVehicleId: dimoVehicle.id,
        vin: `B5${suffix}`.slice(0, 17).padEnd(17, '0'),
        licensePlate: `B5-${suffix}`.slice(0, 12),
        make: 'Test',
        model: 'RFRF',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: 'AVAILABLE',
      },
    });
    return { org, vehicle, dimoVehicle };
  }

  async function seedSparseCandidate(orgId: string, vehicleId: string, t0: Date) {
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
    const candidateService = RawRefuelCandidateService.withFixedClock(
      prisma as unknown as PrismaService,
      t0,
    );
    const resolved = await candidateService.resolveOrCreateCandidate(partial.candidates[0]);
    return resolved.candidateId;
  }

  function buildRecovery(clockRef: { now: Date }, candidateService: RawRefuelCandidateService) {
    const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
    return new RawRefuelCandidateRecoveryService(
      prisma as unknown as PrismaService,
      candidateService,
      convergence,
    )
      .withLeaseMs(2_000)
      .withRecoveryClock(() => clockRef.now)
      .withSampleFetcher(async () => ({
        status: 'OK' as const,
        samples: buildSparseBridgeRefuelEpisodeSamples(true).map((s) => ({
          timestamp: s.timestamp,
          absoluteLiters: s.absoluteLiters ?? null,
          relativePercent: s.relativePercent ?? null,
        })),
      }));
  }

  it('post-reconcile lease expiry blocks convergence in same attempt', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-20T10:00:00.000Z');
    const clockRef = { now: t0 };
    const candidateService = RawRefuelCandidateService.withFixedClock(
      prisma as unknown as PrismaService,
      t0,
    );
    const recovery = buildRecovery(clockRef, candidateService);
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);

    const originalReconcile = candidateService.reconcileExistingCandidateByIdForRecoveryClaim.bind(
      candidateService,
    );
    candidateService.reconcileExistingCandidateByIdForRecoveryClaim = async (...args) => {
      const result = await originalReconcile(...args);
      clockRef.now = new Date(t0.getTime() + 10_000);
      return result;
    };

    try {
      const candidateId = await seedSparseCandidate(org.id, vehicle.id, t0);
      await prisma.rawRefuelCandidate.update({
        where: { id: candidateId },
        data: { recoveryNextAttemptAt: t0 },
      });
      const leaseEnd = new Date(t0.getTime() + 2_000);
      const claimed = await repo.claimDueCandidates(1, t0, leaseEnd);
      expect(claimed).toHaveLength(1);

      const result = await recovery.recoverCandidateById(candidateId, t0);
      expect(result.detail).toBe('stale_claim');
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidateId },
      });
      expect(row.lifecycleState).not.toBe('CONVERGED_NATIVE');
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(0);
    } finally {
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('READY path rejects convergence when lease expires before convergence TX', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-20T11:00:00.000Z');
    const clockRef = { now: t0 };
    const candidateService = RawRefuelCandidateService.withFixedClock(
      prisma as unknown as PrismaService,
      t0,
    );
    const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
    const recovery = buildRecovery(clockRef, candidateService);
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);

    const originalConvergence = convergence.evaluateAndApplyConvergenceById.bind(convergence);
    convergence.evaluateAndApplyConvergenceById = async (...args) => {
      clockRef.now = new Date(t0.getTime() + 10_000);
      return originalConvergence(...args);
    };
    (recovery as unknown as { convergenceService: RawRefuelConvergenceService }).convergenceService =
      convergence;

    try {
      const candidateId = await seedSparseCandidate(org.id, vehicle.id, t0);
      await prisma.rawRefuelCandidate.update({
        where: { id: candidateId },
        data: {
          lifecycleState: 'READY_FOR_PERSIST',
          postPlateauSampleCount: 4,
          recoveryNextAttemptAt: t0,
        },
      });
      const leaseEnd = new Date(t0.getTime() + 2_000);
      await repo.claimDueCandidates(1, t0, leaseEnd);

      const result = await recovery.recoverCandidateById(candidateId, t0);
      expect(result.detail).toBe('stale_claim');
      expect(result.outcome).toBe('TERMINAL_NO_ACTION');
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidateId },
      });
      expect(row.lifecycleState).toBe('READY_FOR_PERSIST');
      expect(row.recoveryLeaseExpiresAt).not.toBeNull();
    } finally {
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('expired unreclaimed worker cannot complete recovery attempt', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-20T12:00:00.000Z');
    const clockRef = { now: t0 };
    const candidateService = RawRefuelCandidateService.withFixedClock(
      prisma as unknown as PrismaService,
      t0,
    );
    const recovery = buildRecovery(clockRef, candidateService);
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);

    try {
      const candidateId = await seedSparseCandidate(org.id, vehicle.id, t0);
      await prisma.rawRefuelCandidate.update({
        where: { id: candidateId },
        data: { recoveryNextAttemptAt: t0 },
      });
      const leaseEnd = new Date(t0.getTime() + 2_000);
      const claimed = await repo.claimDueCandidates(1, t0, leaseEnd);
      expect(claimed).toHaveLength(1);
      const gen = claimed[0].recoveryAttemptCount;
      const before = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidateId },
      });

      clockRef.now = new Date(t0.getTime() + 5_000);
      const result = await recovery.recoverCandidateById(candidateId, clockRef.now);
      expect(result.detail).toBe('stale_claim');

      const after = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidateId },
      });
      expect(after.recoveryAttemptCount).toBe(gen);
      expect(after.recoveryLastOutcome).toBe(before.recoveryLastOutcome);
      expect(after.recoveryNextAttemptAt?.toISOString()).toBe(
        before.recoveryNextAttemptAt?.toISOString(),
      );
      expect(after.recoveryLeaseExpiresAt?.getTime()).toBe(leaseEnd.getTime());
    } finally {
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it('propagates stale_claim when fenced completion rejects', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const t0 = new Date('2026-09-20T13:00:00.000Z');
    const clockRef = { now: t0 };
    const candidateService = RawRefuelCandidateService.withFixedClock(
      prisma as unknown as PrismaService,
      t0,
    );
    const recovery = buildRecovery(clockRef, candidateService);

    const spy = jest
      .spyOn(recoveryFencing, 'completeRecoveryAttemptFenced')
      .mockResolvedValueOnce('STALE_CLAIM');

    try {
      const candidateId = await seedSparseCandidate(org.id, vehicle.id, t0);
      await prisma.rawRefuelCandidate.update({
        where: { id: candidateId },
        data: {
          lifecycleState: 'REJECTED',
          rejectionReason: 'RISE_NOT_STABLE',
          recoveryNextAttemptAt: t0,
          recoveryLeaseExpiresAt: new Date(t0.getTime() + 60_000),
        },
      });

      const result = await recovery.recoverCandidateById(candidateId, t0);
      expect(result.detail).toBe('stale_claim');
      expect(result.outcome).toBe('TERMINAL_NO_ACTION');
    } finally {
      spy.mockRestore();
      await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
      await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
      await prisma.organization.deleteMany({ where: { id: org.id } });
    }
  });
});
