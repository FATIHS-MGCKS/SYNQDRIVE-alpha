import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  KS_MS_661_OBSERVED_DETECTION_WINDOW,
} from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-observed.fixture';
import { KS_MS_661_SYNTHETIC_ABSOLUTE_FUEL_SAMPLES } from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-synthetic.fixture';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { detectRawFuelRises } from './raw-fuel-rise-detector';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from './raw-fuel-rise-detector.config';
import {
  buildDetectorPhysicsContext,
  linearRiseSamples,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';

const LIVE = process.env.RAW_FUEL_RISE_F2_HANDOFF_INTEGRATION === '1';

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

async function createTestOrgVehicle(prisma: PrismaClient) {
  const suffix = randomUUID().slice(0, 8);
  const org = await prisma.organization.create({
    data: {
      companyName: `RFRF F3 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `F3${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `F3-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, suffix };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, orgId: string) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

(LIVE ? describe : describe.skip)(
  'raw-fuel-rise-detector F2 handoff (RAW_FUEL_RISE_F2_HANDOFF_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let service: RawRefuelCandidateService;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('RAW_FUEL_RISE_F2_HANDOFF_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
      service = RawRefuelCandidateService.withFixedClock(
        prisma as unknown as PrismaService,
        '2026-09-06T10:00:00.000Z',
      );
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('F3_F2_REPEAT_IDEMPOTENCY — same detection twice yields one row', async () => {
      const { org, vehicle } = await createTestOrgVehicle(prisma);
      try {
        const context = {
          organizationId: org.id,
          vehicleId: vehicle.id,
          scanWindowStart: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
          scanWindowEnd: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
          absoluteSignalTrust: 'TRUSTED' as const,
          absoluteDetectionAdmissibility: 'ADMISSIBLE' as const,
          relativeSignalAvailable: false,
          signalProvider: 'DIMO',
          detectionVersion: RFRF_RISE_DETECTION_VERSION,
          detectorVersion: RFRF_RISE_DETECTOR_VERSION,
        };
        const samples = KS_MS_661_SYNTHETIC_ABSOLUTE_FUEL_SAMPLES.map((s) => ({
          timestamp: new Date(s.timestamp),
          absoluteLiters: s.absoluteLiters,
          relativePercent: s.relativePercent,
        }));
        const detection = detectRawFuelRises({ context, samples });
        expect(detection.candidates).toHaveLength(1);

        const first = await service.resolveOrCreateCandidate(detection.candidates[0]);
        const second = await service.resolveOrCreateCandidate(detection.candidates[0]);
        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(second.candidateId).toBe(first.candidateId);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          1,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('F3_F2_WINDOW_EXPANSION_IDEMPOTENCY — wider scan window same physical refuel', async () => {
      const { org, vehicle } = await createTestOrgVehicle(prisma);
      try {
        const samples = [
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ];
        const narrow = detectRawFuelRises({
          context: buildDetectorPhysicsContext({
            organizationId: org.id,
            vehicleId: vehicle.id,
            scanWindowStart: new Date('2026-09-06T08:00:00.000Z'),
            scanWindowEnd: new Date('2026-09-06T09:00:00.000Z'),
          }),
          samples,
        });
        const wide = detectRawFuelRises({
          context: buildDetectorPhysicsContext({
            organizationId: org.id,
            vehicleId: vehicle.id,
            scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
            scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
          }),
          samples,
        });
        expect(narrow.candidates).toHaveLength(1);
        expect(wide.candidates).toHaveLength(1);

        const narrowRow = await service.resolveOrCreateCandidate(narrow.candidates[0]);
        const wideRow = await service.resolveOrCreateCandidate(wide.candidates[0]);
        expect(wideRow.created).toBe(false);
        expect(wideRow.candidateId).toBe(narrowRow.candidateId);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          1,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('F3_F2_DELAYED_EVIDENCE_MATURATION — OBSERVED then richer post same row', async () => {
      const { org, vehicle } = await createTestOrgVehicle(prisma);
      try {
        const partialSamples = [
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ];
        const fullSamples = [
          ...partialSamples,
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ];
        const ctx = buildDetectorPhysicsContext({
          organizationId: org.id,
          vehicleId: vehicle.id,
        });
        const partial = detectRawFuelRises({ context: ctx, samples: partialSamples });
        const full = detectRawFuelRises({ context: ctx, samples: fullSamples });
        expect(partial.candidates).toHaveLength(1);
        expect(full.candidates).toHaveLength(1);
        expect(partial.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');
        expect(full.candidates[0].lifecycleState).toBe('READY_FOR_PERSIST');

        const first = await service.resolveOrCreateCandidate(partial.candidates[0]);
        const matured = await service.resolveOrCreateCandidate(full.candidates[0]);
        expect(matured.candidateId).toBe(first.candidateId);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          1,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('F3_F2_STEPPED_REFUEL_SINGLE_IDENTITY — stepped plateau one row', async () => {
      const { org, vehicle } = await createTestOrgVehicle(prisma);
      try {
        const samples = [
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [16, 16, 16, 30], 120),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ];
        const detection = detectRawFuelRises({
          context: buildDetectorPhysicsContext({
            organizationId: org.id,
            vehicleId: vehicle.id,
          }),
          samples,
        });
        expect(detection.candidates).toHaveLength(1);

        const first = await service.resolveOrCreateCandidate(detection.candidates[0]);
        const second = await service.resolveOrCreateCandidate(detection.candidates[0]);
        expect(second.candidateId).toBe(first.candidateId);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          1,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);
