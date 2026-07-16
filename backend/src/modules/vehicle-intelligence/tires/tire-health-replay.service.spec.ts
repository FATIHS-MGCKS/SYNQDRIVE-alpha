import { TireHealthReplayService } from './tire-health-replay.service';
import { TireWearModelService } from './tire-wear-model.service';
import {
  buildSnapshotPredictionPayload,
  computeTireWearModelConfigHash,
  TIRE_WEAR_MODEL_VERSION,
} from './tire-wear-model-version';
import { TireSetupStatus } from '@prisma/client';

const VEHICLE_ID = 'veh-1';
const SETUP_ID = 'setup-1';
const AS_OF = new Date('2026-07-16T12:00:00Z');

function setupFixture() {
  return {
    id: SETUP_ID,
    vehicleId: VEHICLE_ID,
    removedAt: null,
    status: TireSetupStatus.ACTIVE,
    installedAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-07-01'),
    tireSeason: 'SUMMER',
    tireCondition: 'NEW_INSTALLED',
    isStaggered: false,
    frontDimension: '225/45R17',
    rearDimension: '225/45R17',
    brandModelFront: 'Test',
    brandModelRear: 'Test',
    initialTreadDepthMm: 8,
    initialTreadFrontMm: 8,
    initialTreadRearMm: 8,
    initialTreadEvidenceSource: null,
    baselineStatus: null,
    baselineConfidence: null,
    referenceNewTreadMm: 8,
    operationalReplacementMm: 3,
    expectedLifeKm: 40000,
    expectedLifeKmFront: null,
    expectedLifeKmRear: null,
    frontTireWidthMm: 225,
    rearTireWidthMm: 225,
    dotCodeFront: null,
    dotCodeRear: null,
    installedOdometerKm: 10000,
    odometerAnchorStatus: 'VALIDATED',
    kFactorFront: 1,
    kFactorRear: 1,
    kFactorCalibrationCount: 0,
    regenBrakingFactorFront: null,
    regenBrakingFactorRear: null,
    aiTireSpec: null,
    totalKmOnSet: 1200,
    cityKm: 400,
    highwayKm: 600,
    ruralKm: 200,
    harshAccelEvents: 0,
    harshBrakeEvents: 0,
    harshCornerEvents: 0,
  };
}

describe('TireHealthReplayService', () => {
  const prisma = {
    vehicleTireSetup: { findFirst: jest.fn() },
    tireHealthSnapshot: { findFirst: jest.fn() },
    vehicle: { findUnique: jest.fn() },
    vehicleLatestState: { findUnique: jest.fn() },
    tire: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTireTreadMeasurement: { findMany: jest.fn().mockResolvedValue([]) },
    tireWearDataPoint: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const wearModel = {
    computeWearAnalysis: jest.fn(),
  };

  const service = new TireHealthReplayService(
    prisma as never,
    wearModel as unknown as TireWearModelService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vehicleTireSetup.findFirst.mockResolvedValue(setupFixture());
  });

  it('reproduces prediction from stored snapshot at as-of', async () => {
    const generatedAt = new Date('2026-07-10T10:00:00Z');
    const payload = buildSnapshotPredictionPayload({
      modelVersion: TIRE_WEAR_MODEL_VERSION,
      modelConfigHash: computeTireWearModelConfigHash(),
      predictionGeneratedAt: generatedAt,
      frontLeftMm: 6.8,
      frontRightMm: 6.7,
      rearLeftMm: 6.6,
      rearRightMm: 6.5,
    });

    prisma.tireHealthSnapshot.findFirst.mockResolvedValue({
      id: 'snap-1',
      predictionGeneratedAt: generatedAt,
      snapshotDate: generatedAt,
      modelVersion: TIRE_WEAR_MODEL_VERSION,
      modelConfigHash: computeTireWearModelConfigHash(),
      inputFingerprint: 'fp-1',
      evidenceSummary: payload,
    });

    const result = await service.replay({
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      asOf: AS_OF,
    });

    expect(result.status).toBe('REPRODUCED_FROM_SNAPSHOT');
    expect(result.snapshotId).toBe('snap-1');
    expect(result.modelVersion).toBe(TIRE_WEAR_MODEL_VERSION);
    expect(result.predictedTreadByAxle?.front).toBeCloseTo(6.8, 1);
    expect(wearModel.computeWearAnalysis).not.toHaveBeenCalled();
  });

  it('returns NOT_REPRODUCIBLE for unknown historical config without substituting current formula', async () => {
    prisma.tireHealthSnapshot.findFirst.mockResolvedValue({
      id: 'snap-old',
      predictionGeneratedAt: new Date('2025-01-01'),
      snapshotDate: new Date('2025-01-01'),
      modelVersion: 'tire-wear-v1',
      modelConfigHash: 'legacy-unknown-hash',
      inputFingerprint: 'fp-old',
      evidenceSummary: {
        predictedTreadByAxle: { front: 7.5, rear: 7.4 },
        predictedTreadByWheel: { FL: 7.5, FR: 7.5, RL: 7.4, RR: 7.4 },
      },
    });

    const result = await service.replay({
      vehicleId: VEHICLE_ID,
      asOf: AS_OF,
    });

    expect(result.status).toBe('NOT_REPRODUCIBLE');
    expect(result.reason).toBe('stored_config_not_executable');
    expect(wearModel.computeWearAnalysis).not.toHaveBeenCalled();
  });

  it('recomputes only when no snapshot exists and current config is registered', async () => {
    prisma.tireHealthSnapshot.findFirst.mockResolvedValue(null);
    wearModel.computeWearAnalysis.mockResolvedValue({
      frontLeftMm: 6.8,
      frontRightMm: 6.7,
      rearLeftMm: 6.6,
      rearRightMm: 6.5,
    });

    const result = await service.replay({
      vehicleId: VEHICLE_ID,
      asOf: AS_OF,
    });

    expect(result.status).toBe('RECOMPUTED');
    expect(wearModel.computeWearAnalysis).toHaveBeenCalledWith(VEHICLE_ID, {
      asOf: AS_OF,
      tireSetupId: SETUP_ID,
    });
    expect(result.modelVersion).toBe(TIRE_WEAR_MODEL_VERSION);
  });
});
