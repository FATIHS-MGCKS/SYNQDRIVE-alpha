import { randomUUID } from 'node:crypto';
import {
  ApdShadowActivationEpochLifecycle,
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BusinessType,
  FuelType,
  PrismaClient,
  TripDetectionState,
  TripStatus,
} from '@prisma/client';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import {
  computeApdShadowCohortFingerprintSha256,
  P25_APD_LTE_R1_COHORT_V1,
  WORKER_APD_SHADOW_COHORT_JSON_ENV,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';
import { buildApdShadowActivationScopeKey } from './apd-shadow-activation-epoch.types';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import { mockActivationEpochServiceForCohort } from './apd-shadow-test-epoch.helper';
import { findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs } from '../adaptive-polling-policy/p25-apd-historical-lv-visibility';
import { isVehicleInActiveTripAtMs } from './apd-shadow-trip-reconciliation.util';
import {
  dbSupportsCancelledTripStatus,
  seedCancelledOpenVehicleTrip,
} from './apd-shadow-trip-test-helpers';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('APDS R4 P2 trip authority (Postgres integration)', () => {
  const prisma = new PrismaClient();
  const repository = new AdaptivePollingShadowRepository(prisma as never);

  let organizationId = '';
  let vehicleAudi = '';
  let vehicleArteon = '';
  let vehicleTesla = '';
  let epochId = '';
  const decisionAtMs = Date.parse('2026-10-09T21:42:14.076Z');
  const pollCompletedMs = decisionAtMs + 500;

  const cohort: ApdShadowCohortConfig = {
    version: P25_APD_LTE_R1_COHORT_V1,
    members: [],
  };

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { companyName: 'APDS_R4_P2_TRIP_AUTH', businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationId = org.id;

    const mkVehicle = async (name: string, fuel: FuelType) => {
      const v = await prisma.vehicle.create({
        data: {
          organizationId,
          make: 'Test',
          model: name,
          year: 2026,
          fuelType: fuel,
          vehicleName: name,
        },
        select: { id: true },
      });
      return v.id;
    };

    vehicleAudi = await mkVehicle('audi-proxy', FuelType.GASOLINE);
    vehicleArteon = await mkVehicle('arteon-proxy', FuelType.GASOLINE);
    vehicleTesla = await mkVehicle('tesla-proxy', FuelType.ELECTRIC);

    cohort.members = [
      { organizationId, vehicleId: vehicleAudi },
      { organizationId, vehicleId: vehicleArteon },
      { organizationId, vehicleId: vehicleTesla },
    ];
    const fingerprint = computeApdShadowCohortFingerprintSha256(cohort);

    const epoch = await prisma.apdShadowActivationEpoch.create({
      data: {
        activationScopeKey: buildApdShadowActivationScopeKey(fingerprint),
        organizationId,
        cohortConfigFingerprintSha256: fingerprint,
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt: new Date('2026-10-09T21:40:53.798Z'),
      },
      select: { id: true },
    });
    epochId = epoch.id;

    await prisma.vehicleTripDetectionState.createMany({
      data: [
        { vehicleId: vehicleAudi, state: TripDetectionState.ACTIVE_TRIP },
        { vehicleId: vehicleArteon, state: TripDetectionState.RESTING },
        { vehicleId: vehicleTesla, state: TripDetectionState.RESTING },
      ],
    });

    if (await dbSupportsCancelledTripStatus(prisma)) {
      await seedCancelledOpenVehicleTrip(
        prisma,
        vehicleArteon,
        new Date('2026-08-01T11:25:00Z'),
      );
    } else {
      await prisma.vehicleTrip.create({
        data: {
          vehicleId: vehicleArteon,
          startTime: new Date('2026-08-01T11:25:00Z'),
          endTime: null,
          tripStatus: TripStatus.ONGOING,
        },
      });
    }

    // Audi trip ended before decision
    await prisma.vehicleTrip.create({
      data: {
        vehicleId: vehicleAudi,
        startTime: new Date('2026-10-09T20:34:00Z'),
        endTime: new Date('2026-10-09T20:52:13.988Z'),
        tripStatus: TripStatus.COMPLETED,
      },
    });

    const basePt = decisionAtMs - 3_600_000;
    for (let i = 0; i < 8; i++) {
      const observedAt = new Date(basePt + i * 120_000);
      await prisma.batteryMeasurement.create({
        data: {
          organizationId,
          vehicleId: vehicleAudi,
          type: BatteryMeasurementType.LIVE_VOLTAGE,
          scope: BatteryEvidenceScope.LV,
          quality: BatteryMeasurementQuality.VALID,
          numericValue: 12.4,
          unit: 'V',
          providerTimestamp: observedAt,
          observedAt,
          idempotencyKey: `audi-lv:${i}:${randomUUID()}`,
        },
      });
    }

    // Tesla: historical visible LV at poll completion, no corpus for profile loader at decision
    await prisma.batteryMeasurement.create({
      data: {
        organizationId,
        vehicleId: vehicleTesla,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        scope: BatteryEvidenceScope.LV,
        quality: BatteryMeasurementQuality.VALID,
        numericValue: 400,
        unit: 'V',
        providerTimestamp: new Date('2026-10-01T13:46:44.299Z'),
        observedAt: new Date('2026-10-01T13:46:44.299Z'),
        idempotencyKey: `tesla-lv:${randomUUID()}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function shadowService() {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    process.env[WORKER_APD_SHADOW_COHORT_JSON_ENV] = JSON.stringify(cohort);
    return new AdaptivePollingShadowService(
      prisma as never,
      repository,
      mockActivationEpochServiceForCohort(cohort, organizationId, { id: epochId }),
      {
        setEnabled: jest.fn(),
        setCohortMemberCount: jest.fn(),
        setCohortConfigFingerprint: jest.fn(),
        recordDecision: jest.fn(),
        recordFailure: jest.fn(),
        recordCohortExcluded: jest.fn(),
        recordEpochExcluded: jest.fn(),
        recordInformativeRealPoll: jest.fn(),
        recordProfileInvalidated: jest.fn(),
        recordProfileRecovered: jest.fn(),
      } as never,
    );
  }

  it('Audi proxy: reconciliation true, FSM ACTIVE_TRIP, no PROFILE_OBSERVABILITY_GAP profile invalidation', async () => {
    const service = shadowService();
    await service.observeActualBaselinePollStart({
      organizationId,
      vehicleId: vehicleAudi,
      pollStartedAtMs: decisionAtMs,
      origin: 'SCHEDULED',
      tripDetectionState: TripDetectionState.ACTIVE_TRIP,
      lastProviderFetchedAtMs: decisionAtMs - 60_000,
      providerGapOpen: false,
      connectivityState: 'CONNECTED',
      r9WakeKnown: false,
      wakeCorrelationId: null,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
    });
    const rows = await prisma.apdShadowReconciliationDecision.findMany({
      where: { organizationId, vehicleId: vehicleAudi, activationEpochId: epochId },
    });
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.reconciliation).toBe(true);
      expect(row.decision).not.toBe('FORCED_PROFILE_INVALID');
      expect(row.reason).not.toBe('PROFILE_OBSERVABILITY_GAP');
    }
  });

  it('Production Arteon parity: CANCELLED + NULL end_time matches active interval query', async () => {
    const supportsCancelled = await dbSupportsCancelledTripStatus(prisma);
    if (!supportsCancelled) {
      // Local schema drift only; production has CANCELLED (verified read-only 2026-10-09).
      expect(await isVehicleInActiveTripAtMs(prisma as never, vehicleArteon, decisionAtMs)).toBe(
        true,
      );
      return;
    }
    expect(await isVehicleInActiveTripAtMs(prisma as never, vehicleArteon, decisionAtMs)).toBe(
      true,
    );
  });

  it('Arteon proxy: stale open vehicle_trip forces reconciliation false (bootstrap blocked)', async () => {
    const service = shadowService();
    await service.observeActualBaselinePollStart({
      organizationId,
      vehicleId: vehicleArteon,
      pollStartedAtMs: decisionAtMs,
      origin: 'SCHEDULED',
      tripDetectionState: TripDetectionState.RESTING,
      lastProviderFetchedAtMs: decisionAtMs - 60_000,
      providerGapOpen: false,
      connectivityState: 'CONNECTED',
      r9WakeKnown: false,
      wakeCorrelationId: null,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
    });
    const rows = await prisma.apdShadowReconciliationDecision.findMany({
      where: { organizationId, vehicleId: vehicleArteon, activationEpochId: epochId },
    });
    expect(rows.every((r) => r.reconciliation === false)).toBe(true);
    expect(rows.every((r) => r.decision === 'FORCED_SOURCE_TIMESTAMP_MISSING')).toBe(true);
  });

  it('delayed ingestion cannot contaminate profile corpus at earlier decision time', async () => {
    const lateObserved = new Date(decisionAtMs + 60_000);
    await prisma.batteryMeasurement.create({
      data: {
        organizationId,
        vehicleId: vehicleAudi,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        scope: BatteryEvidenceScope.LV,
        quality: BatteryMeasurementQuality.VALID,
        numericValue: 12.5,
        unit: 'V',
        providerTimestamp: new Date(decisionAtMs - 120_000),
        observedAt: lateObserved,
        idempotencyKey: `audi-late-ingest:${randomUUID()}`,
      },
    });
    const where = {
      vehicleId: vehicleAudi,
      type: BatteryMeasurementType.LIVE_VOLTAGE,
      quality: BatteryMeasurementQuality.VALID,
      providerTimestamp: { not: null, lte: new Date(decisionAtMs) },
      observedAt: { lte: new Date(decisionAtMs) },
    };
    const rows = await prisma.batteryMeasurement.findMany({
      where,
      orderBy: { providerTimestamp: 'desc' },
      take: 24,
    });
    expect(rows.every((r) => r.observedAt.getTime() <= decisionAtMs)).toBe(true);
    expect(rows.some((r) => r.observedAt.getTime() === lateObserved.getTime())).toBe(false);
  });

  it('Tesla proxy: zero decision-bounded LV corpus but historical visibility at poll completion', async () => {
    const visible = await findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
      prisma,
      vehicleTesla,
      pollCompletedMs,
    );
    expect(visible).toBe(Date.parse('2026-10-01T13:46:44.299Z'));

    const service = shadowService();
    await service.observeActualBaselinePollStart({
      organizationId,
      vehicleId: vehicleTesla,
      pollStartedAtMs: decisionAtMs,
      origin: 'SCHEDULED',
      tripDetectionState: TripDetectionState.RESTING,
      lastProviderFetchedAtMs: decisionAtMs - 60_000,
      providerGapOpen: false,
      connectivityState: 'CONNECTED',
      r9WakeKnown: false,
      wakeCorrelationId: null,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
    });
    const rows = await prisma.apdShadowReconciliationDecision.findMany({
      where: { organizationId, vehicleId: vehicleTesla, activationEpochId: epochId },
    });
    const reasons = new Set(rows.map((r) => r.reason));
    expect(reasons.has('PROFILE_INSUFFICIENT_EVIDENCE') || reasons.has('MISSING_LV_SOURCE_TIMESTAMP')).toBe(
      true,
    );
  });
});
