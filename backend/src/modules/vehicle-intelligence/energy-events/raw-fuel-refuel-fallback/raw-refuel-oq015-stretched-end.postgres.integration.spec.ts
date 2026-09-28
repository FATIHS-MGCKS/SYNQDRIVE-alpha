import { randomUUID } from 'crypto';
import {
  FuelType,
  PhysicalRefuelFinalityState,
  PrismaClient,
  type RawRefuelCandidate,
} from '@prisma/client';
import {
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV } from '@config/physical-refuel-reconciliation.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import {
  buildWob20260919AuthoritativeNativeRow,
  buildWob20260919StretchedEndCandidate,
} from './testing/wob-2026-09-19-stretched-end.fixture';

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
      powertrainType: 'ICE',
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

function candidateCreateData(
  vehicleId: string,
  organizationId: string,
  candidate: RawRefuelCandidate,
) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = candidate;
  return {
    ...rest,
    vehicleId,
    organizationId,
    firstObservedAt: candidate.firstObservedAt,
    lastObservedAt: candidate.lastObservedAt,
  };
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
      const fixture = buildWob20260919StretchedEndCandidate();
      const nativeRow = buildWob20260919AuthoritativeNativeRow();
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      try {
        const candidate = await prisma.rawRefuelCandidate.create({
          data: candidateCreateData(vehicle.id, org.id, fixture),
        });
        const native = await prisma.vehicleEnergyEvent.create({
          data: {
            vehicleId: vehicle.id,
            organizationId: org.id,
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
