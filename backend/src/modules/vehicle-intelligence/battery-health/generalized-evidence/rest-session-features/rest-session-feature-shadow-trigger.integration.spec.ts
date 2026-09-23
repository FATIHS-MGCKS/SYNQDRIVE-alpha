import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGeneralizedEvidenceClass,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BatteryRestSessionEndReason,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionStatus,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import {
  BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV,
  BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV,
} from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import { GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION } from '../generalized-evidence.constants';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../../shutdown-evidence/shutdown-evidence.constants';
import { probePostgresDatabase } from '../../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { BatteryRestSessionService } from '../battery-rest-session.service';
import { GeneralizedEvidenceRepository } from '../generalized-evidence.repository';
import { LateTripAssociationService } from '../late-trip-association.service';
import type { GeneralizedEvidenceFieldBundle } from '../generalized-evidence.types';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';
import { RestSessionFeatureShadowTriggerService } from './rest-session-feature-shadow-trigger.service';
import type { RestSessionFeatureInputSnapshotV1 } from './rest-session-feature-input-snapshot.types';

const LIVE = process.env.BATTERY_V2_REST_SESSION_FEATURE_SHADOW_INTEGRATION === '1';

function restFields(at: Date, overrides: Partial<GeneralizedEvidenceFieldBundle> = {}): GeneralizedEvidenceFieldBundle {
  return {
    voltage: 12.3,
    voltageObservedAt: at,
    voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
    speedKmh: 0,
    speedObservedAt: at,
    speedTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    ignitionOn: false,
    ignitionObservedAt: at,
    ignitionTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    engineRunning: false,
    engineRunningObservedAt: at,
    engineRunningTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    isLvCharging: false,
    isHvCharging: false,
    chargingContextObservedAt: at,
    chargingContextTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    activeTrip: false,
    activeTripObservedAt: at,
    activeTripTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.INGEST_WALL_CLOCK,
    vehicleOnline: true,
    vehicleOnlineObservedAt: at,
    providerLastSeenAt: at,
    ...overrides,
  };
}

async function createOrgVehicle(prisma: PrismaClient, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `C4 ${label} ${suffix}`,
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

async function createMeasurement(prisma: PrismaClient, organizationId: string, vehicleId: string, observedAt: Date) {
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
      receivedAt: new Date(observedAt.getTime() + 1000),
      providerTimestamp: observedAt,
      idempotencyKey: `meas:${randomUUID()}`,
    },
  });
}

async function createGeObservation(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    sourceMeasurementId: string;
    evidenceClass: BatteryGeneralizedEvidenceClass;
    observedAt: Date;
    tripId?: string | null;
    stateAlignmentClass?: BatteryShutdownStateAlignmentClass;
  },
) {
  return prisma.batteryGeneralizedEvidenceObservation.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sourceMeasurementId: input.sourceMeasurementId,
      ingestedAt: new Date(input.observedAt.getTime() + 2000),
      evidenceClass: input.evidenceClass,
      evidenceConfidence: 'MEDIUM',
      classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
      voltage: 12.3,
      voltageObservedAt: input.observedAt,
      providerObservationAt: input.observedAt,
      providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      engineRunning: false,
      stateObservedAt: input.observedAt,
      stateTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
      stateCompleteness: BatteryShutdownStateCompleteness.COMPLETE,
      stateAlignmentClass: input.stateAlignmentClass ?? BatteryShutdownStateAlignmentClass.ALIGNED,
      atomicClaim: false,
      tripId: input.tripId ?? null,
      idempotencyKey: `ge:${randomUUID()}`,
    },
  });
}

function buildC4Stack(prisma: PrismaClient, computation?: RestSessionFeatureComputationService) {
  const repository = new GeneralizedEvidenceRepository(prisma as never);
  const featureComputation =
    computation ?? new RestSessionFeatureComputationService(prisma as unknown as PrismaService);
  const trigger = new RestSessionFeatureShadowTriggerService(featureComputation);
  const restSessions = new BatteryRestSessionService(repository, undefined, trigger);
  const lateTrip = new LateTripAssociationService(prisma as never, repository, undefined, trigger);
  return { repository, restSessions, lateTrip, trigger, featureComputation };
}

async function openSessionWithAnchor(
  prisma: PrismaClient,
  restSessions: BatteryRestSessionService,
  organizationId: string,
  vehicleId: string,
  anchorAt: Date,
) {
  const meas = await createMeasurement(prisma, organizationId, vehicleId, anchorAt);
  const obs = await createGeObservation(prisma, {
    organizationId,
    vehicleId,
    sourceMeasurementId: meas.id,
    evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
    observedAt: anchorAt,
  });
  await restSessions.processObservation({
    organizationId,
    vehicleId,
    observation: obs,
    fields: restFields(anchorAt),
    referenceAt: anchorAt,
    stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
  });
  const session = await prisma.batteryRestSession.findFirstOrThrow({
    where: { vehicleId, sessionStatus: { in: ['CANDIDATE', 'RESTING', 'CONFIRMED'] } },
  });
  return { session, anchorObsId: obs.id };
}

