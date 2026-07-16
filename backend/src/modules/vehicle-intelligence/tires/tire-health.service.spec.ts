import { TireHealthService } from './tire-health.service';
import { TireWearModelService } from './tire-wear-model.service';
import { TireEventType, TireEvidenceSource } from '@prisma/client';

const VEHICLE_ID = 'veh-1';
const SETUP_ID = 'setup-1';
const ORG_ID = 'org-1';

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

function buildMeasurement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'meas-1',
    tireSetupId: SETUP_ID,
    source: 'manual',
    measuredAt: new Date('2026-06-01T10:00:00Z'),
    frontLeftMm: 7.2,
    frontRightMm: 7.1,
    rearLeftMm: 7.0,
    rearRightMm: 6.9,
    odometerAtMeasurement: 14000,
    ...overrides,
  };
}

function createRecalculateHarness(measurement: Record<string, unknown> | null) {
  const wearDataPointCreateMany = jest.fn().mockResolvedValue({ count: 0 });
  const snapshotCreate = jest.fn().mockResolvedValue({ id: 'snap-1' });
  const setupUpdate = jest.fn().mockResolvedValue({});
  const eventCreate = jest.fn().mockResolvedValue({ id: 'ev-1' });

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
    installedOdometerKm: 10000,
    installedAt: new Date('2026-01-01'),
    tireCondition: 'NEW_INSTALLED',
    aiTireSpec: null,
    initialTreadDepthMm: 8.0,
    initialTreadFrontMm: 8.0,
    initialTreadRearMm: 8.0,
    frontTireWidthMm: 205,
    rearTireWidthMm: 205,
    kFactorCalibrationCount: 0,
    expectedLifeKm: 40000,
    measurements: measurement ? [measurement] : [],
  };

  const prisma = {
    vehicleTireSetup: {
      findFirst: jest.fn().mockResolvedValue(setup),
      update: setupUpdate,
      count: jest.fn().mockResolvedValue(1),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: ORG_ID }),
    },
    vehicleLatestState: {
      findUnique: jest.fn().mockImplementation(async () => ({
        odometerKm: 15000,
        tirePressureFl: null,
        tirePressureFr: null,
        tirePressureRl: null,
        tirePressureRr: null,
        sourceTimestamp: null,
        providerFetchedAt: null,
        lastSeenAt: null,
      })),
    },
    tireHealthSnapshot: { create: snapshotCreate },
    tireWearDataPoint: { createMany: wearDataPointCreateMany },
    tireEvent: { create: eventCreate },
    vehicleTireTreadMeasurement: {
      count: jest.fn().mockResolvedValue(measurement ? 1 : 0),
    },
  };

  const wearModel = {
    computeWearAnalysis: jest.fn().mockResolvedValue(wearAnalysisFixture()),
  };

  const drivingImpact = {
    getVehicleImpactForTire: jest.fn().mockResolvedValue(null),
  };

  const service = new TireHealthService(
    prisma as never,
    wearModel as unknown as TireWearModelService,
    drivingImpact as never,
  );

  return {
    service,
    prisma,
    wearDataPointCreateMany,
    snapshotCreate,
    setupUpdate,
    eventCreate,
    wearModel,
  };
}

