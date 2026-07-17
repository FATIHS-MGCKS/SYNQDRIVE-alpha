import { BrakeHealthService } from './brake-health.service';
import { BRAKE_WEAR_MODEL_VERSION, computeBrakeWearModelConfigHash } from './brake-wear-model-version';
import { computeBrakeRecalculationInputFingerprint } from './brake-recalculation-fingerprint';
import { buildSnapshotPredictionPayload } from './brake-wear-model-version';

const VEHICLE_ID = 'v1';
const ORG_ID = 'org-1';

const buildRecalcContext = () => ({
  vehicleId: VEHICLE_ID,
  organizationId: ORG_ID,
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
  latestOdometerKm: 11200,
  componentInstallations: [{ id: 'inst-front-pads', componentType: 'FRONT_PADS', status: 'ACTIVE', installedAt: '2026-01-01T00:00:00.000Z', anchorThicknessMm: 12, anchorSource: 'MEASURED', evidenceId: 'ev-1' }],
  referenceSpecs: [],
  evidence: [],
  tdiAggregate: {
    tripCount: 1,
    rawDistanceKm: 200,
    authoritativeDistanceKm: 200,
    latestTripStartedAt: '2026-02-01T00:00:00.000Z',
    latestUpdatedAt: '2026-02-01T01:00:00.000Z',
    hardBrakePer100KmSum: 4,
    fullBrakingPer100KmSum: 1,
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

describe('BrakeHealthService snapshots', () => {
  const mockPrisma = {
    brakeHealthCurrent: { findUnique: jest.fn(), update: jest.fn() },
    brakeHealthSnapshot: { findFirst: jest.fn(), create: jest.fn() },
    brakeRecalculationAudit: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    tripDrivingImpact: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleBrakeReferenceSpec: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: { findUnique: jest.fn().mockResolvedValue({ fuelType: 'GASOLINE', brakeForceFrontPercent: null }) },
    vehicleLatestState: { findUnique: jest.fn().mockResolvedValue({ odometerKm: 11200 }) },
  } as any;

  const mockDI = { getVehicleImpactForBrake: jest.fn().mockResolvedValue(null) } as any;
  const mockBrakeEvidence = {
    listRecent: jest.fn(),
    getLatest: jest.fn(),
    getLatestMeasurement: jest.fn(),
    getLatestSafetySignal: jest.fn(),
    record: jest.fn(),
    recordMany: jest.fn(),
  } as any;
  const mockRecalcInputLoader = {
    load: jest.fn().mockImplementation(async () => buildRecalcContext()),
  };
  const mockPredictionValidation = {
    linkPendingMeasurementSnapshots: jest.fn().mockResolvedValue([]),
  };

  const svc = new BrakeHealthService(
    mockPrisma,
    mockDI,
    mockBrakeEvidence,
    mockRecalcInputLoader as any,
    undefined,
    undefined,
    mockPredictionValidation as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.brakeHealthSnapshot.findFirst.mockResolvedValue(null);
    mockPrisma.brakeHealthSnapshot.create.mockResolvedValue({ id: 'snap-new' });
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValue({
      vehicleId: VEHICLE_ID,
      organizationId: ORG_ID,
      isInitialized: true,
      anchorServiceDate: new Date('2026-01-01T00:00:00Z'),
      anchorOdometerKm: 10000,
      frontPadAnchorMm: 12,
      rearPadAnchorMm: 10,
      frontDiscAnchorMm: 28,
      rearDiscAnchorMm: 26,
      frontPadKFactor: 1,
      rearPadKFactor: 1,
      frontDiscKFactor: 1,
      rearDiscKFactor: 1,
      calibrationCount: 0,
      anchorValidationStatus: 'measured_anchor',
      baselineWarnings: [],
    });
    mockPrisma.tripDrivingImpact.findMany.mockResolvedValue([
      {
        tripId: 't1',
        distanceKm: 200,
        authoritativeDistanceKm: 200,
        citySharePct: 50,
        highwaySharePct: 30,
        countryRoadSharePct: 20,
        hardBrakePer100Km: 4,
        fullBrakingPer100Km: 0.5,
        stopDensity: 1,
        highSpeedBrakeShare: 0.1,
        thermalBrakeStressScore: 40,
      },
    ]);
  });

  it('creates an immutable snapshot after successful recalculation', async () => {
    const result = await svc.recalculate(VEHICLE_ID, { trigger: 'scheduler' });

    expect(result?.snapshotId).toBe('snap-new');
    expect(mockPrisma.brakeHealthSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: VEHICLE_ID,
          modelVersion: BRAKE_WEAR_MODEL_VERSION,
          modelConfigHash: computeBrakeWearModelConfigHash(),
          componentInstallationIds: ['inst-front-pads'],
          observedDistanceKm: 200,
        }),
      }),
    );
    expect(mockPredictionValidation.linkPendingMeasurementSnapshots).toHaveBeenCalled();
  });

  it('deduplicates when an identical snapshot already exists', async () => {
    const fingerprint = computeBrakeRecalculationInputFingerprint(buildRecalcContext(), {
      modelConfigHash: computeBrakeWearModelConfigHash(),
    });
    mockPrisma.brakeHealthSnapshot.findFirst.mockResolvedValueOnce({ id: 'snap-existing' });
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      vehicleId: VEHICLE_ID,
      organizationId: ORG_ID,
      isInitialized: true,
      anchorServiceDate: new Date('2026-01-01T00:00:00Z'),
      anchorOdometerKm: 10000,
      frontPadAnchorMm: 12,
      rearPadAnchorMm: 10,
      frontDiscAnchorMm: 28,
      rearDiscAnchorMm: 26,
      frontPadKFactor: 1,
      rearPadKFactor: 1,
      frontDiscKFactor: 1,
      rearDiscKFactor: 1,
      calibrationCount: 0,
      anchorValidationStatus: 'measured_anchor',
      baselineWarnings: [],
      padsHealthPct: 90,
      discsHealthPct: 88,
      padsRemainingKm: 10000,
      discsRemainingKm: 12000,
      confidenceScore: 70,
      confidenceLabel: 'Medium',
      hasAlert: false,
      modeledDistanceKm: 200,
      coverageRatioRaw: 0.17,
      recalculationInputFingerprint: fingerprint.inputFingerprint,
      recalculationConfigHash: fingerprint.modelConfigHash,
      recalculationModelVersion: fingerprint.modelVersion,
    });

    const result = await svc.recalculate(VEHICLE_ID, { trigger: 'scheduler' });

    expect(result?.skipped).toBe(true);
    expect(result?.snapshotId).toBe('snap-existing');
    expect(mockPrisma.brakeHealthSnapshot.create).not.toHaveBeenCalled();
    expect(mockPrisma.tripDrivingImpact.findMany).not.toHaveBeenCalled();
  });

  it('creates a new snapshot when model version changes even with same trips', async () => {
    mockPrisma.brakeHealthSnapshot.findFirst.mockResolvedValueOnce(null);
    mockPrisma.brakeHealthSnapshot.create.mockResolvedValueOnce({ id: 'snap-v2' });

    const result = await svc.recalculate(VEHICLE_ID);

    expect(result?.snapshotId).toBe('snap-v2');
    expect(mockPrisma.brakeHealthSnapshot.create.mock.calls[0][0].data.modelVersion).toBe(
      BRAKE_WEAR_MODEL_VERSION,
    );
  });

  it('does not link measurements when force refresh is used', async () => {
    mockPrisma.brakeHealthSnapshot.findFirst.mockResolvedValueOnce(null);

    await svc.recalculate(VEHICLE_ID, { force: true, reason: 'manual audit' });

    expect(mockPredictionValidation.linkPendingMeasurementSnapshots).not.toHaveBeenCalled();
  });
});

describe('snapshot payload helpers', () => {
  it('embeds prediction payload in anchor evidence summary shape', () => {
    const generatedAt = new Date('2026-07-17T12:00:00Z');
    const payload = buildSnapshotPredictionPayload({
      modelVersion: BRAKE_WEAR_MODEL_VERSION,
      modelConfigHash: computeBrakeWearModelConfigHash(),
      predictionGeneratedAt: generatedAt,
      frontPadEstimateMm: 9.5,
      rearPadEstimateMm: 8.8,
      frontDiscEstimateMm: 27.5,
      rearDiscEstimateMm: 26.2,
    });
    expect(payload.predictionGeneratedAt).toBe(generatedAt.toISOString());
    expect(payload.frontPadEstimateMm).toBe(9.5);
  });
});
