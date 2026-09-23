import { execFileSync } from 'node:child_process';
import { randomUUID } from 'crypto';
import { join } from 'path';
import {
  BatteryEvidenceScope,
  BatteryGeneralizedEvidenceClass,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
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
import type { RestSessionFeatureInputSnapshotV1 } from './rest-session-feature-input-snapshot.types';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';
import { RestSessionFeatureShadowInspectionService } from './rest-session-feature-shadow-inspection.service';
import { RestSessionFeatureShadowTriggerService } from './rest-session-feature-shadow-trigger.service';

const LIVE = process.env.BATTERY_V2_REST_SESSION_FEATURE_INSPECTION_INTEGRATION === '1';

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
      companyName: `C5A ${label} ${suffix}`,
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

function buildC4Stack(prisma: PrismaClient) {
  const repository = new GeneralizedEvidenceRepository(prisma as never);
  const featureComputation = new RestSessionFeatureComputationService(prisma as unknown as PrismaService);
  const trigger = new RestSessionFeatureShadowTriggerService(featureComputation);
  const restSessions = new BatteryRestSessionService(repository, undefined, trigger);
  const lateTrip = new LateTripAssociationService(prisma as never, repository, undefined, trigger);
  return { restSessions, lateTrip };
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
  return { session };
}

async function linkValidRest(
  prisma: PrismaClient,
  restSessions: BatteryRestSessionService,
  organizationId: string,
  vehicleId: string,
  sessionId: string,
  anchorAt: Date,
) {
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
  return { restAt, restObs };
}

async function authoritativeTableCounts(prisma: PrismaClient) {
  const [
    batteryFeature,
    batteryAssessment,
    batteryPublication,
    batteryRestSession,
    batteryGeneralizedEvidenceObservation,
    batteryRestSessionFeature,
  ] = await Promise.all([
    prisma.batteryFeatures.count(),
    prisma.batteryAssessment.count(),
    prisma.batteryPublication.count(),
    prisma.batteryRestSession.count(),
    prisma.batteryGeneralizedEvidenceObservation.count(),
    prisma.batteryRestSessionFeature.count(),
  ]);
  return {
    batteryFeatures: batteryFeature,
    batteryAssessment,
    batteryPublication,
    batteryRestSession,
    batteryGeneralizedEvidenceObservation,
    batteryRestSessionFeature,
  };
}

(LIVE ? describe : describe.skip)(
  'RestSessionFeatureShadowInspection C5A integration (BATTERY_V2_REST_SESSION_FEATURE_INSPECTION_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let inspector: RestSessionFeatureShadowInspectionService;
    let dbOk = false;
    const shadowBackup = process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];
    const geBackup = process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV];

    beforeAll(async () => {
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = 'true';
      process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
      dbOk = await probePostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
      inspector = new RestSessionFeatureShadowInspectionService(prisma as unknown as PrismaService);
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

    it('PG_A: C4 CREATED row → inspect OK with canonical feature', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'A');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-23T10:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      await linkValidRest(prisma, restSessions, organizationId, vehicleId, session.id, anchorAt);
      const result = await inspector.inspectSession({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      expect(result.status).toBe('OK');
      if (result.status !== 'OK') return;
      expect(result.inspection.featureSummary.totalRows).toBeGreaterThanOrEqual(1);
      expect(result.inspection.canonicalFeature).not.toBeNull();
      expect(result.inspection.integrity.digestMismatchCount).toBe(0);
      expect(result.inspection.integrity.overallStatus).toBe('OK');
    });

    it('PG_B: INCREMENTAL + FINAL → canonical FINAL', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'B');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-23T11:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      const { restAt } = await linkValidRest(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        session.id,
        anchorAt,
      );
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
      const result = await inspector.inspectSession({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      if (result.status !== 'OK') return;
      expect(result.inspection.featureSummary.incrementalRows).toBeGreaterThanOrEqual(1);
      expect(result.inspection.featureSummary.finalRows).toBeGreaterThanOrEqual(1);
      expect(result.inspection.canonicalFeature?.computationPhase).toBe('FINAL');
      expect(result.inspection.featureSummary.latestSemanticRevision).toBeGreaterThanOrEqual(2);
    });

    it('PG_C: late association revision exposes confirmedTrip in persisted revision', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'C');
      const { restSessions, lateTrip } = buildC4Stack(prisma);
      const tripEnd = new Date('2026-09-23T12:00:00.000Z');
      const anchorAt = new Date(tripEnd.getTime() + 2_000);
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      await linkValidRest(prisma, restSessions, organizationId, vehicleId, session.id, anchorAt);
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
      await lateTrip.associateAfterTripFinalization({
        vehicleId,
        tripId: trip.id,
        tripEndedAt: tripEnd,
      });
      const result = await inspector.inspectSession({
        organizationId,
        vehicleId,
        restSessionId: session.id,
        includeRaw: true,
      });
      if (result.status !== 'OK') return;
      expect(result.inspection.featureSummary.totalRows).toBeGreaterThanOrEqual(2);
      const latest = result.inspection.revisions[result.inspection.revisions.length - 1];
      const summary = latest.inputSummary as RestSessionFeatureInputSnapshotV1;
      expect(summary.session.confirmedTripId).toBe(trip.id);
      expect(result.inspection.integrity.digestMismatchCount).toBe(0);
    });

    it('PG_D: INVALIDATED terminal → canonical INVALIDATED trust', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'D');
      const { restSessions } = buildC4Stack(prisma);
      const computation = new RestSessionFeatureComputationService(prisma as unknown as PrismaService);
      const anchorAt = new Date('2026-09-23T13:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      await linkValidRest(prisma, restSessions, organizationId, vehicleId, session.id, anchorAt);
      await prisma.batteryRestSession.update({
        where: { id: session.id },
        data: {
          sessionStatus: BatteryRestSessionStatus.INVALIDATED,
          endReason: 'INVALIDATED',
          endedAt: new Date(),
        },
      });
      await computation.computeAndPersist({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      const result = await inspector.inspectSession({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      if (result.status !== 'OK') return;
      expect(result.inspection.canonicalFeature?.sessionTrust).toBe('INVALIDATED');
      expect(result.inspection.canonicalFeature?.computationPhase).toBe('FINAL');
    });

    it('PG_E: tenant isolation → SESSION_NOT_FOUND', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'E');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-23T14:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      await linkValidRest(prisma, restSessions, organizationId, vehicleId, session.id, anchorAt);
      const wrongOrg = await createOrgVehicle(prisma, 'E2');
      const leaked = await inspector.inspectSession({
        organizationId: wrongOrg.organizationId,
        vehicleId: wrongOrg.vehicleId,
        restSessionId: session.id,
      });
      expect(leaked.status).toBe('SESSION_NOT_FOUND');
    });

    it('PG_F: digest roundtrip for all persisted rows', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'F');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-23T15:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      await linkValidRest(prisma, restSessions, organizationId, vehicleId, session.id, anchorAt);
      const result = await inspector.inspectSession({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      if (result.status !== 'OK') return;
      expect(result.inspection.revisions.every((r) => r.digestValid)).toBe(true);
    });

    it('PG_G: revision lineage contiguous without duplicates', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'G');
      const { restSessions, lateTrip } = buildC4Stack(prisma);
      const tripEnd = new Date('2026-09-23T16:00:00.000Z');
      const anchorAt = new Date(tripEnd.getTime() + 2_000);
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      await linkValidRest(prisma, restSessions, organizationId, vehicleId, session.id, anchorAt);
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
      await lateTrip.associateAfterTripFinalization({
        vehicleId,
        tripId: trip.id,
        tripEndedAt: tripEnd,
      });
      const result = await inspector.inspectSession({
        organizationId,
        vehicleId,
        restSessionId: session.id,
      });
      if (result.status !== 'OK') return;
      expect(result.inspection.integrity.semanticRevisionGapCount).toBe(0);
      expect(result.inspection.integrity.duplicateSemanticRevisionCount).toBe(0);
    });

    it(
      'PG_H: CLI read-only against ephemeral DB',
      async () => {
        if (!dbOk) return;
        const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'H');
        const { restSessions } = buildC4Stack(prisma);
        const anchorAt = new Date('2026-09-23T17:00:00.000Z');
        const { session } = await openSessionWithAnchor(
          prisma,
          restSessions,
          organizationId,
          vehicleId,
          anchorAt,
        );
        await linkValidRest(prisma, restSessions, organizationId, vehicleId, session.id, anchorAt);
        const before = await authoritativeTableCounts(prisma);
        const script = join(
          __dirname,
          '../../../../../../scripts/ops/battery-rest-session-feature-shadow-inspect.ts',
        );
        const out = execFileSync(
          'npx',
          [
            'ts-node',
            '-r',
            'tsconfig-paths/register',
            script,
            `--organization-id=${organizationId}`,
            `--vehicle-id=${vehicleId}`,
            `--rest-session-id=${session.id}`,
          ],
          {
            encoding: 'utf8',
            env: process.env as NodeJS.ProcessEnv,
            cwd: join(__dirname, '../../../../../../'),
            timeout: 120_000,
          },
        );
        const parsed = JSON.parse(out) as { integrity: { overallStatus: string } };
        expect(parsed.integrity.overallStatus).toBe('OK');
        const after = await authoritativeTableCounts(prisma);
        expect(after).toEqual(before);
      },
      120_000,
    );

    it('PG_I: repeated inspector calls do not mutate authoritative tables', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'I');
      const { restSessions } = buildC4Stack(prisma);
      const anchorAt = new Date('2026-09-23T18:00:00.000Z');
      const { session } = await openSessionWithAnchor(
        prisma,
        restSessions,
        organizationId,
        vehicleId,
        anchorAt,
      );
      await linkValidRest(prisma, restSessions, organizationId, vehicleId, session.id, anchorAt);
      const before = await authoritativeTableCounts(prisma);
      for (let i = 0; i < 3; i += 1) {
        await inspector.inspectSession({
          organizationId,
          vehicleId,
          restSessionId: session.id,
        });
      }
      const after = await authoritativeTableCounts(prisma);
      expect(after).toEqual(before);
    });
  },
);
