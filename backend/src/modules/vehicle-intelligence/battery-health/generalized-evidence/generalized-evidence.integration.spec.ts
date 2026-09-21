import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGeneralizedEvidenceClass,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BatteryRestSessionStatus,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';
import { BatteryRestSessionService } from './battery-rest-session.service';
import { LateTripAssociationService } from './late-trip-association.service';
import { buildGeneralizedEvidenceIdempotencyKey } from './generalized-evidence-idempotency.policy';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../shutdown-evidence/shutdown-evidence.constants';
import { GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION } from './generalized-evidence.constants';

const LIVE = process.env.BATTERY_V2_GENERALIZED_EVIDENCE_INTEGRATION === '1';

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
  'generalized evidence (PostgreSQL integration)',
  () => {
    let prisma: PrismaClient;
    let repository: GeneralizedEvidenceRepository;
    let restSessions: BatteryRestSessionService;
    let lateTrip: LateTripAssociationService;
    let organizationId = '';
    let vehicleId = '';

    beforeAll(async () => {
      process.env.BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED = 'true';
      if (!(await probeDatabase())) {
        throw new Error(
          'BATTERY_V2_GENERALIZED_EVIDENCE_INTEGRATION=1 requires reachable DATABASE_URL',
        );
      }
      prisma = new PrismaClient();
      repository = new GeneralizedEvidenceRepository(prisma as never);
      restSessions = new BatteryRestSessionService(repository);
      lateTrip = new LateTripAssociationService(prisma as never, repository);
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const org = await prisma.organization.create({
        data: {
          companyName: `GenEv Org ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      organizationId = org.id;
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId,
          licensePlate: `GE-${suffix}`,
          vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
          make: 'Test',
          model: 'ICE',
          year: 2024,
          fuelType: 'GASOLINE',
          status: 'AVAILABLE',
        },
      });
      vehicleId = vehicle.id;
    });

    afterEach(async () => {
      if (!organizationId) return;
      await prisma.batteryGeneralizedEvidenceObservation.deleteMany({
        where: { organizationId },
      });
      await prisma.batteryRestSession.deleteMany({ where: { organizationId } });
      await prisma.batteryMeasurement.deleteMany({ where: { organizationId } });
      await prisma.vehicleTrip.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    async function createMeasurement(observedAt: Date) {
      return prisma.batteryMeasurement.create({
        data: {
          organizationId,
          vehicleId,
          scope: BatteryEvidenceScope.LV,
          type: BatteryMeasurementType.LIVE_VOLTAGE,
          numericValue: 12.3,
          unit: 'V',
          quality: BatteryMeasurementQuality.VALID,
          observedAt,
          idempotencyKey: `meas:${randomUUID()}`,
        },
      });
    }

    async function createEvidenceRow(input: {
      measurementId: string;
      idempotencyKey: string;
      voltageObservedAt?: Date | null;
      actualRestAgeMs?: number | null;
    }) {
      return repository.createObservationIdempotent({
        id: randomUUID(),
        organization: { connect: { id: organizationId } },
        vehicle: { connect: { id: vehicleId } },
        sourceMeasurement: { connect: { id: input.measurementId } },
        sourceKind: 'LIVE_VOLTAGE_CLASSIFY',
        voltage: 12.3,
        voltageObservedAt: input.voltageObservedAt ?? null,
        providerObservationAt: input.voltageObservedAt ?? null,
        providerTimestampSource: input.voltageObservedAt
          ? SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP
          : SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN,
        ingestedAt: new Date(),
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        evidenceConfidence: 'MEDIUM',
        classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
        actualRestAgeMs: input.actualRestAgeMs ?? null,
        stateCompleteness: BatteryShutdownStateCompleteness.COMPLETE,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        atomicClaim: false,
        idempotencyKey: input.idempotencyKey,
      });
    }

    it('A/B: schema + FK to battery_measurements', async () => {
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
            'battery_generalized_evidence_observations',
            'battery_rest_sessions'
          )`;
      expect(tables.length).toBe(2);

      const at = new Date('2026-09-21T12:00:00.000Z');
      const measurement = await createMeasurement(at);
      const key = buildGeneralizedEvidenceIdempotencyKey({
        vehicleId,
        sourceMeasurementId: measurement.id,
      });
      expect(await createEvidenceRow({ measurementId: measurement.id, idempotencyKey: key })).toBe(
        'created',
      );
    });

    it('C/D: evidence idempotency under duplicate and concurrent insert', async () => {
      const at = new Date('2026-09-21T12:00:00.000Z');
      const measurement = await createMeasurement(at);
      const key = buildGeneralizedEvidenceIdempotencyKey({
        vehicleId,
        sourceMeasurementId: measurement.id,
      });
      const payload = {
        id: randomUUID(),
        organization: { connect: { id: organizationId } },
        vehicle: { connect: { id: vehicleId } },
        sourceMeasurement: { connect: { id: measurement.id } },
        sourceKind: 'LIVE_VOLTAGE_CLASSIFY',
        voltage: 12.3,
        ingestedAt: new Date(),
        evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
        evidenceConfidence: 'MEDIUM' as const,
        classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
        stateCompleteness: BatteryShutdownStateCompleteness.COMPLETE,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        atomicClaim: false,
        idempotencyKey: key,
      };

      const results = await Promise.all([
        repository.createObservationIdempotent(payload),
        repository.createObservationIdempotent({ ...payload, id: randomUUID() }),
      ]);
      expect(results.filter((r) => r === 'created').length).toBe(1);
      expect(results.filter((r) => r === 'duplicate').length).toBe(1);
    });

    it('E/F: single active session under repeated and concurrent open', async () => {
      const anchorA = new Date('2026-09-21T20:00:00.000Z');
      const anchorB = new Date('2026-09-21T20:00:30.000Z');

      const open = (anchorAt: Date) =>
        repository.claimOrCreateActiveRestSession({
          id: randomUUID(),
          organization: { connect: { id: organizationId } },
          vehicle: { connect: { id: vehicleId } },
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt,
          sessionStatus: BatteryRestSessionStatus.CANDIDATE,
          openedAt: anchorAt,
          idempotencyKey: `rest-session:${vehicleId}:${anchorAt.getTime()}`,
        });

      const first = await open(anchorA);
      expect(first.created).toBe(true);
      const second = await open(anchorB);
      expect(second.created).toBe(false);
      expect(second.sessionId).toBe(first.sessionId);

      const concurrent = await Promise.all([open(anchorA), open(anchorB), open(anchorA)]);
      const uniqueSessions = new Set(concurrent.map((r) => r.sessionId));
      expect(uniqueSessions.size).toBe(1);

      const activeCount = await prisma.batteryRestSession.count({
        where: {
          vehicleId,
          sessionStatus: { in: ['CANDIDATE', 'CONFIRMED', 'RESTING'] },
        },
      });
      expect(activeCount).toBe(1);
    });

    it('G: anchor observation linked with actualRestAgeMs=0', async () => {
      const anchorAt = new Date('2026-09-21T21:00:00.000Z');
      const measurement = await createMeasurement(anchorAt);
      const obs = await prisma.batteryGeneralizedEvidenceObservation.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          sourceMeasurementId: measurement.id,
          ingestedAt: new Date(),
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
          evidenceConfidence: 'MEDIUM',
          classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
          voltageObservedAt: anchorAt,
          stateCompleteness: BatteryShutdownStateCompleteness.COMPLETE,
          stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
          atomicClaim: false,
          idempotencyKey: `gen-ev:${vehicleId}:${measurement.id}`,
        },
      });

      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: obs,
        fields: {
          voltage: 12.3,
          voltageObservedAt: anchorAt,
          voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
          speedKmh: 0,
          speedObservedAt: anchorAt,
          speedTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
          ignitionOn: false,
          ignitionObservedAt: anchorAt,
          ignitionTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
          engineRunning: false,
          engineRunningObservedAt: anchorAt,
          engineRunningTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
          isLvCharging: false,
          isHvCharging: false,
          chargingContextObservedAt: anchorAt,
          chargingContextTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
          activeTrip: false,
          activeTripObservedAt: anchorAt,
          activeTripTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.INGEST_WALL_CLOCK,
          vehicleOnline: true,
          vehicleOnlineObservedAt: anchorAt,
          providerLastSeenAt: anchorAt,
        },
        referenceAt: anchorAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      });

      const linked = await prisma.batteryGeneralizedEvidenceObservation.findUniqueOrThrow({
        where: { id: obs.id },
      });
      expect(linked.restSessionId).not.toBeNull();
      expect(linked.actualRestAgeMs).toBe(0);
    });

    it('H/I: late trip association for active and ENDED sessions', async () => {
      const tripEnd = new Date('2026-09-21T22:00:00.000Z');
      const trip = await prisma.vehicleTrip.create({
        data: {
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: new Date(tripEnd.getTime() - 3600_000),
          endTime: tripEnd,
        },
      });

      const session = await prisma.batteryRestSession.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt: tripEnd,
          sessionStatus: BatteryRestSessionStatus.ENDED,
          openedAt: tripEnd,
          endedAt: new Date(tripEnd.getTime() + 600_000),
          endReason: 'VEHICLE_ACTIVITY',
          idempotencyKey: `rest-session:${vehicleId}:${tripEnd.getTime()}`,
        },
      });

      const linked = await lateTrip.associateAfterTripFinalization({
        vehicleId,
        tripId: trip.id,
        tripEndedAt: tripEnd,
      });
      expect(linked).toBe(1);

      const updated = await prisma.batteryRestSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(updated.confirmedTripId).toBe(trip.id);
    });

    it('J: missing provider voltage timestamp → null actualRestAgeMs', async () => {
      const measurement = await createMeasurement(new Date());
      const key = buildGeneralizedEvidenceIdempotencyKey({
        vehicleId,
        sourceMeasurementId: measurement.id,
      });
      await createEvidenceRow({
        measurementId: measurement.id,
        idempotencyKey: key,
        voltageObservedAt: null,
        actualRestAgeMs: null,
      });
      const row = await prisma.batteryGeneralizedEvidenceObservation.findFirstOrThrow({
        where: { idempotencyKey: key },
      });
      expect(row.actualRestAgeMs).toBeNull();
    });

    it('K: transaction rollback leaves no orphan active session', async () => {
      const anchorAt = new Date('2026-09-21T23:00:00.000Z');
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.batteryRestSession.create({
            data: {
              id: randomUUID(),
              organizationId,
              vehicleId,
              anchorType: 'PHYSICAL_SHUTDOWN',
              anchorAt,
              sessionStatus: BatteryRestSessionStatus.CANDIDATE,
              openedAt: anchorAt,
              idempotencyKey: `rest-session:${vehicleId}:${anchorAt.getTime()}`,
            },
          });
          throw new Error('rollback probe');
        }),
      ).rejects.toThrow('rollback probe');

      const count = await prisma.batteryRestSession.count({ where: { vehicleId } });
      expect(count).toBe(0);
    });
  },
);
