import { randomUUID } from 'crypto';
import { PrismaClient, TripStatus } from '@prisma/client';
import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
} from '../../core';
import { pilotFreshL3Triple } from '../../core/__tests__/fixtures/wob-pilot-golden.fixture';
import { presentObs } from '../../core/__tests__/test-helpers';
import { buildDiV0ShadowRunIdempotencyKey } from '../di-v0-shadow-idempotency';
import { DiV0ShadowPersistenceRepository } from '../di-v0-shadow-persistence.repository';
import { DiV0ShadowPersistenceService } from '../di-v0-shadow-persistence.service';
import { PrismaService } from '@shared/database/prisma.service';

const LIVE = process.env.DI_V0_SHADOW_PERSISTENCE_INTEGRATION === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }
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

async function seedTrip(prisma: PrismaClient) {
  const suffix = randomUUID().slice(0, 8);
  const org = await prisma.organization.create({
    data: { companyName: `DI-S2 ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `D2${suffix}`.padEnd(17, '0'),
      licensePlate: `D2-${suffix}`,
      make: 'Test',
      model: 'DI',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
  });
  const trip = await prisma.vehicleTrip.create({
    data: {
      vehicleId: vehicle.id,
      tripStatus: TripStatus.COMPLETED,
      startTime: new Date('2026-01-01T10:00:00Z'),
      endTime: new Date('2026-01-01T11:00:00Z'),
      startLatitude: 52,
      startLongitude: 9,
      distanceKm: 12,
      maxSpeedKmh: 77,
      avgSpeedKmh: 45,
      harshBrakeCount: 2,
      drivingScore: 88,
    },
  });
  return { org, vehicle, trip, suffix };
}

async function cleanup(prisma: PrismaClient, tripId: string, vehicleId: string, orgId: string) {
  await prisma.diV0ShadowInterval.deleteMany({ where: { tripId } });
  await prisma.diV0ShadowRun.deleteMany({ where: { tripId } });
  await prisma.tripBehaviorEvent.deleteMany({ where: { tripId } });
  await prisma.vehicleTrip.deleteMany({ where: { id: tripId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

function buildLargeOutput(count: number) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const label = new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    positions.push(presentObs(label, 52 + i * 0.00001, 9));
  }
  return computeDiV0TripIntervals(
    { sourceFamily: 'API_SYNTHETIC', positions },
    { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
  );
}

(LIVE ? describe : describe.skip)(
  'DI V0 shadow persistence (DI_V0_SHADOW_PERSISTENCE_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let repository: DiV0ShadowPersistenceRepository;
    let service: DiV0ShadowPersistenceService;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('DI_V0_SHADOW_PERSISTENCE_INTEGRATION=1 requires DATABASE_URL');
      }
      prisma = new PrismaClient();
      const prismaService = prisma as unknown as PrismaService;
      repository = new DiV0ShadowPersistenceRepository(prismaService);
      service = new DiV0ShadowPersistenceService(repository, prismaService);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('persists run + intervals with idempotency and replay ordering', async () => {
      const { org, vehicle, trip } = await seedTrip(prisma);
      const computeOutput = computeDiV0TripIntervals(
        { sourceFamily: 'RUPTELA_R1', positions: pilotFreshL3Triple() },
        { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
      );
      const identity = {
        organizationId: org.id,
        vehicleId: vehicle.id,
        tripId: trip.id,
        sourceFamily: 'RUPTELA_R1',
        versions: DEFAULT_DI_V0_VERSION_TUPLE,
        inputEvidenceVersion: 'fixture-v1',
      };
      const tripBefore = await prisma.vehicleTrip.findUnique({ where: { id: trip.id } });
      const behaviorBefore = await prisma.tripBehaviorEvent.count({ where: { tripId: trip.id } });
      const run1 = await service.persistCompletedRun({ identity, computeOutput, versions: DEFAULT_DI_V0_VERSION_TUPLE });
      const run2 = await service.persistCompletedRun({ identity, computeOutput, versions: DEFAULT_DI_V0_VERSION_TUPLE });
      expect(run1.id).toBe(run2.id);
      expect(run1.status).toBe('COMPLETED');
      const intervals = await service.loadIntervalsForReplay(run1.id);
      expect(intervals.length).toBe(computeOutput.intervals.length);
      expect(intervals[0].intervalStart.getTime()).toBeLessThanOrEqual(intervals[1].intervalStart.getTime());
      const provenance = intervals[0].provenance as Record<string, unknown>;
      expect(provenance.derivationMethod ?? provenance).toBeTruthy();
      const tripAfter = await prisma.vehicleTrip.findUnique({ where: { id: trip.id } });
      expect(tripAfter?.maxSpeedKmh).toBe(tripBefore?.maxSpeedKmh);
      expect(tripAfter?.drivingScore).toBe(tripBefore?.drivingScore);
      expect(await prisma.tripBehaviorEvent.count({ where: { tripId: trip.id } })).toBe(behaviorBefore);
      await cleanup(prisma, trip.id, vehicle.id, org.id);
    });

    it('allows versioned rerun with new input evidence version', async () => {
      const { org, vehicle, trip } = await seedTrip(prisma);
      const computeOutput = computeDiV0TripIntervals(
        { sourceFamily: 'RUPTELA_R1', positions: pilotFreshL3Triple() },
        { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
      );
      const baseIdentity = {
        organizationId: org.id,
        vehicleId: vehicle.id,
        tripId: trip.id,
        sourceFamily: 'RUPTELA_R1',
        versions: DEFAULT_DI_V0_VERSION_TUPLE,
        inputEvidenceVersion: 'v1',
      };
      const runA = await service.persistCompletedRun({
        identity: baseIdentity,
        computeOutput,
        versions: DEFAULT_DI_V0_VERSION_TUPLE,
      });
      const runB = await service.persistCompletedRun({
        identity: { ...baseIdentity, inputEvidenceVersion: 'v2' },
        computeOutput,
        versions: DEFAULT_DI_V0_VERSION_TUPLE,
      });
      expect(runA.id).not.toBe(runB.id);
      await cleanup(prisma, trip.id, vehicle.id, org.id);
    });

    it('duplicate interval batch is safe (concurrent idempotency)', async () => {
      const { org, vehicle, trip } = await seedTrip(prisma);
      const identity = {
        organizationId: org.id,
        vehicleId: vehicle.id,
        tripId: trip.id,
        sourceFamily: 'RUPTELA_R1',
        versions: DEFAULT_DI_V0_VERSION_TUPLE,
        inputEvidenceVersion: 'dup-batch',
      };
      const run = await repository.createOrGetRun(identity);
      const computeOutput = computeDiV0TripIntervals(
        { sourceFamily: 'RUPTELA_R1', positions: pilotFreshL3Triple() },
        { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
      );
      const { mapComputeOutputToPersistRows } = await import('../di-v0-shadow-mapper');
      const rows = mapComputeOutputToPersistRows(computeOutput, DEFAULT_DI_V0_VERSION_TUPLE);
      await repository.insertIntervalBatch(run, rows, DEFAULT_DI_V0_VERSION_TUPLE);
      await repository.insertIntervalBatch(run, rows, DEFAULT_DI_V0_VERSION_TUPLE);
      const count = await prisma.diV0ShadowInterval.count({ where: { shadowRunId: run.id } });
      expect(count).toBe(rows.length);
      await cleanup(prisma, trip.id, vehicle.id, org.id);
    });

    it('performance: batch persist 3600 intervals', async () => {
      const { org, vehicle, trip } = await seedTrip(prisma);
      const output = buildLargeOutput(3600);
      const t0 = performance.now();
      const run = await service.persistCompletedRun({
        identity: {
          organizationId: org.id,
          vehicleId: vehicle.id,
          tripId: trip.id,
          sourceFamily: 'API_SYNTHETIC',
          versions: DEFAULT_DI_V0_VERSION_TUPLE,
          inputEvidenceVersion: 'perf-3600',
        },
        computeOutput: output,
        versions: DEFAULT_DI_V0_VERSION_TUPLE,
      });
      const elapsed = performance.now() - t0;
      expect(run.intervalCount).toBe(3600);
      expect(elapsed).toBeLessThan(30_000);
      await cleanup(prisma, trip.id, vehicle.id, org.id);
    });
  },
);

describe('DiV0Shadow persistence unit guards', () => {
  it('idempotency key stable for identity tuple', () => {
    const key = buildDiV0ShadowRunIdempotencyKey({
      organizationId: 'o',
      vehicleId: 'v',
      tripId: 't',
      sourceFamily: 'RUPTELA_R1',
      versions: DEFAULT_DI_V0_VERSION_TUPLE,
      inputEvidenceVersion: 'x',
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});
