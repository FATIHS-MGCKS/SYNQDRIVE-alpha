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
import { RawRefuelCandidateRecoveryRepository } from './raw-refuel-candidate-recovery.repository';
import { RawRefuelCandidateRecoveryService } from './raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  buildSparseBridgeRefuelEpisodeSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'F10.6.8-B3 stale worker after lease expiry (PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let releaseStalledFetch: (() => void) | undefined;

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

    function createRecoveryService(label: string, clockRef: { now: Date }) {
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
        .withLeaseMs(1_000)
        .withRecoveryClock(() => clockRef.now)
        .withSampleFetcher(async () => {
          if (label === 'A') {
            await new Promise<void>((resolve) => {
              releaseStalledFetch = resolve;
            });
          }
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

    it('rejects stale replica A mutations after replica B reclaims expired lease', async () => {
      const suffix = randomUUID().slice(0, 8);
      const org = await prisma.organization.create({
        data: {
          companyName: `B3 stale ${suffix}`,
          businessType: 'RENTAL',
          status: 'ACTIVE',
        },
      });
      const dimoVehicle = await prisma.dimoVehicle.create({
        data: {
          externalId: `stale-${suffix}`,
          tokenId: 980000 + Math.floor(Math.random() * 10000),
          fuelType: 'GASOLINE',
          powertrainType: 'ICE',
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: org.id,
          dimoVehicleId: dimoVehicle.id,
          vin: `ST${suffix}`.slice(0, 17).padEnd(17, '0'),
          licensePlate: `ST-${suffix}`.slice(0, 12),
          make: 'Test',
          model: 'RFRF',
          year: 2024,
          fuelType: FuelType.GASOLINE,
          status: 'AVAILABLE',
        },
      });

      const t0 = new Date('2026-09-19T18:30:00.000Z');
      const clockRef = { now: t0 };
      const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
      const recoveryA = createRecoveryService('A', clockRef);
      const recoveryB = createRecoveryService('B', clockRef);

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
        const candidateService = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          t0,
        );
        const seeded = await candidateService.resolveOrCreateCandidate(partial.candidates[0]);
        const candidateId = seeded.candidateId;

        await prisma.rawRefuelCandidate.update({
          where: { id: candidateId },
          data: { recoveryNextAttemptAt: t0 },
        });

        const leaseEnd = new Date(t0.getTime() + 1_000);
        const claimedA = await repo.claimDueCandidates(1, t0, leaseEnd);
        expect(claimedA).toHaveLength(1);
        const genA = claimedA[0].recoveryAttemptCount;

        const attemptAPromise = recoveryA.recoverCandidateById(candidateId, t0);

        await new Promise((resolve) => setTimeout(resolve, 50));
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        const t6 = new Date(t0.getTime() + 2_000);
        clockRef.now = t6;
        const leaseB = new Date(t6.getTime() + 300_000);
        const claimedB = await repo.claimDueCandidates(1, t6, leaseB);
        expect(claimedB).toHaveLength(1);
        expect(claimedB[0].recoveryAttemptCount).toBe(genA + 1);

        const bResult = await recoveryB.recoverCandidateById(candidateId, t6);
        expect(bResult.detail).not.toBe('stale_claim');
        expect(['SUCCESS_MATURED_READY', 'PENDING_NATIVE_RECONCILIATION']).toContain(
          bResult.outcome,
        );

        const afterB = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidateId },
        });
        const bOutcome = afterB.recoveryLastOutcome;
        const bNext = afterB.recoveryNextAttemptAt;
        const bLease = afterB.recoveryLeaseExpiresAt;
        const bLifecycle = afterB.lifecycleState;
        const bPostPlateau = afterB.postPlateauSampleCount;

        releaseStalledFetch?.();
        const attemptA = await attemptAPromise;
        expect(attemptA.detail).toBe('stale_claim');

        const finalRow = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidateId },
        });
        expect(finalRow.id).toBe(candidateId);
        expect(finalRow.recoveryLastOutcome).toBe(bOutcome);
        expect(finalRow.recoveryNextAttemptAt?.toISOString()).toBe(bNext?.toISOString());
        expect(finalRow.recoveryLeaseExpiresAt?.toISOString() ?? null).toBe(
          bLease?.toISOString() ?? null,
        );
        expect(finalRow.lifecycleState).toBe(bLifecycle);
        expect(finalRow.postPlateauSampleCount).toBe(bPostPlateau);
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          1,
        );
      } finally {
        await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
        await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
        await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicle.id } });
        await prisma.organization.deleteMany({ where: { id: org.id } });
      }
    });
  },
);
