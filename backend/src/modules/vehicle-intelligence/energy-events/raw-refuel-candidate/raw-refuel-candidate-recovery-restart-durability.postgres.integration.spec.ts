import { randomUUID } from 'crypto';
import { FuelType, PrismaClient } from '@prisma/client';
import {
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_CANDIDATE_RECOVERY_ENABLED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelConvergenceService } from '../raw-fuel-refuel-fallback/raw-refuel-convergence.service';
import { RawRefuelCandidateRecoveryRepository } from './raw-refuel-candidate-recovery.repository';
import { RawRefuelCandidateRecoveryService } from './raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  buildSparseBridgeRefuelEpisodeSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION === '1';

function createRecoveryService(prisma: PrismaClient, fetchCountRef: { count: number }, clockRef: { now: Date }) {
  const candidateService = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-19T17:00:00.000Z',
  );
  const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
  return new RawRefuelCandidateRecoveryService(
    prisma as unknown as PrismaService,
    candidateService,
    convergence,
  )
    .withRecoveryClock(() => clockRef.now).withSampleFetcher(async () => {
    fetchCountRef.count += 1;
    const samples = buildSparseBridgeRefuelEpisodeSamples(true);
    return {
      status: 'OK' as const,
      samples: samples.map((s) => ({
        timestamp: s.timestamp,
        absoluteLiters: s.absoluteLiters ?? null,
        relativePercent: s.relativePercent ?? null,
      })),
    };
  });
}

(LIVE ? describe : describe.skip)(
  'F10.6.8-B candidate recovery restart durability (PostgreSQL)',
  () => {
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

    it('reconstructs recovery from persisted DB state after service instance teardown', async () => {
      const suffix = randomUUID().slice(0, 8);
      const org = await prisma.organization.create({
        data: {
          companyName: `B restart ${suffix}`,
          businessType: 'RENTAL',
          status: 'ACTIVE',
        },
      });
      const dimoVehicle = await prisma.dimoVehicle.create({
        data: {
          externalId: `restart-${suffix}`,
          tokenId: 970000 + Math.floor(Math.random() * 10000),
          fuelType: 'GASOLINE',
          powertrainType: 'ICE',
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: org.id,
          dimoVehicleId: dimoVehicle.id,
          vin: `RB${suffix}`.slice(0, 17).padEnd(17, '0'),
          licensePlate: `RB-${suffix}`.slice(0, 12),
          make: 'Test',
          model: 'RFRF',
          year: 2024,
          fuelType: FuelType.GASOLINE,
          status: 'AVAILABLE',
        },
      });

      const now = new Date('2026-09-19T18:30:00.000Z');
      const clockRef = { now };
      const fetchRef1 = { count: 0 };
      let recovery1 = createRecoveryService(prisma, fetchRef1, clockRef);

      try {
        const scanContext = buildDetectorPhysicsContext({
          organizationId: org.id,
          vehicleId: vehicle.id,
          scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
          scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
        });
        const partial = detectRawFuelRises({
          context: scanContext,
          samples: buildSparseBridgeRefuelEpisodeSamples(false),
        });
        const candidateService1 = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          now,
        );
        const seeded = await candidateService1.resolveOrCreateCandidate(partial.candidates[0]);
        const candidateId = seeded.candidateId;

        await prisma.rawRefuelCandidate.update({
          where: { id: candidateId },
          data: { recoveryNextAttemptAt: now },
        });

        const repo1 = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
        const lease = new Date(now.getTime() + 300_000);
        const claimed = await repo1.claimDueCandidates(1, now, lease);
        expect(claimed).toHaveLength(1);
        expect(claimed[0].id).toBe(candidateId);

        const attempt1 = await recovery1.recoverCandidateById(candidateId, now);
        expect(attempt1.dimoFetchPerformed).toBe(true);
        expect(fetchRef1.count).toBe(1);

        const afterAttempt1 = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidateId },
        });
        expect(afterAttempt1.recoveryAttemptCount).toBeGreaterThan(0);
        expect(afterAttempt1.recoveryLastOutcome).not.toBeNull();
        expect(afterAttempt1.recoveryLastAttemptAt).not.toBeNull();
        const persistedNext = afterAttempt1.recoveryNextAttemptAt;

        const fetchRef2 = { count: 0 };
        const recovery2 = createRecoveryService(prisma, fetchRef2, clockRef);
        const dueAt =
          persistedNext && persistedNext.getTime() > now.getTime()
            ? persistedNext
            : new Date(now.getTime() + 600_000);
        clockRef.now = dueAt;
        await prisma.rawRefuelCandidate.update({
          where: { id: candidateId },
          data: {
            lifecycleState: 'READY_FOR_PERSIST',
            recoveryNextAttemptAt: dueAt,
            recoveryLeaseExpiresAt: null,
          },
        });

        const attempt2 = await recovery2.recoverCandidateById(candidateId, dueAt);
        expect(attempt2.dimoFetchPerformed).toBe(false);
        expect(fetchRef2.count).toBe(0);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        const afterAttempt2 = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidateId },
        });
        expect(afterAttempt2.id).toBe(candidateId);
        expect(afterAttempt2.recoveryAttemptCount).toBeGreaterThanOrEqual(
          afterAttempt1.recoveryAttemptCount,
        );
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
  },
);
