import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGeneralizedEvidenceClass,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import { BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV } from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import { GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION } from '../generalized-evidence.constants';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../../shutdown-evidence/shutdown-evidence.constants';
import { probePostgresDatabase } from '../../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { computeFeatureInputDigestFromSnapshot } from './feature-input-canonical.serializer';
import type { RestSessionFeatureInputSnapshotV1 } from './rest-session-feature-input-snapshot.types';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';

const LIVE = process.env.BATTERY_V2_REST_SESSION_FEATURE_COMPUTATION_INTEGRATION === '1';

async function createOrgVehicle(prisma: PrismaClient, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `C3 ${label} ${suffix}`,
      businessType: 'FLEET',
      status: 'ACTIVE',
    },
  });
  const vehicleId = randomUUID();
  const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
  const plate = `${label}-${suffix}`.slice(0, 32);
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${org.id}::uuid,
      ${vin},
      'Test',
      'ICE',
      2024,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${plate},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

async function createMeasurement(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  observedAt: Date,
) {
  return prisma.batteryMeasurement.create({
    data: {
      organizationId,
      vehicleId,
      scope: BatteryEvidenceScope.LV,
      type: BatteryMeasurementType.LIVE_VOLTAGE,
      numericValue: 14.2,
      unit: 'V',
      quality: BatteryMeasurementQuality.VALID,
      observedAt,
      receivedAt: new Date(observedAt.getTime() + 1000),
      providerTimestamp: observedAt,
      idempotencyKey: `meas:${randomUUID()}`,
    },
  });
}

async function createGe(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    sourceMeasurementId: string;
    restSessionId?: string | null;
    tripId?: string | null;
    evidenceClass: BatteryGeneralizedEvidenceClass;
    actualRestAgeMs?: number | null;
    voltage?: number;
    observedAt: Date;
    nominalRestIntervalIndex?: number | null;
  },
) {
  return prisma.batteryGeneralizedEvidenceObservation.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sourceMeasurementId: input.sourceMeasurementId,
      restSessionId: input.restSessionId ?? null,
      tripId: input.tripId ?? null,
      ingestedAt: new Date(input.observedAt.getTime() + 2000),
      evidenceClass: input.evidenceClass,
      evidenceConfidence: 'MEDIUM',
      classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
      actualRestAgeMs: input.actualRestAgeMs ?? null,
      nominalRestIntervalIndex: input.nominalRestIntervalIndex ?? null,
      voltage: input.voltage ?? 13.85,
      voltageObservedAt: input.observedAt,
      providerObservationAt: input.observedAt,
      providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      engineRunning: false,
      stateObservedAt: input.observedAt,
      stateTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
      stateCompleteness: BatteryShutdownStateCompleteness.COMPLETE,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      atomicClaim: false,
      idempotencyKey: `ge:${randomUUID()}`,
    },
  });
}

async function buildRestingSessionFixture(prisma: PrismaClient) {
  const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'FIX');
  const tripEnd = new Date('2026-09-22T13:50:25.000Z');
  const anchor = new Date('2026-09-22T13:50:28.000Z');
  const trip = await prisma.vehicleTrip.create({
    data: {
      vehicleId,
      tripStatus: TripStatus.COMPLETED,
      startTime: new Date(tripEnd.getTime() - 600_000),
      endTime: tripEnd,
      distanceKm: 1.5,
      outsideTemperatureStartC: 20,
    },
  });
  const session = await prisma.batteryRestSession.create({
    data: {
      id: randomUUID(),
      organizationId,
      vehicleId,
      anchorType: 'PHYSICAL_SHUTDOWN',
      anchorAt: anchor,
      confirmedTripId: trip.id,
      sessionStatus: BatteryRestSessionStatus.RESTING,
      openedAt: anchor,
      confirmedAt: new Date(anchor.getTime() + 1000),
      idempotencyKey: `rs:${randomUUID()}`,
    },
  });
  const anchorMeas = await createMeasurement(prisma, organizationId, vehicleId, anchor);
  await createGe(prisma, {
    organizationId,
    vehicleId,
    sourceMeasurementId: anchorMeas.id,
    restSessionId: session.id,
    tripId: trip.id,
    evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
    actualRestAgeMs: 0,
    voltage: 14.2,
    observedAt: anchor,
  });
  const restMeas = await createMeasurement(
    prisma,
    organizationId,
    vehicleId,
    new Date(anchor.getTime() + 3_600_000),
  );
  await createGe(prisma, {
    organizationId,
    vehicleId,
    sourceMeasurementId: restMeas.id,
    restSessionId: session.id,
    tripId: trip.id,
    evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
    actualRestAgeMs: 3_600_000,
    voltage: 13.9,
    observedAt: new Date(anchor.getTime() + 3_600_000),
    nominalRestIntervalIndex: 1,
  });
  return { organizationId, vehicleId, sessionId: session.id, tripId: trip.id, anchor };
}

