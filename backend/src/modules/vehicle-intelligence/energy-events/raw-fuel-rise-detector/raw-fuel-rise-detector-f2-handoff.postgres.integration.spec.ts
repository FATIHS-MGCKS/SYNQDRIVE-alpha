import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  KS_MS_661_FIXTURE_ORGANIZATION_ID,
  KS_MS_661_FIXTURE_VEHICLE_ID,
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

    it('detector → F2 service yields one candidate on repeated detection', async () => {
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

      try {
        const context = {
          organizationId: org.id,
          vehicleId: vehicle.id,
          scanWindowStart: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
          scanWindowEnd: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
          absoluteSignalTrust: 'TRUSTED' as const,
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
        await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId: vehicle.id } });
        await prisma.vehicle.deleteMany({ where: { id: vehicle.id } });
        await prisma.organization.deleteMany({ where: { id: org.id } });
      }
    });
  },
);
