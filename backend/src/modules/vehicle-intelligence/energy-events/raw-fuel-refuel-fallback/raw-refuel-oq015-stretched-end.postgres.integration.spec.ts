import { randomUUID } from 'crypto';
import {
  FuelType,
  PhysicalRefuelFinalityState,
  PrismaClient,
} from '@prisma/client';
import {
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV } from '@config/physical-refuel-reconciliation.config';
import { PrismaService } from '@shared/database/prisma.service';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  buildSparseBridgeRefuelEpisodeSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import { buildWob20260919AuthoritativeNativeRow } from './testing/wob-2026-09-19-stretched-end.fixture';

const LIVE = process.env.RAW_FUEL_REFUEL_OQ015_INTEGRATION === '1';

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

function setEnv(): () => void {
  const keys = [
    RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
    RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
    RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
    PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV,
  ] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];
  process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'true';
  process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
  process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
  process.env[PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV] = '2026-09-01T00:00:00.000Z';
  process.env.RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT = '2026-09-18T10:25:41.000Z';
  return () => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: { companyName: `OQ015 ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `dimo-oq015-${suffix}`,
      tokenId: 930000 + Math.floor(Math.random() * 10000),
      fuelType: 'GASOLINE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `OQ${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `OQ-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: FuelType.GASOLINE,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, dimoVehicleId: dimoVehicle.id };
}

async function cleanup(
  prisma: PrismaClient,
  vehicleId: string,
  orgId: string,
  dimoVehicleId: string,
) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
  await prisma.vehicleEnergyEventRefuelReconciliation.deleteMany({ where: { vehicleId } });
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

async function seedWobSparseBridgeReadyCandidate(
  prisma: PrismaClient,
  orgId: string,
  vehicleId: string,
) {
  const scanContext = buildDetectorPhysicsContext({
    organizationId: orgId,
    vehicleId,
    scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
  });
  const partial = detectRawFuelRises({
    context: scanContext,
    samples: buildSparseBridgeRefuelEpisodeSamples(true),
  });
  const service = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-19T17:00:00.000Z',
  );
  const resolved = await service.resolveOrCreateCandidate(partial.candidates[0]);
  const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
    where: { id: resolved.candidateId },
  });
  return prisma.rawRefuelCandidate.update({
    where: { id: row.id },
    data: {
      lifecycleState: 'READY_FOR_PERSIST',
      maxSampleGapSeconds: 990,
      preFuelRelativePercent: 9.804,
      postFuelRelativePercent: 32.549,
      deltaRelativePercent: 22.745,
      relativeSignalAvailable: true,
    },
  });
}

(LIVE ? describe : describe.skip)(
  'RFRF OQ-015 stretched-end convergence (RAW_FUEL_REFUEL_OQ015_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let convergence: RawRefuelConvergenceService;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('RAW_FUEL_REFUEL_OQ015_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
      convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('09-19 stretched-end candidate converges to authoritative native without fallback VEE', async () => {
      const restore = setEnv();
      const suffix = randomUUID().slice(0, 8);
      const nativeRow = buildWob20260919AuthoritativeNativeRow();
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await seedWobSparseBridgeReadyCandidate(
          prisma,
          org.id,
          vehicle.id,
        );
        const native = await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            detectionSource: 'DIMO_NATIVE',
            dimoSegmentId: nativeRow.dimoSegmentId,
            kind: 'REFUEL',
            detectionMechanism: 'refuel',
            startTime: new Date(nativeRow.startTime),
            endTime: new Date(nativeRow.endTime),
            durationSeconds: nativeRow.durationSeconds ?? 2700,
            fuelDeltaLiters: nativeRow.fuelDeltaLiters,
            rawDetectionMeta: {
              fuelStartLiters: nativeRow.fuelStartLiters,
              fuelEndLiters: nativeRow.fuelEndLiters,
              fuelStartPercent: nativeRow.fuelStartPercent,
              fuelEndPercent: nativeRow.fuelEndPercent,
            },
          },
        });
        await prisma.vehicleEnergyEventRefuelReconciliation.create({
          data: {
            energyEventId: native.id,
            vehicleId: vehicle.id,
            reconciliationGroupId: `${vehicle.id}:wob-0919`,
            classification: 'SINGLE_CANONICAL',
            finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
            canonicalEventId: native.id,
            enrichmentEligible: true,
            settlementWindowOpen: false,
            lateSiblingConflict: false,
            reason: 'single_canonical',
            reasonCodes: [],
            coordinateLatitude: 51.33,
            coordinateLongitude: 9.51,
            coordinateSource: 'SELECTED',
            coordinateSelectionStatus: 'SELECTED',
          },
        });

        const context = {
          capability: 'FUEL_CAPABLE' as const,
          absoluteDetectionAdmissibility: 'ADMISSIBLE' as const,
          absoluteSignalTrust: 'UNKNOWN' as const,
        };
        const first = await convergence.evaluateAndApplyConvergence(
          candidate,
          context,
          process.env,
        );
        expect(first.status).toBe('CONVERGED_NATIVE');
        expect(first.convergedNativeEventId).toBe(native.id);
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);

        const second = await convergence.evaluateAndApplyConvergenceById(
          candidate.id,
          context,
          process.env,
        );
        expect(second.status).toBe('ALREADY_CONVERGED');
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
      } finally {
        restore();
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);
