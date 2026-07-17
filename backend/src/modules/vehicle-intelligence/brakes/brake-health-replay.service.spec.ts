import { BrakeHealthReplayService } from './brake-health-replay.service';
import {
  BRAKE_WEAR_MODEL_VERSION,
  buildSnapshotPredictionPayload,
  computeBrakeWearModelConfigHash,
} from './brake-wear-model-version';

const VEHICLE_ID = 'veh-1';
const AS_OF = new Date('2026-07-17T12:00:00Z');

describe('BrakeHealthReplayService', () => {
  const prisma = {
    brakeHealthSnapshot: { findFirst: jest.fn() },
  };
  const inputLoader = {
    loadAsOf: jest.fn(),
  };
  const brakeHealth = {
    previewRecalculationAtAsOf: jest.fn(),
  };

  const service = new BrakeHealthReplayService(
    prisma as never,
    inputLoader as never,
    brakeHealth as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reproduces prediction from stored snapshot at as-of', async () => {
    const generatedAt = new Date('2026-07-10T10:00:00Z');
    const payload = buildSnapshotPredictionPayload({
      modelVersion: BRAKE_WEAR_MODEL_VERSION,
      modelConfigHash: computeBrakeWearModelConfigHash(),
      predictionGeneratedAt: generatedAt,
      frontPadEstimateMm: 8.4,
      rearPadEstimateMm: 7.9,
      frontDiscEstimateMm: 27.1,
      rearDiscEstimateMm: 25.8,
    });

    prisma.brakeHealthSnapshot.findFirst.mockResolvedValue({
      id: 'snap-1',
      generatedAt,
      modelVersion: BRAKE_WEAR_MODEL_VERSION,
      modelConfigHash: computeBrakeWearModelConfigHash(),
      inputFingerprint: 'fp-1',
      anchorEvidenceSummary: { prediction: payload },
      frontPadEstimateMm: 8.4,
      rearPadEstimateMm: 7.9,
      frontDiscEstimateMm: 27.1,
      rearDiscEstimateMm: 25.8,
      condition: 'WATCH',
      confidence: { score: 62, label: 'MEDIUM' },
    });

    const result = await service.replay({ vehicleId: VEHICLE_ID, asOf: AS_OF });

    expect(result.status).toBe('REPRODUCED_FROM_SNAPSHOT');
    expect(result.snapshotId).toBe('snap-1');
    expect(result.frontPadEstimateMm).toBe(8.4);
    expect(brakeHealth.previewRecalculationAtAsOf).not.toHaveBeenCalled();
  });

  it('returns NOT_REPRODUCIBLE for unknown historical config', async () => {
    prisma.brakeHealthSnapshot.findFirst.mockResolvedValue({
      id: 'snap-old',
      generatedAt: new Date('2025-01-01'),
      modelVersion: 'brake-wear-v1',
      modelConfigHash: 'legacy-unknown-hash',
      inputFingerprint: 'fp-old',
      anchorEvidenceSummary: {
        prediction: {
          frontPadEstimateMm: 9,
          rearPadEstimateMm: 8.5,
          frontDiscEstimateMm: 27,
          rearDiscEstimateMm: 26,
        },
      },
      frontPadEstimateMm: 9,
      rearPadEstimateMm: 8.5,
      frontDiscEstimateMm: 27,
      rearDiscEstimateMm: 26,
      condition: 'GOOD',
      confidence: null,
    });

    const result = await service.replay({ vehicleId: VEHICLE_ID, asOf: AS_OF });

    expect(result.status).toBe('NOT_REPRODUCIBLE');
    expect(result.reason).toBe('stored_config_not_executable');
    expect(brakeHealth.previewRecalculationAtAsOf).not.toHaveBeenCalled();
  });

  it('recomputes from historical inputs when no snapshot exists', async () => {
    prisma.brakeHealthSnapshot.findFirst.mockResolvedValue(null);
    inputLoader.loadAsOf.mockResolvedValue({
      vehicleId: VEHICLE_ID,
      organizationId: 'org-1',
      anchor: {
        isInitialized: true,
        anchorServiceDate: '2026-01-01T00:00:00.000Z',
        anchorOdometerKm: 10000,
        anchorValidationStatus: 'measured_anchor',
        calibrationCount: 0,
        frontPadAnchorMm: 12,
        rearPadAnchorMm: 10,
        frontDiscAnchorMm: 28,
        rearDiscAnchorMm: 26,
        frontPadKFactor: 1,
        rearPadKFactor: 1,
        frontDiscKFactor: 1,
        rearDiscKFactor: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      vehicle: { fuelType: 'GASOLINE', brakeForceFrontPercent: null },
      latestOdometerKm: 11000,
      componentInstallations: [],
      referenceSpecs: [],
      evidence: [],
      tdiAggregate: {
        tripCount: 1,
        rawDistanceKm: 100,
        authoritativeDistanceKm: 100,
        latestTripStartedAt: '2026-02-01T00:00:00.000Z',
        latestUpdatedAt: '2026-02-01T01:00:00.000Z',
        hardBrakePer100KmSum: 2,
        fullBrakingPer100KmSum: 0.5,
      },
      ledgerAggregate: {
        totalEvents: 0,
        harshBraking: 0,
        extremeBraking: 0,
        fullBraking: 0,
        highSpeedBraking: 0,
        latestOccurredAt: null,
      },
      activeDtc: [],
      gapPolicyVersion: 'brake-coverage-gap-v1',
    });
    brakeHealth.previewRecalculationAtAsOf.mockResolvedValue({
      modelVersion: BRAKE_WEAR_MODEL_VERSION,
      modelConfigHash: computeBrakeWearModelConfigHash(),
      inputFingerprint: 'fp-recomputed',
      frontPadEstimateMm: 11.2,
      rearPadEstimateMm: 9.8,
      frontDiscEstimateMm: 27.8,
      rearDiscEstimateMm: 26.1,
      condition: 'GOOD',
      confidence: { score: 58, label: 'MEDIUM' },
    });

    const result = await service.replay({ vehicleId: VEHICLE_ID, asOf: AS_OF });

    expect(result.status).toBe('RECOMPUTED');
    expect(inputLoader.loadAsOf).toHaveBeenCalledWith(VEHICLE_ID, AS_OF);
    expect(brakeHealth.previewRecalculationAtAsOf).toHaveBeenCalled();
    expect(result.modelVersion).toBe(BRAKE_WEAR_MODEL_VERSION);
  });
});
