import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { evaluateRawRefuelCandidateReadiness } from '../raw-fuel-refuel-fallback/raw-refuel-candidate-readiness.evaluator';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { detectRawFuelRises } from './raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  buildSparseBridgeRefuelEpisodeSamples,
  sampleAt,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION === '1';

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
    data: {
      companyName: `RFRF F10.6.6-A.1 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `A1${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `A1-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  return { org, vehicle };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, organizationId: string) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
}

(LIVE ? describe : describe.skip)(
  'raw-fuel-rise-liveness PostgreSQL (RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let service: RawRefuelCandidateService;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL');
      }
      prisma = new PrismaClient();
      service = RawRefuelCandidateService.withFixedClock(
        prisma as unknown as PrismaService,
        '2026-09-19T17:00:00.000Z',
      );
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('F10_6_6_A1 — sparse-bridge episode persists one row then matures to READY on delayed post rescan', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const scanContext = buildDetectorPhysicsContext({
        organizationId: org.id,
        vehicleId: vehicle.id,
        scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
      });

      try {
        const pass1Samples = buildSparseBridgeRefuelEpisodeSamples(false);
        const pass1Detection = detectRawFuelRises({
          context: scanContext,
          samples: pass1Samples,
        });
        expect(pass1Detection.candidates).toHaveLength(1);
        expect(pass1Detection.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');

        const rowCountBefore = await prisma.rawRefuelCandidate.count({
          where: { vehicleId: vehicle.id },
        });
        expect(rowCountBefore).toBe(0);

        const firstResolve = await service.resolveOrCreateCandidate(pass1Detection.candidates[0]);
        expect(firstResolve.created).toBe(true);
        const candidateId = firstResolve.candidateId;
        const lifecycleBefore = firstResolve.lifecycleState;

        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);

        const pass2Samples = buildSparseBridgeRefuelEpisodeSamples(true);
        const pass2Detection = detectRawFuelRises({
          context: scanContext,
          samples: pass2Samples,
        });
        expect(pass2Detection.candidates).toHaveLength(1);
        expect(pass2Detection.candidates[0].lifecycleState).toBe('READY_FOR_PERSIST');
        expect(pass2Detection.candidates[0].rejectionReason).toBeNull();

        const secondResolve = await service.resolveOrCreateCandidate(pass2Detection.candidates[0]);
        expect(secondResolve.created).toBe(false);
        expect(secondResolve.updated).toBe(true);
        expect(secondResolve.candidateId).toBe(candidateId);

        const rowCountAfter = await prisma.rawRefuelCandidate.count({
          where: { vehicleId: vehicle.id },
        });
        expect(rowCountAfter).toBe(1);

        const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidateId },
        });
        expect(row.lifecycleState).toBe('READY_FOR_PERSIST');
        expect(row.rejectionReason).toBeNull();
        expect(row.evidenceRevisionFingerprint).not.toBe(firstResolve.evidenceRevisionFingerprint);
        expect(row.maxSampleGapSeconds).toBeGreaterThan(360);

        const readiness = evaluateRawRefuelCandidateReadiness(row, {
          capability: 'FUEL_CAPABLE',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
        });
        expect(readiness.ready).toBe(true);
        expect(readiness.reasonCode).toBe('READY');

        expect({
          POSTGRES_WOB_RESCAN_TEST_PASS: true,
          SAME_ROW_ID_PRESERVED: secondResolve.candidateId === candidateId,
          ROW_COUNT_BEFORE: rowCountBefore,
          ROW_COUNT_AFTER: rowCountAfter,
          LIFECYCLE_BEFORE: lifecycleBefore,
          LIFECYCLE_AFTER: row.lifecycleState,
          READINESS_AFTER: readiness.reasonCode,
        }).toEqual({
          POSTGRES_WOB_RESCAN_TEST_PASS: true,
          SAME_ROW_ID_PRESERVED: true,
          ROW_COUNT_BEFORE: 0,
          ROW_COUNT_AFTER: 1,
          LIFECYCLE_BEFORE: lifecycleBefore,
          LIFECYCLE_AFTER: 'READY_FOR_PERSIST',
          READINESS_AFTER: 'READY',
        });
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('F10_6_6_A1 — strict-gap detector rejection leaves existing non-terminal row unchanged (runtime path)', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const scanContext = buildDetectorPhysicsContext({
        organizationId: org.id,
        vehicleId: vehicle.id,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });

      try {
        const partial = buildSparseBridgeRefuelEpisodeSamples(false);
        const partialCtx = buildDetectorPhysicsContext({
          organizationId: org.id,
          vehicleId: vehicle.id,
          scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
          scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
        });
        const partialDetection = detectRawFuelRises({
          context: partialCtx,
          samples: partial,
        });
        const seeded = await service.resolveOrCreateCandidate(partialDetection.candidates[0]);
        const before = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: seeded.candidateId },
        });

        const strictGapSamples = [
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          sampleAt('2026-09-06T08:16:00.000Z', 20),
          sampleAt('2026-09-06T08:24:00.000Z', 26),
          sampleAt('2026-09-06T08:32:00.000Z', 30),
        ];
        const strictDetection = detectRawFuelRises({
          context: scanContext,
          samples: strictGapSamples,
        });
        expect(strictDetection.candidates).toHaveLength(0);
        expect(
          strictDetection.rejectedOrHeld.some((item) => item.reason === 'SAMPLE_GAP_TOO_LARGE'),
        ).toBe(true);

        const after = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: seeded.candidateId },
        });
        expect(after.lifecycleState).toBe(before.lifecycleState);
        expect(after.rejectionReason).toBe(before.rejectionReason);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);
