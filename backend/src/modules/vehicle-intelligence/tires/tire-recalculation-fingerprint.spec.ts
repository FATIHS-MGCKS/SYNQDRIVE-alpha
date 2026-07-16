import {
  computeTireHealthConfigHash,
  computeTireRecalculationInputFingerprint,
  computeTireRecalculationTimePolicyBucket,
  resolvePressureFreshnessBucket,
  TIRE_RECALCULATION_MODEL_VERSION,
  type TireRecalculationInputContext,
} from './tire-recalculation-fingerprint';

function baseContext(
  overrides: Partial<TireRecalculationInputContext> = {},
): TireRecalculationInputContext {
  return {
    setupId: 'setup-1',
    setupUpdatedAt: '2026-07-01T00:00:00.000Z',
    vehicle: {
      fuelType: 'ELECTRIC',
      driveType: 'RWD',
      curbWeightKg: 2100,
      frontWeightDistributionPct: 48,
    },
    setup: {
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
      dotCodeFront: '1219',
      dotCodeRear: '1219',
      installedOdometerKm: 10000,
      odometerAnchorStatus: 'VALIDATED',
      kFactorFront: 1,
      kFactorRear: 1,
      kFactorCalibrationCount: 0,
      regenBrakingFactorFront: null,
      regenBrakingFactorRear: null,
      aiTireSpec: null,
    },
    ledgerAggregate: {
      totalKmOnSet: 1200,
      cityKm: 400,
      highwayKm: 600,
      ruralKm: 200,
      harshAccelEvents: 1,
      harshBrakeEvents: 2,
      harshCornerEvents: 0,
    },
    tires: [
      {
        id: 't-fl',
        currentPosition: 'FL',
        dotCode: '1219',
        initialTreadDepthMm: 8,
        estimatedTreadMm: 7,
        initialTreadEvidenceSource: null,
      },
      {
        id: 't-fr',
        currentPosition: 'FR',
        dotCode: '1219',
        initialTreadDepthMm: 8,
        estimatedTreadMm: 7,
        initialTreadEvidenceSource: null,
      },
    ],
    measurements: [
      {
        id: 'meas-1',
        createdAt: '2026-06-01T10:00:00.000Z',
        measuredAt: '2026-06-01T10:00:00.000Z',
        source: 'manual',
        evidenceSource: null,
        odometerAtMeasurement: 11000,
        frontLeftMm: 7.2,
        frontRightMm: 7.1,
        rearLeftMm: 7,
        rearRightMm: 6.9,
      },
    ],
    regressionPoints: [],
    latestState: {
      odometerKm: 11200,
      tirePressureFl: 2.4,
      tirePressureFr: 2.4,
      tirePressureRl: 2.5,
      tirePressureRr: 2.5,
      speedKmh: 60,
      pressureFreshness: 'fresh',
    },
    drivingImpact: null,
    temperatureTrips: [{ distanceKm: 40, outsideTemperatureStartC: 22 }],
    asOf: new Date('2026-07-16T12:00:00.000Z'),
    ...overrides,
  };
}

describe('tire-recalculation-fingerprint', () => {
  const asOf = new Date('2026-07-16T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(asOf);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('produces stable config hash and fingerprint for identical inputs', () => {
    const a = computeTireRecalculationInputFingerprint(baseContext());
    const b = computeTireRecalculationInputFingerprint(baseContext());
    const configA = computeTireHealthConfigHash();
    const configB = computeTireHealthConfigHash();

    expect(a.inputFingerprint).toBe(b.inputFingerprint);
    expect(configA).toBe(configB);
    expect(a.modelVersion).toBe(TIRE_RECALCULATION_MODEL_VERSION);
  });

  it('changes fingerprint when a new measurement is added', () => {
    const before = computeTireRecalculationInputFingerprint(baseContext());
    const after = computeTireRecalculationInputFingerprint(
      baseContext({
        measurements: [
          ...baseContext().measurements,
          {
            id: 'meas-2',
            createdAt: '2026-07-10T10:00:00.000Z',
            measuredAt: '2026-07-10T10:00:00.000Z',
            source: 'manual',
            evidenceSource: null,
            odometerAtMeasurement: 11100,
            frontLeftMm: 7,
            frontRightMm: 7,
            rearLeftMm: 6.8,
            rearRightMm: 6.8,
          },
        ],
      }),
    );

    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('changes fingerprint when ledger aggregate km changes (new trip)', () => {
    const before = computeTireRecalculationInputFingerprint(baseContext());
    const after = computeTireRecalculationInputFingerprint(
      baseContext({
        ledgerAggregate: {
          ...baseContext().ledgerAggregate,
          totalKmOnSet: 1250,
          highwayKm: 650,
        },
      }),
    );

    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('changes fingerprint when pressure values change', () => {
    const before = computeTireRecalculationInputFingerprint(baseContext());
    const after = computeTireRecalculationInputFingerprint(
      baseContext({
        latestState: {
          ...baseContext().latestState,
          tirePressureFl: 2.1,
        },
      }),
    );

    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('keeps fingerprint when pressure only ages within the same freshness bucket', () => {
    const ctx = baseContext({
      latestState: {
        ...baseContext().latestState,
        pressureFreshness: 'fresh',
      },
    });
    const before = computeTireRecalculationInputFingerprint(ctx);

    const aged = baseContext({
      latestState: {
        ...baseContext().latestState,
        pressureFreshness: 'fresh',
      },
    });
    const after = computeTireRecalculationInputFingerprint(aged);

    expect(after.inputFingerprint).toBe(before.inputFingerprint);
  });

  it('changes fingerprint when pressure freshness bucket crosses stale boundary', () => {
    const before = computeTireRecalculationInputFingerprint(
      baseContext({
        latestState: {
          ...baseContext().latestState,
          pressureFreshness: 'aging',
        },
      }),
    );
    const after = computeTireRecalculationInputFingerprint(
      baseContext({
        latestState: {
          ...baseContext().latestState,
          pressureFreshness: 'stale',
        },
      }),
    );

    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('changes fingerprint when model version changes', () => {
    const before = computeTireRecalculationInputFingerprint(baseContext());
    const after = computeTireRecalculationInputFingerprint(baseContext(), {
      modelVersion: 'tire-wear-v3',
    });

    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });

  it('changes time policy bucket across calendar month without mutating static inputs', () => {
    const july = computeTireRecalculationTimePolicyBucket(baseContext(), asOf);
    const august = computeTireRecalculationTimePolicyBucket(
      baseContext(),
      new Date('2026-08-16T12:00:00.000Z'),
    );

    expect(july).not.toBe(august);
  });

  it('maps pressure timestamps into deterministic freshness buckets', () => {
    const now = asOf;
    const fresh = resolvePressureFreshnessBucket(
      new Date(now.getTime() - 30 * 60 * 1000),
      true,
      now,
    );
    const stale = resolvePressureFreshnessBucket(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
      true,
      now,
    );

    expect(fresh).toBe('fresh');
    expect(stale).toBe('stale');
  });

  it('sorts wheel positions deterministically regardless of input order', () => {
    const reversed = baseContext({
      tires: [...baseContext().tires].reverse(),
    });
    const a = computeTireRecalculationInputFingerprint(baseContext());
    const b = computeTireRecalculationInputFingerprint(reversed);

    expect(a.inputFingerprint).toBe(b.inputFingerprint);
  });
});