(LIVE ? describe : describe.skip)(
  'RestSessionFeatureShadowTrigger C4 integration (BATTERY_V2_REST_SESSION_FEATURE_SHADOW_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    const shadowBackup = process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];
    const geBackup = process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV];

    beforeAll(async () => {
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = 'true';
      process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
      dbOk = await probePostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 120_000);

    afterAll(async () => {
      if (shadowBackup === undefined) {
        delete process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];
      } else {
        process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = shadowBackup;
      }
      if (geBackup === undefined) {
        delete process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV];
      } else {
        process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = geBackup;
      }
      await prisma?.$disconnect().catch(() => undefined);
    });

    afterEach(async () => {
      if (!prisma) return;
      await prisma.batteryRestSessionFeature.deleteMany({});
      await prisma.batteryGeneralizedEvidenceObservation.deleteMany({});
      await prisma.batteryRestSession.deleteMany({});
      await prisma.batteryMeasurement.deleteMany({});
      await prisma.vehicleTrip.deleteMany({});
      await prisma.vehicle.deleteMany({});
      await prisma.organization.deleteMany({});
    });

    it('PG_A: valid rest point → INCREMENTAL feature with linked retention point', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'A');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-22T10:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      const restAt = new Date(anchorAt.getTime() + 3_600_000);
      const restMeas = await createMeasurement(prisma, organizationId, vehicleId, restAt);
      const restObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: restMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        observedAt: restAt,
      });
      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: restObs,
        fields: restFields(restAt),
        referenceAt: restAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      });

      const linked = await prisma.batteryGeneralizedEvidenceObservation.findUniqueOrThrow({
        where: { id: restObs.id },
      });
      expect(linked.restSessionId).toBe(session.id);
      expect(linked.actualRestAgeMs).toBe(3_600_000);

      const rows = await prisma.batteryRestSessionFeature.findMany({
        where: { restSessionId: session.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].computationPhase).toBe(BatteryRestSessionFeatureComputationPhase.INCREMENTAL);
      const summary = rows[0].inputSummary as RestSessionFeatureInputSnapshotV1;
      expect(summary.retentionPoints.some((p) => p.observationId === restObs.id)).toBe(true);
    });

    it('PG_B: invalid rest point → no feature row from invalid event', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'B');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-22T11:00:00.000Z');
      await openSessionWithAnchor(prisma, restSessions, organizationId, vehicleId, anchorAt);
      const restAt = new Date(anchorAt.getTime() + 3_600_000);
      const restMeas = await createMeasurement(prisma, organizationId, vehicleId, restAt);
      const restObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: restMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        observedAt: restAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.SKEWED,
      });
      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: restObs,
        fields: restFields(restAt),
        referenceAt: restAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.SKEWED,
      });
      const count = await prisma.batteryRestSessionFeature.count({ where: { organizationId } });
      expect(count).toBe(0);
    });

    it('PG_C: terminal after incremental preserves prior row and adds FINAL', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'C');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-22T12:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      const restAt = new Date(anchorAt.getTime() + 3_600_000);
      const restMeas = await createMeasurement(prisma, organizationId, vehicleId, restAt);
      const restObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: restMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        observedAt: restAt,
      });
      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: restObs,
        fields: restFields(restAt),
        referenceAt: restAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      });
      const driveAt = new Date(restAt.getTime() + 60_000);
      const driveMeas = await createMeasurement(prisma, organizationId, vehicleId, driveAt);
      const driveObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: driveMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
        observedAt: driveAt,
      });
      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: driveObs,
        fields: restFields(driveAt, { speedKmh: 40, engineRunning: true, ignitionOn: true }),
        referenceAt: driveAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      });
      const rows = await prisma.batteryRestSessionFeature.findMany({
        where: { restSessionId: session.id },
        orderBy: { semanticRevision: 'asc' },
      });
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.some((r) => r.computationPhase === BatteryRestSessionFeatureComputationPhase.INCREMENTAL)).toBe(
        true,
      );
      const finalRow = rows.find(
        (r) => r.computationPhase === BatteryRestSessionFeatureComputationPhase.FINAL,
      );
      expect(finalRow).toBeDefined();
      const summary = finalRow!.inputSummary as RestSessionFeatureInputSnapshotV1;
      expect(summary.session.computationPhase).toBe('FINAL');
      expect(summary.session.sessionStatus).toBe('ENDED');
      expect(summary.session.endedAt).not.toBeNull();
    });

    it('PG_D: zero-point terminal → FINAL with numberOfValidRestPoints=0', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'D');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-22T13:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      const driveAt = new Date(anchorAt.getTime() + 120_000);
      const driveMeas = await createMeasurement(prisma, organizationId, vehicleId, driveAt);
      const driveObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: driveMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
        observedAt: driveAt,
      });
      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: driveObs,
        fields: restFields(driveAt, { speedKmh: 30, engineRunning: true }),
        referenceAt: driveAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      });
      const rows = await prisma.batteryRestSessionFeature.findMany({ where: { restSessionId: session.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].computationPhase).toBe(BatteryRestSessionFeatureComputationPhase.FINAL);
      expect(rows[0].numberOfValidRestPoints).toBe(0);
    });

    it('PG_E: session timeout → FINAL with SESSION_TIMEOUT', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'E');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2020-01-01T00:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      const restAt = new Date('2026-09-22T14:00:00.000Z');
      const restMeas = await createMeasurement(prisma, organizationId, vehicleId, restAt);
      const restObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: restMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        observedAt: restAt,
      });
      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: restObs,
        fields: restFields(restAt),
        referenceAt: restAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      });
      const row = await prisma.batteryRestSessionFeature.findFirst({
        where: { restSessionId: session.id },
        orderBy: { semanticRevision: 'desc' },
      });
      expect(row?.computationPhase).toBe(BatteryRestSessionFeatureComputationPhase.FINAL);
      const summary = row?.inputSummary as RestSessionFeatureInputSnapshotV1;
      expect(summary.session.endReason).toBe(BatteryRestSessionEndReason.SESSION_TIMEOUT);
    });

    it('PG_F: late trip association changes digest and adds revision when prior exists', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'F');
      const { restSessions, lateTrip } = buildC4Stack(prisma);
      const tripEnd = new Date('2026-09-22T15:00:00.000Z');
      const anchorAt = new Date(tripEnd.getTime() + 2_000);
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      const restAt = new Date(anchorAt.getTime() + 3_600_000);
      const restMeas = await createMeasurement(prisma, organizationId, vehicleId, restAt);
      const restObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: restMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        observedAt: restAt,
      });
      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: restObs,
        fields: restFields(restAt),
        referenceAt: restAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      });
      const before = await prisma.batteryRestSessionFeature.findMany({
        where: { restSessionId: session.id },
      });
      expect(before).toHaveLength(1);
      const trip = await prisma.vehicleTrip.create({
        data: {
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: new Date(tripEnd.getTime() - 600_000),
          endTime: tripEnd,
          distanceKm: 2,
          outsideTemperatureStartC: 20,
        },
      });
      const linked = await lateTrip.associateAfterTripFinalization({
        vehicleId,
        tripId: trip.id,
        tripEndedAt: tripEnd,
      });
      expect(linked).toBe(1);
      const updatedSession = await prisma.batteryRestSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(updatedSession.confirmedTripId).toBe(trip.id);
      const after = await prisma.batteryRestSessionFeature.findMany({
        where: { restSessionId: session.id },
        orderBy: { semanticRevision: 'asc' },
      });
      expect(after.length).toBeGreaterThanOrEqual(2);
      expect(after[0].inputDigest).not.toBe(after[after.length - 1].inputDigest);
      const latestSummary = after[after.length - 1].inputSummary as RestSessionFeatureInputSnapshotV1;
      expect(latestSummary.session.confirmedTripId).toBe(trip.id);
    });

    it('PG_G: repeated identical trigger → DUPLICATE_EXISTING (one digest row)', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'G');
      const { trigger } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-22T16:00:00.000Z');
      const session = await prisma.batteryRestSession.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt,
          sessionStatus: BatteryRestSessionStatus.RESTING,
          openedAt: anchorAt,
          idempotencyKey: `rs:${randomUUID()}`,
        },
      });
      const first = await trigger.triggerFeatureComputation({
        organizationId,
        vehicleId,
        restSessionId: session.id,
        reason: 'REST_SESSION_TERMINAL',
      });
      const second = await trigger.triggerFeatureComputation({
        organizationId,
        vehicleId,
        restSessionId: session.id,
        reason: 'REST_SESSION_TERMINAL',
      });
      expect(first.status).toBe('CREATED');
      expect(second.status).toBe('DUPLICATE_EXISTING');
      expect(await prisma.batteryRestSessionFeature.count({ where: { restSessionId: session.id } })).toBe(1);
    });

    it('PG_H: multi-client same event → one logical row', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'H');
      const prismaA = new PrismaClient();
      const prismaB = new PrismaClient();
      const stackA = buildC4Stack(prismaA);
      const stackB = buildC4Stack(prismaB);
      const anchorAt = new Date('2026-09-22T17:00:00.000Z');
      const session = await prisma.batteryRestSession.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt,
          sessionStatus: BatteryRestSessionStatus.RESTING,
          openedAt: anchorAt,
          idempotencyKey: `rs:${randomUUID()}`,
        },
      });
      const input = {
        organizationId,
        vehicleId,
        restSessionId: session.id,
        reason: 'VALID_REST_OBSERVATION_LINKED' as const,
      };
      const [a, b] = await Promise.all([
        stackA.trigger.triggerFeatureComputation(input),
        stackB.trigger.triggerFeatureComputation(input),
      ]);
      expect([a.status, b.status].sort()).toEqual(['CREATED', 'DUPLICATE_EXISTING'].sort());
      expect(await prisma.batteryRestSessionFeature.count({ where: { restSessionId: session.id } })).toBe(1);
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    });

    it('PG_I: fail-open rest-session path when C3 throws', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'I');
      const throwing = {
        computeAndPersist: jest.fn().mockRejectedValue(new Error('inject-rest')),
      } as unknown as RestSessionFeatureComputationService;
      const { restSessions } = buildC4Stack(prisma, throwing);
      const anchorAt = new Date('2026-09-22T18:00:00.000Z');
      await openSessionWithAnchor(prisma, restSessions, organizationId, vehicleId, anchorAt);
      const restAt = new Date(anchorAt.getTime() + 3_600_000);
      const restMeas = await createMeasurement(prisma, organizationId, vehicleId, restAt);
      const restObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: restMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        observedAt: restAt,
      });
      await expect(
        restSessions.processObservation({
          organizationId,
          vehicleId,
          observation: restObs,
          fields: restFields(restAt),
          referenceAt: restAt,
          stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        }),
      ).resolves.toBe('session_updated');
      const linked = await prisma.batteryGeneralizedEvidenceObservation.findUniqueOrThrow({
        where: { id: restObs.id },
      });
      expect(linked.restSessionId).not.toBeNull();
      expect(await prisma.batteryRestSessionFeature.count({ where: { organizationId } })).toBe(0);
    });

    it('PG_J: fail-open late association when C3 throws', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'J');
      const throwing = {
        computeAndPersist: jest.fn().mockRejectedValue(new Error('inject-late')),
      } as unknown as RestSessionFeatureComputationService;
      const { lateTrip } = buildC4Stack(prisma, throwing);
      const tripEnd = new Date('2026-09-22T19:00:00.000Z');
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
          endReason: BatteryRestSessionEndReason.VEHICLE_ACTIVITY,
          idempotencyKey: `rs:${randomUUID()}`,
        },
      });
      const trip = await prisma.vehicleTrip.create({
        data: {
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: new Date(tripEnd.getTime() - 600_000),
          endTime: tripEnd,
          distanceKm: 1,
          outsideTemperatureStartC: 18,
        },
      });
      const linked = await lateTrip.associateAfterTripFinalization({
        vehicleId,
        tripId: trip.id,
        tripEndedAt: tripEnd,
      });
      expect(linked).toBe(1);
      const updated = await prisma.batteryRestSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(updated.confirmedTripId).toBe(trip.id);
    });

    it('PG_K: authoritative battery tables unchanged by C4 triggers', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'K');
      const before = {
        features: await prisma.batteryFeatures.count(),
        assessments: await prisma.batteryAssessment.count(),
        publications: await prisma.batteryPublication.count(),
      };
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-22T20:00:00.000Z');
      await openSessionWithAnchor(prisma, restSessions, organizationId, vehicleId, anchorAt);
      const after = {
        features: await prisma.batteryFeatures.count(),
        assessments: await prisma.batteryAssessment.count(),
        publications: await prisma.batteryPublication.count(),
      };
      expect(after).toEqual(before);
    });

    it('PG_L: flag OFF → lifecycle persists, feature table unchanged', async () => {
      if (!dbOk) return;
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = 'false';
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'L');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-22T21:00:00.000Z');
      await openSessionWithAnchor(prisma, restSessions, organizationId, vehicleId, anchorAt);
      const restAt = new Date(anchorAt.getTime() + 3_600_000);
      const restMeas = await createMeasurement(prisma, organizationId, vehicleId, restAt);
      const restObs = await createGeObservation(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: restMeas.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        observedAt: restAt,
      });
      await restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: restObs,
        fields: restFields(restAt),
        referenceAt: restAt,
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      });
      expect(await prisma.batteryRestSessionFeature.count({ where: { organizationId } })).toBe(0);
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = 'true';
    });
  },
);
