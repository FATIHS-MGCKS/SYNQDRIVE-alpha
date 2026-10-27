import { ConfigService } from '@nestjs/config';
import { TireEventType } from '@prisma/client';
import { TireHealthService } from './tire-health.service';
import { TireWearModelService } from './tire-wear-model.service';

const VEHICLE_ID = 'veh-cutover';
const SETUP_ID = 'setup-cutover';

function wearAnalysisFixture() {
  return {
    frontLeftMm: 6.8,
    frontRightMm: 6.7,
    rearLeftMm: 6.6,
    rearRightMm: 6.5,
    referenceNewTreadFront: 8.0,
    referenceNewTreadRear: 8.0,
    operationalReplacementMm: 3.0,
    estimatedRemainingKm: 12000,
    effectiveWearRateKmPerMm: { front: 500, rear: 520 },
    factors: {
      temperatureFactor: 1.0,
      usageFactor: 1.0,
      behaviorFactor: 1.0,
      regenBrakingFactorFront: 1.0,
      regenBrakingFactorRear: 1.0,
      tireArchetype: 'default',
      tireSpecMatched: false,
      pressureFactorFront: 1.0,
      pressureFactorRear: 1.0,
    },
    explainability: {
      currentTreadSource: 'fallback_estimate',
      referenceNewTreadSource: 'manual_confirmed',
      replacementThresholdSource: 'season_fallback',
      topWearDrivers: [],
    },
  };
}

function buildHarness(cutover: { customerReadEnabled: boolean; customerReadAuthoritative: boolean }) {
  const snapshotCreate = jest.fn().mockResolvedValue({ id: 'snap-new' });
  const eventCreate = jest.fn().mockResolvedValue({ id: 'ev-1' });
  const setupUpdate = jest.fn().mockResolvedValue({});

  const setup = {
    id: SETUP_ID,
    vehicleId: VEHICLE_ID,
    name: 'Summer',
    brandModelFront: 'Test',
    tireSeason: 'SUMMER',
    totalKmOnSet: 1200,
    cityKm: 400,
    highwayKm: 600,
    ruralKm: 200,
    harshAccelEvents: 0,
    harshBrakeEvents: 0,
    harshCornerEvents: 0,
    installedOdometerKm: 10000,
    installedAt: new Date('2026-01-01'),
    tireCondition: 'NEW_INSTALLED',
    isStaggered: false,
    frontDimension: '225/45R17',
    rearDimension: '225/45R17',
    brandModelRear: 'Test',
    aiTireSpec: null,
    initialTreadDepthMm: 8.0,
    initialTreadFrontMm: 8.0,
    initialTreadRearMm: 8.0,
    frontTireWidthMm: 205,
    rearTireWidthMm: 205,
    kFactorCalibrationCount: 0,
    kFactorFront: 1,
    kFactorRear: 1,
    regenBrakingFactorFront: null,
    regenBrakingFactorRear: null,
    expectedLifeKm: 40000,
    expectedLifeKmFront: null,
    expectedLifeKmRear: null,
    dotCodeFront: null,
    dotCodeRear: null,
    referenceNewTreadMm: 8,
    operationalReplacementMm: 3,
    initialTreadEvidenceSource: null,
    baselineStatus: null,
    baselineConfidence: null,
    odometerAnchorStatus: 'VALIDATED',
    overallHealthPercent: 72,
    overallRemainingKm: 12000,
    healthStatus: 'GOOD',
    confidenceScore: 65,
    confidenceLabel: 'Medium',
    tireSpecConfidence: 30,
    dataCompletenessConfidence: 40,
    modelConfidence: 35,
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    measurements: [],
  };

  const prisma = {
    vehicleTireSetup: {
      findFirst: jest.fn().mockResolvedValue(setup),
      update: setupUpdate,
      count: jest.fn().mockResolvedValue(1),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        fuelType: 'ELECTRIC',
        driveType: 'RWD',
        curbWeightKg: 2100,
        frontWeightDistributionPct: 48,
      }),
    },
    vehicleLatestState: {
      findUnique: jest.fn().mockResolvedValue({ odometerKm: 15000 }),
    },
    tire: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    tireHealthSnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: snapshotCreate,
    },
    vehicleTireTreadMeasurement: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tireWearDataPoint: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tireEvent: { create: eventCreate },
    tirePositionHistory: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const config = {
    get: (key: string) =>
      key === 'tireWearV3Cutover' ? cutover : undefined,
  } as ConfigService;

  const service = new TireHealthService(
    prisma as never,
    { computeWearAnalysis: jest.fn().mockResolvedValue(wearAnalysisFixture()) } as unknown as TireWearModelService,
    { getVehicleImpactForTire: jest.fn().mockResolvedValue(null) } as never,
    { linkPendingValidationDataPoints: jest.fn().mockResolvedValue([]) } as never,
    { syncAlerts: jest.fn().mockResolvedValue({ openAlerts: [], newlyOpened: [], resolved: [], notificationsToEmit: [] }) } as never,
    undefined,
    undefined,
    config,
  );

  return { service, snapshotCreate, eventCreate, setupUpdate };
}

describe('TireHealthService.recalculate — V3 authoritative V2 snapshot guard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-16T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates V2 snapshots when cutover flags are OFF', async () => {
    const { service, snapshotCreate, eventCreate } = buildHarness({
      customerReadEnabled: false,
      customerReadAuthoritative: false,
    });
    await service.recalculate(VEHICLE_ID);
    expect(snapshotCreate).toHaveBeenCalledTimes(1);
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: TireEventType.RECALCULATION }) }),
    );
  });

  it('suppresses new V2 snapshots when V3 authoritative (both flags true)', async () => {
    const { service, snapshotCreate, eventCreate, setupUpdate } = buildHarness({
      customerReadEnabled: true,
      customerReadAuthoritative: true,
    });
    const result = await service.recalculate(VEHICLE_ID);
    expect(snapshotCreate).not.toHaveBeenCalled();
    expect(eventCreate).toHaveBeenCalled();
    expect(setupUpdate).toHaveBeenCalled();
    expect(result?.snapshotId).toBeNull();
  });

  it('resumes V2 snapshot writes when authoritative flag cleared (rollback)', async () => {
    const off = buildHarness({ customerReadEnabled: false, customerReadAuthoritative: false });
    await off.service.recalculate(VEHICLE_ID);
    expect(off.snapshotCreate).toHaveBeenCalledTimes(1);

    const on = buildHarness({ customerReadEnabled: true, customerReadAuthoritative: true });
    await on.service.recalculate(VEHICLE_ID);
    expect(on.snapshotCreate).not.toHaveBeenCalled();

    const rolledBack = buildHarness({ customerReadEnabled: false, customerReadAuthoritative: false });
    await rolledBack.service.recalculate(VEHICLE_ID);
    expect(rolledBack.snapshotCreate).toHaveBeenCalledTimes(1);
  });

  it('does not suppress snapshots when only authoritative is set without enabled', async () => {
    const { service, snapshotCreate } = buildHarness({
      customerReadEnabled: false,
      customerReadAuthoritative: true,
    });
    await service.recalculate(VEHICLE_ID);
    expect(snapshotCreate).toHaveBeenCalledTimes(1);
  });
});