describe('TireHealthService.recalculate — ground truth invariant', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-16T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not write wear data points when no measurement exists', async () => {
    const { service, wearDataPointCreateMany, snapshotCreate, eventCreate } =
      createRecalculateHarness(null);

    const result = await service.recalculate(VEHICLE_ID);

    expect(result).not.toBeNull();
    expect(snapshotCreate).toHaveBeenCalledTimes(1);
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: TireEventType.RECALCULATION }) }),
    );
    expect(wearDataPointCreateMany).not.toHaveBeenCalled();
  });

  it('writes only front axle when rear wheels are not measured', async () => {
    const { service, wearDataPointCreateMany } = createRecalculateHarness(
      buildMeasurement({ rearLeftMm: null, rearRightMm: null }),
    );

    await service.recalculate(VEHICLE_ID);

    expect(wearDataPointCreateMany).toHaveBeenCalledTimes(1);
    const payload = wearDataPointCreateMany.mock.calls[0][0].data as Array<{
      axle: string;
      actualTreadMm: number;
      predictedTreadMm: number;
    }>;
    expect(payload).toHaveLength(1);
    expect(payload[0].axle).toBe('front');
    expect(payload[0].actualTreadMm).toBeCloseTo(7.15, 2);
    expect(payload[0].actualTreadMm).not.toBeCloseTo(payload[0].predictedTreadMm, 1);
  });

  it('writes wear data points with measured actuals when four wheels are present', async () => {
    const { service, wearDataPointCreateMany } = createRecalculateHarness(buildMeasurement());

    await service.recalculate(VEHICLE_ID);

    expect(wearDataPointCreateMany).toHaveBeenCalledTimes(1);
    const payload = wearDataPointCreateMany.mock.calls[0][0].data as Array<{
      axle: string;
      predictedTreadMm: number;
      actualTreadMm: number;
    }>;

    expect(payload).toHaveLength(2);
    const front = payload.find((row) => row.axle === 'front')!;
    const rear = payload.find((row) => row.axle === 'rear')!;

    expect(front.actualTreadMm).toBeCloseTo(7.15, 2);
    expect(rear.actualTreadMm).toBeCloseTo(6.95, 2);
    expect(front.actualTreadMm).not.toBeCloseTo(front.predictedTreadMm, 1);
    expect(rear.actualTreadMm).not.toBeCloseTo(rear.predictedTreadMm, 1);
  });

  it('never stores predicted tread as actualTreadMm when measurement missing on axle', async () => {
    const analysis = wearAnalysisFixture();
    const { service, wearDataPointCreateMany, wearModel } = createRecalculateHarness(
      buildMeasurement({ frontLeftMm: 7.0, frontRightMm: null, rearLeftMm: 6.8, rearRightMm: 6.7 }),
    );
    wearModel.computeWearAnalysis.mockResolvedValue(analysis);

    await service.recalculate(VEHICLE_ID);

    if (wearDataPointCreateMany.mock.calls.length > 0) {
      const rows = wearDataPointCreateMany.mock.calls[0][0].data as Array<{
        axle: string;
        predictedTreadMm: number;
        actualTreadMm: number;
      }>;
      for (const row of rows) {
        const predicted =
          row.axle === 'front'
            ? (analysis.frontLeftMm + analysis.frontRightMm) / 2
            : (analysis.rearLeftMm + analysis.rearRightMm) / 2;
        expect(row.actualTreadMm).not.toBeCloseTo(predicted, 2);
      }
      expect(rows.every((r) => r.axle === 'rear')).toBe(true);
    } else {
      expect(wearDataPointCreateMany).not.toHaveBeenCalled();
    }
  });

  it('skips wear data points when latest measurement is after recalculation as-of', async () => {
    const { service, wearDataPointCreateMany } = createRecalculateHarness(
      buildMeasurement({ measuredAt: new Date('2026-07-17T00:00:00Z') }),
    );

    await service.recalculate(VEHICLE_ID);

    expect(wearDataPointCreateMany).not.toHaveBeenCalled();
  });

  it('rejects non-ground-truth measurement sources', async () => {
    const { service, wearDataPointCreateMany } = createRecalculateHarness(
      buildMeasurement({ source: 'ai_estimate' }),
    );

    await service.recalculate(VEHICLE_ID);

    expect(wearDataPointCreateMany).not.toHaveBeenCalled();
  });

  it('still creates snapshots on retry without inventing ground truth', async () => {
    const harness = createRecalculateHarness(null);

    await harness.service.recalculate(VEHICLE_ID);
    await harness.service.recalculate(VEHICLE_ID);

    expect(harness.snapshotCreate).toHaveBeenCalledTimes(2);
    expect(harness.wearDataPointCreateMany).not.toHaveBeenCalled();
  });

  it('persists snapshot provenance with explicit default-assumption flags', async () => {
    const harness = createRecalculateHarness(null);
    harness.wearModel.computeWearAnalysis.mockResolvedValue({
      ...wearAnalysisFixture(),
      explainability: {
        ...wearAnalysisFixture().explainability,
        currentTreadSource: 'fallback_estimate',
      },
    });

    await harness.service.recalculate(VEHICLE_ID);

    expect(harness.snapshotCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidenceSummary: expect.objectContaining({
            currentTreadSource: TireEvidenceSource.DEFAULT_ASSUMPTION,
            isDefaultAssumption: true,
            isMeasured: false,
            baselineSource: null,
          }),
        }),
      }),
    );
  });

  it('persists wear data point provenance with ground-truth flags for measured axles', async () => {
    const harness = createRecalculateHarness(
      buildMeasurement({ evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT }),
    );

    await harness.service.recalculate(VEHICLE_ID);

    const payload = harness.wearDataPointCreateMany.mock.calls[0][0].data as Array<{
      isGroundTruth: boolean;
      actualSource: TireEvidenceSource;
      actualMeasurementId: string;
      predictionSnapshotId: string;
    }>;

    expect(payload[0].isGroundTruth).toBe(true);
    expect(payload[0].actualSource).toBe(TireEvidenceSource.MANUAL_MEASUREMENT);
    expect(payload[0].actualMeasurementId).toBe('meas-1');
    expect(payload[0].predictionSnapshotId).toBe('snap-1');
  });
});

describe('TireWearModelService.filterRegressionDataPoints — synthetic leak guard', () => {
  const mockPrisma = {} as never;
  const mockDI = { getVehicleImpactForTire: jest.fn() } as never;
  const svc = new TireWearModelService(mockPrisma, mockDI);

  it('excludes rows where actual equals predicted (zero residual synthetic)', () => {
    const filter = (
      svc as unknown as {
        filterRegressionDataPoints: (
          raw: Array<{
            distanceKm: number;
            actualTreadMm: number;
            predictedTreadMm: number;
            initialTreadMm: number;
          }>,
        ) => Array<{ x: number; y: number }>;
      }
    ).filterRegressionDataPoints.bind(svc);

    const result = filter([
      {
        distanceKm: 1000,
        actualTreadMm: 6.5,
        predictedTreadMm: 6.5,
        initialTreadMm: 8.0,
      },
      {
        distanceKm: 2000,
        actualTreadMm: 6.2,
        predictedTreadMm: 6.5,
        initialTreadMm: 8.0,
      },
      {
        distanceKm: 3000,
        actualTreadMm: 5.9,
        predictedTreadMm: 6.4,
        initialTreadMm: 8.0,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.y)).toEqual([6.2, 5.9]);
  });
});
