import { randomUUID } from 'crypto';
import {
  BatteryGeneralizedEvidenceClass,
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BatteryRestSessionStatus,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION } from '../generalized-evidence.constants';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../../shutdown-evidence/shutdown-evidence.constants';
import { probePostgresDatabase } from '../../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { RestSessionChargeContextReader } from './rest-session-charge-context.reader';

const LIVE = process.env.BATTERY_V2_CHARGE_OPPORTUNITY_INTEGRATION === '1';

async function tableCounts(prisma: PrismaClient) {
  const [
    restSessions,
    ge,
    features,
    batteryFeatures,
    assessments,
    publications,
  ] = await Promise.all([
    prisma.batteryRestSession.count(),
    prisma.batteryGeneralizedEvidenceObservation.count(),
    prisma.batteryRestSessionFeature.count(),
    prisma.batteryFeatures.count(),
    prisma.batteryAssessment.count(),
    prisma.batteryPublication.count(),
  ]);
  return {
    restSessions,
    ge,
    features,
    batteryFeatures,
    assessments,
    publications,
  };
}

async function createOrgVehicle(prisma: PrismaClient, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `C2 ${label} ${suffix}`,
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

async function createGeRow(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    sourceMeasurementId: string;
    observedAt: Date;
    tripId?: string | null;
    evidenceClass?: BatteryGeneralizedEvidenceClass;
    voltage?: number;
    engineRunning?: boolean;
    stateAlignmentClass?: BatteryShutdownStateAlignmentClass;
    stateTimestampSource?: string;
  },
) {
  return prisma.batteryGeneralizedEvidenceObservation.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sourceMeasurementId: input.sourceMeasurementId,
      ingestedAt: new Date(input.observedAt.getTime() + 2000),
      evidenceClass: input.evidenceClass ?? BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
      evidenceConfidence: 'MEDIUM',
      classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
      voltage: input.voltage ?? 14.2,
      voltageObservedAt: input.observedAt,
      providerObservationAt: input.observedAt,
      providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      engineRunning: input.engineRunning ?? true,
      stateObservedAt: input.observedAt,
      stateTimestampSource:
        input.stateTimestampSource ?? SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
      stateCompleteness: BatteryShutdownStateCompleteness.COMPLETE,
      stateAlignmentClass:
        input.stateAlignmentClass ?? BatteryShutdownStateAlignmentClass.ALIGNED,
      tripId: input.tripId ?? null,
      atomicClaim: false,
      idempotencyKey: `gen-ev:${randomUUID()}`,
    },
  });
}

