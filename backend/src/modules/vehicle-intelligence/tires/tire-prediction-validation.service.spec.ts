import { TirePredictionValidationService } from './tire-prediction-validation.service';
import { buildSnapshotPredictionPayload, computeTireWearModelConfigHash, TIRE_WEAR_MODEL_VERSION } from './tire-wear-model-version';
import { TireEvidenceSource } from '@prisma/client';

const SETUP_ID = 'setup-1';
const VEHICLE_ID = 'veh-1';
const ORG_ID = 'org-1';

function preMeasurementSnapshot(overrides: Record<string, unknown> = {}) {
  const generatedAt = new Date('2026-06-15T10:00:00Z');
  const payload = buildSnapshotPredictionPayload({
    modelVersion: TIRE_WEAR_MODEL_VERSION,
    modelConfigHash: computeTireWearModelConfigHash(),
    predictionGeneratedAt: generatedAt,
    frontLeftMm: 7.0,
    frontRightMm: 6.9,
    rearLeftMm: 6.8,
    rearRightMm: 6.7,
  });

  return {
    id: 'snap-before',
    predictionGeneratedAt: generatedAt,
    snapshotDate: generatedAt,
    modelVersion: TIRE_WEAR_MODEL_VERSION,
    modelConfigHash: computeTireWearModelConfigHash(),
    evidenceSummary: payload,
    ...overrides,
  };
}

describe('TirePredictionValidationService', () => {
  const wearDataPointCreate = jest.fn().mockResolvedValue({ id: 'wdp-1' });
  const wearDataPointFindFirst = jest.fn().mockResolvedValue(null);

  const prisma = {
    tireHealthSnapshot: {
      findFirst: jest.fn(),
    },
    vehicleTireTreadMeasurement: {
      findMany: jest.fn(),
    },
    tireWearDataPoint: {
      findFirst: wearDataPointFindFirst,
      create: wearDataPointCreate,
    },
  };

  const service = new TirePredictionValidationService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('links measurement to the pre-measurement snapshot prediction', async () => {
    prisma.tireHealthSnapshot.findFirst.mockResolvedValue(preMeasurementSnapshot());
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([
      {
        id: 'meas-1',
        source: 'manual',
        measuredAt: new Date('2026-07-01T10:00:00Z'),
        evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
        frontLeftMm: 7.2,
        frontRightMm: 7.1,
        rearLeftMm: 7.0,
        rearRightMm: 6.9,
      },
    ]);

    const results = await service.linkPendingValidationDataPoints({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      tireSeason: 'SUMMER',
      installedOdometerKm: 10000,
      currentOdometerKm: 15000,
      referenceNewTreadFront: 8,
      referenceNewTreadRear: 8,
      frontTireWidthMm: 225,
      rearTireWidthMm: 225,
      climateFactor: 1,
      usageFactor: 1,
      behaviorFactor: 1,
      regenFactor: 1,
    });

    expect(results).toHaveLength(2);
    expect(wearDataPointCreate).toHaveBeenCalledTimes(2);
    expect(wearDataPointCreate.mock.calls[0][0].data.predictionSnapshotId).toBe('snap-before');
    expect(wearDataPointCreate.mock.calls[0][0].data.predictedTreadMm).toBeCloseTo(7.0, 1);
    expect(wearDataPointCreate.mock.calls[0][0].data.actualTreadMm).toBeCloseTo(7.15, 2);
    expect(wearDataPointCreate.mock.calls[0][0].data.predictedTreadMm).not.toBeCloseTo(
      wearDataPointCreate.mock.calls[0][0].data.actualTreadMm,
      1,
    );
  });

  it('skips when no pre-measurement snapshot exists (no future leakage)', async () => {
    prisma.tireHealthSnapshot.findFirst.mockResolvedValue(null);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([
      {
        id: 'meas-1',
        source: 'manual',
        measuredAt: new Date('2026-07-01T10:00:00Z'),
        evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
        frontLeftMm: 7.2,
        frontRightMm: 7.1,
        rearLeftMm: 7.0,
        rearRightMm: 6.9,
      },
    ]);

    const results = await service.linkPendingValidationDataPoints({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      tireSeason: 'SUMMER',
      installedOdometerKm: 10000,
      currentOdometerKm: 15000,
      referenceNewTreadFront: 8,
      referenceNewTreadRear: 8,
      frontTireWidthMm: 225,
      rearTireWidthMm: 225,
      climateFactor: 1,
      usageFactor: 1,
      behaviorFactor: 1,
      regenFactor: 1,
    });

    expect(wearDataPointCreate).not.toHaveBeenCalled();
    expect(results[0]?.skipReason).toBe('no_pre_measurement_snapshot');
  });

  it('does not duplicate validation rows for the same measurement and axle', async () => {
    prisma.tireHealthSnapshot.findFirst.mockResolvedValue(preMeasurementSnapshot());
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([
      {
        id: 'meas-1',
        source: 'manual',
        measuredAt: new Date('2026-07-01T10:00:00Z'),
        evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
        frontLeftMm: 7.2,
        frontRightMm: 7.1,
        rearLeftMm: 7.0,
        rearRightMm: 6.9,
      },
    ]);
    wearDataPointFindFirst.mockResolvedValue({ id: 'existing' });

    const results = await service.linkPendingValidationDataPoints({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      tireSeason: 'SUMMER',
      installedOdometerKm: 10000,
      currentOdometerKm: 15000,
      referenceNewTreadFront: 8,
      referenceNewTreadRear: 8,
      frontTireWidthMm: 225,
      rearTireWidthMm: 225,
      climateFactor: 1,
      usageFactor: 1,
      behaviorFactor: 1,
      regenFactor: 1,
    });

    expect(results).toHaveLength(0);
    expect(wearDataPointCreate).not.toHaveBeenCalled();
  });

  it('queries snapshots strictly before measurement time', async () => {
    const measuredAt = new Date('2026-07-01T10:00:00Z');
    prisma.tireHealthSnapshot.findFirst.mockResolvedValue(null);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([]);

    await service.findPreMeasurementSnapshot(SETUP_ID, measuredAt);

    expect(prisma.tireHealthSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tireSetId: SETUP_ID,
          OR: expect.arrayContaining([
            { predictionGeneratedAt: { lt: measuredAt } },
          ]),
        }),
      }),
    );
  });
});