(LIVE ? describe : describe.skip)(
  'RestSessionFeatureComputationService integration (BATTERY_V2_REST_SESSION_FEATURE_COMPUTATION_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let service: RestSessionFeatureComputationService;
    let dbOk = false;
    const shadowEnvBackup = process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];

    beforeAll(async () => {
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = 'true';
      dbOk = await probePostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
      service = new RestSessionFeatureComputationService(prisma as unknown as PrismaService);
    }, 120_000);

    afterAll(async () => {
      if (shadowEnvBackup === undefined) {
        delete process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];
      } else {
        process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = shadowEnvBackup;
      }
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    it('PG_A: first write creates semanticRevision=1', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      const result = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
        computedAt: new Date('2026-09-23T10:00:00.000Z'),
      });
      expect(result.status).toBe('CREATED');
      if (result.status === 'CREATED') {
        expect(result.row.semanticRevision).toBe(1);
        expect(result.row.numberOfValidRestPoints).toBeGreaterThanOrEqual(1);
      }
    });

    it('PG_B: same input idempotency', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      const first = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      const countAfterFirst = await prisma.batteryRestSessionFeature.count({
        where: { restSessionId: fx.sessionId },
      });
      const second = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
        computedAt: new Date('2026-09-23T11:00:00.000Z'),
      });
      expect(first.status).toBe('CREATED');
      expect(second.status).toBe('DUPLICATE_EXISTING');
      const countAfterSecond = await prisma.batteryRestSessionFeature.count({
        where: { restSessionId: fx.sessionId },
      });
      expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('PG_C: new eligible retention point → revision 2', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      const meas = await createMeasurement(
        prisma,
        fx.organizationId,
        fx.vehicleId,
        new Date(fx.anchor.getTime() + 7_200_000),
      );
      await createGe(prisma, {
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        sourceMeasurementId: meas.id,
        restSessionId: fx.sessionId,
        tripId: fx.tripId,
        evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
        actualRestAgeMs: 7_200_000,
        observedAt: new Date(fx.anchor.getTime() + 7_200_000),
        nominalRestIntervalIndex: 2,
      });
      const next = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      expect(next.status).toBe('CREATED');
      if (next.status === 'CREATED') {
        expect(next.row.semanticRevision).toBe(2);
      }
    });

    it('PG_D: late trip association changes digest', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-D');
      const anchor = new Date('2026-09-22T14:00:00.000Z');
      const session = await prisma.batteryRestSession.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt: anchor,
          sessionStatus: BatteryRestSessionStatus.RESTING,
          openedAt: anchor,
          idempotencyKey: `rs:${randomUUID()}`,
        },
      });
      const first = await service.computeAndPersist({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      const trip = await prisma.vehicleTrip.create({
        data: {
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: new Date(anchor.getTime() - 300_000),
          endTime: new Date(anchor.getTime() - 3000),
          distanceKm: 1,
        },
      });
      await prisma.batteryRestSession.update({
        where: { id: session.id },
        data: { confirmedTripId: trip.id },
      });
      const second = await service.computeAndPersist({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      expect(first.status).toBe('CREATED');
      expect(second.status).toBe('CREATED');
      if (first.status === 'CREATED' && second.status === 'CREATED') {
        expect(second.row.inputDigest).not.toBe(first.row.inputDigest);
        expect(second.row.semanticRevision).toBe(2);
      }
    });

    it('PG_E: finalization INCREMENTAL → FINAL', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      const inc = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      await prisma.batteryRestSession.update({
        where: { id: fx.sessionId },
        data: {
          sessionStatus: BatteryRestSessionStatus.ENDED,
          endedAt: new Date(fx.anchor.getTime() + 86_400_000),
          endReason: 'VEHICLE_ACTIVITY',
        },
      });
      const fin = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      expect(inc.status).toBe('CREATED');
      expect(fin.status).toBe('CREATED');
      if (inc.status === 'CREATED' && fin.status === 'CREATED') {
        expect(inc.row.computationPhase).toBe(
          BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        );
        expect(fin.row.computationPhase).toBe(BatteryRestSessionFeatureComputationPhase.FINAL);
      }
    });

    it('PG_F: invalidation preserves prior VALID rows', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      await prisma.batteryRestSession.update({
        where: { id: fx.sessionId },
        data: {
          sessionStatus: BatteryRestSessionStatus.INVALIDATED,
          endReason: 'INVALIDATED',
          endedAt: new Date(),
        },
      });
      const inv = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      const rows = await prisma.batteryRestSessionFeature.findMany({
        where: { restSessionId: fx.sessionId },
        orderBy: { semanticRevision: 'asc' },
      });
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(inv.status).toBe('CREATED');
      if (inv.status === 'CREATED') {
        expect(inv.row.sessionTrust).toBe(BatteryRestSessionFeatureSessionTrust.INVALIDATED);
      }
    });

    it('PG_G: concurrent same input → one row', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      const input = {
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      };
      const [a, b] = await Promise.all([
        service.computeAndPersist(input),
        service.computeAndPersist(input),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(['CREATED', 'DUPLICATE_EXISTING']);
      const count = await prisma.batteryRestSessionFeature.count({
        where: { restSessionId: fx.sessionId },
      });
      expect(count).toBe(1);
    });

    it('PG_H: concurrent revision safety under changed input', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      const meas = await createMeasurement(
        prisma,
        fx.organizationId,
        fx.vehicleId,
        new Date(fx.anchor.getTime() + 10_800_000),
      );
      await createGe(prisma, {
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        sourceMeasurementId: meas.id,
        restSessionId: fx.sessionId,
        tripId: fx.tripId,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        actualRestAgeMs: 10_800_000,
        observedAt: new Date(fx.anchor.getTime() + 10_800_000),
        nominalRestIntervalIndex: 3,
      });
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          service.computeAndPersist({
            organizationId: fx.organizationId,
            vehicleId: fx.vehicleId,
            restSessionId: fx.sessionId,
          }),
        ),
      );
      const created = results.filter((r) => r.status === 'CREATED');
      const dup = results.filter((r) => r.status === 'DUPLICATE_EXISTING');
      expect(created.length).toBeGreaterThanOrEqual(1);
      expect(created.length + dup.length).toBe(4);
      const rev2Rows = await prisma.batteryRestSessionFeature.findMany({
        where: { restSessionId: fx.sessionId, semanticRevision: 2 },
      });
      expect(rev2Rows.length).toBe(1);
    });

    it('PG_I: tenant isolation SESSION_NOT_FOUND', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      const wrong = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: randomUUID(),
      });
      expect(wrong.status).toBe('SESSION_NOT_FOUND');
      const wrongVehicle = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: randomUUID(),
        restSessionId: fx.sessionId,
      });
      expect(wrongVehicle.status).toBe('SESSION_NOT_FOUND');
    });

    it('PG_J: inputSummary verifies against inputDigest', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      const result = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      expect(result.status).toBe('CREATED');
      if (result.status !== 'CREATED') return;
      const digest = computeFeatureInputDigestFromSnapshot(
        result.row.inputSummary as RestSessionFeatureInputSnapshotV1,
      );
      expect(digest).toBe(result.row.inputDigest);
    });

    it('PG_K: authoritative tables unchanged', async () => {
      if (!dbOk) return;
      const before = {
        bf: await prisma.batteryFeatures.count(),
        ba: await prisma.batteryAssessment.count(),
        bp: await prisma.batteryPublication.count(),
      };
      const fx = await buildRestingSessionFixture(prisma);
      await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      expect(await prisma.batteryFeatures.count()).toBe(before.bf);
      expect(await prisma.batteryAssessment.count()).toBe(before.ba);
      expect(await prisma.batteryPublication.count()).toBe(before.bp);
    });

    it('PG_L: append-only history preserved', async () => {
      if (!dbOk) return;
      const fx = await buildRestingSessionFixture(prisma);
      const r1 = await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      const meas = await createMeasurement(
        prisma,
        fx.organizationId,
        fx.vehicleId,
        new Date(fx.anchor.getTime() + 14_400_000),
      );
      await createGe(prisma, {
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        sourceMeasurementId: meas.id,
        restSessionId: fx.sessionId,
        tripId: fx.tripId,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        actualRestAgeMs: 14_400_000,
        observedAt: new Date(fx.anchor.getTime() + 14_400_000),
        nominalRestIntervalIndex: 4,
      });
      await service.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      expect(r1.status).toBe('CREATED');
      if (r1.status !== 'CREATED') return;
      const persistedR1 = await prisma.batteryRestSessionFeature.findUnique({
        where: { id: r1.row.id },
      });
      expect(persistedR1?.semanticRevision).toBe(1);
      expect(persistedR1?.inputDigest).toBe(r1.row.inputDigest);
    });

    it('PG_M: flag off performs no feature writes', async () => {
      if (!dbOk) return;
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = 'false';
      const fx = await buildRestingSessionFixture(prisma);
      const before = await prisma.batteryRestSessionFeature.count();
      const offService = new RestSessionFeatureComputationService(
        prisma as unknown as PrismaService,
      );
      const result = await offService.computeAndPersist({
        organizationId: fx.organizationId,
        vehicleId: fx.vehicleId,
        restSessionId: fx.sessionId,
      });
      expect(result.status).toBe('SKIPPED_FLAG_OFF');
      expect(await prisma.batteryRestSessionFeature.count()).toBe(before);
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = 'true';
    });
  },
);