(LIVE ? describe : describe.skip)(
  'RestSessionChargeContextReader integration (BATTERY_V2_CHARGE_OPPORTUNITY_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let reader: RestSessionChargeContextReader;
    let dbOk = false;

    beforeAll(async () => {
      dbOk = await probePostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
      reader = new RestSessionChargeContextReader(prisma as unknown as PrismaService);
    }, 60_000);

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    it('PG_A: tenant / vehicle isolation', async () => {
      if (!dbOk) return;
      const a = await createOrgVehicle(prisma, 'ISO-A');
      const b = await createOrgVehicle(prisma, 'ISO-B');
      const tripEnd = new Date('2026-09-22T10:00:00.000Z');
      const anchor = new Date(tripEnd.getTime() + 3000);
      const trip = await prisma.vehicleTrip.create({
        data: {
          vehicleId: a.vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: new Date(tripEnd.getTime() - 600_000),
          endTime: tripEnd,
        },
      });
      const session = await prisma.batteryRestSession.create({
        data: {
          id: randomUUID(),
          organizationId: a.organizationId,
          vehicleId: a.vehicleId,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt: anchor,
          confirmedTripId: trip.id,
          sessionStatus: BatteryRestSessionStatus.CONFIRMED,
          openedAt: anchor,
          idempotencyKey: `rs:${randomUUID()}`,
        },
      });
      const meas = await createMeasurement(prisma, b.organizationId, b.vehicleId, tripEnd);
      await createGeRow(prisma, {
        organizationId: b.organizationId,
        vehicleId: b.vehicleId,
        sourceMeasurementId: meas.id,
        observedAt: tripEnd,
      });

      const result = await reader.readChargeOpportunityRawFeatures({
        organizationId: a.organizationId,
        vehicleId: a.vehicleId,
        restSessionId: session.id,
      });
      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.features.qualifiedLvObservationCount).toBe(0);
      }
    });

    it('PG_B + PG_C + PG_D + PG_E + PG_F + PG_G: window, leakage, foreign trip, candidate, no link, zero writes', async () => {
      if (!dbOk) return;
      const { organizationId, vehicleId } = await createOrgVehicle(prisma, 'PG-B');

      const tripStart = new Date('2026-09-22T13:44:00.000Z');
      const tripEnd = new Date('2026-09-22T13:50:25.000Z');
      const anchor = new Date('2026-09-22T13:50:28.000Z');
      const trip = await prisma.vehicleTrip.create({
        data: {
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: tripStart,
          endTime: tripEnd,
          distanceKm: 2.0,
          outsideTemperatureStartC: 18,
        },
      });
      const foreignTrip = await prisma.vehicleTrip.create({
        data: {
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: tripStart,
          endTime: tripEnd,
        },
      });

      const confirmedSession = await prisma.batteryRestSession.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt: anchor,
          confirmedTripId: trip.id,
          sessionStatus: BatteryRestSessionStatus.CONFIRMED,
          openedAt: anchor,
          idempotencyKey: `rs:conf:${randomUUID()}`,
        },
      });

      const candidateSession = await prisma.batteryRestSession.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt: anchor,
          candidateTripId: trip.id,
          sessionStatus: BatteryRestSessionStatus.ENDED,
          openedAt: anchor,
          endedAt: new Date(anchor.getTime() + 60_000),
          endReason: 'VEHICLE_ACTIVITY',
          idempotencyKey: `rs:cand:${randomUUID()}`,
        },
      });

      const unlinkedSession = await prisma.batteryRestSession.create({
        data: {
          id: randomUUID(),
          organizationId,
          vehicleId,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt: anchor,
          sessionStatus: BatteryRestSessionStatus.ENDED,
          openedAt: anchor,
          endedAt: new Date(anchor.getTime() + 120_000),
          endReason: 'VEHICLE_ACTIVITY',
          idempotencyKey: `rs:none:${randomUUID()}`,
        },
      });

      const inWindow = new Date('2026-09-22T13:48:00.000Z');
      const afterAnchor = new Date('2026-09-22T13:51:00.000Z');
      const measIn = await createMeasurement(prisma, organizationId, vehicleId, inWindow);
      const measFuture = await createMeasurement(prisma, organizationId, vehicleId, afterAnchor);
      const measForeign = await createMeasurement(
        prisma,
        organizationId,
        vehicleId,
        new Date(inWindow.getTime() + 1000),
      );

      await createGeRow(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: measIn.id,
        observedAt: inWindow,
        tripId: trip.id,
      });
      await createGeRow(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: measFuture.id,
        observedAt: afterAnchor,
        tripId: trip.id,
      });
      await createGeRow(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: measForeign.id,
        observedAt: new Date(inWindow.getTime() + 1000),
        tripId: foreignTrip.id,
      });

      const beforeReader = await tableCounts(prisma);

      const confirmed = await reader.readChargeOpportunityRawFeatures({
        organizationId,
        vehicleId,
        restSessionId: confirmedSession.id,
      });
      expect(confirmed.status).toBe('OK');
      if (confirmed.status === 'OK') {
        expect(confirmed.features.windowSource).toBe('CONFIRMED_TRIP');
        expect(confirmed.features.qualifiedLvObservationCount).toBe(1);
        expect(confirmed.features.foreignTripObservationCount).toBe(1);
        expect(confirmed.features.chargeContextSourceObservationIds).toHaveLength(1);
      }

      const candidate = await reader.readChargeOpportunityRawFeatures({
        organizationId,
        vehicleId,
        restSessionId: candidateSession.id,
      });
      expect(candidate.status).toBe('OK');
      if (candidate.status === 'OK') {
        expect(candidate.features.windowSource).toBe('CANDIDATE_TRIP');
        expect(candidate.features.contextCompleteness).toContain('CANDIDATE_TRIP_CONTEXT');
      }

      const unlinked = await reader.readChargeOpportunityRawFeatures({
        organizationId,
        vehicleId,
        restSessionId: unlinkedSession.id,
      });
      expect(unlinked.status).toBe('OK');
      if (unlinked.status === 'OK') {
        expect(unlinked.features.windowSource).toBe('NONE');
        expect(unlinked.features.contextCompleteness).toContain('NO_RELIABLE_PRECEDING_TRIP');
        expect(unlinked.features.qualifiedLvObservationCount).toBe(0);
      }

      const afterReader = await tableCounts(prisma);
      expect(afterReader).toEqual(beforeReader);
    });
  },
);
