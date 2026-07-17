import { TireWearModelService } from './tire-wear-model.service';
import { TIRE_HEALTH_CONFIG } from './tire-health.config';

const cfg = TIRE_HEALTH_CONFIG;

const mockPrisma = {} as any;
const mockDI = { getVehicleImpactForTire: jest.fn().mockResolvedValue(null) } as any;
const svc = new TireWearModelService(mockPrisma, mockDI);

function createAnalysisFixture(
  overrides?: {
    latestState?: Partial<{
      odometerKm: number;
      tirePressureFl: number | null;
      tirePressureFr: number | null;
      tirePressureRl: number | null;
      tirePressureRr: number | null;
      speedKmh: number | null;
      sourceTimestamp: Date | null;
      providerFetchedAt: Date | null;
      lastSeenAt: Date | null;
    }>;
    setup?: Partial<{
      recommendedPressureFrontBar: number | null;
      recommendedPressureRearBar: number | null;
      pressureSpecSource: string;
      isStaggered: boolean;
      aiTireSpec: { maxInflationKpa: number } | null;
    }>;
  },
) {
  const now = new Date();

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        fuelType: 'Gasoline',
        driveType: 'FWD',
        curbWeightKg: 1550,
        frontWeightDistributionPct: 58,
      }),
    },
    vehicleTireSetup: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'setup-1',
        vehicleId: 'veh-1',
        aiTireSpec: overrides?.setup?.aiTireSpec ?? null,
        tireSeason: 'SUMMER',
        initialTreadFrontMm: 8.0,
        initialTreadRearMm: 8.0,
        initialTreadDepthMm: 8.0,
        expectedLifeKm: 40000,
        expectedLifeKmFront: null,
        expectedLifeKmRear: null,
        isStaggered: overrides?.setup?.isStaggered ?? false,
        frontTireWidthMm: null,
        rearTireWidthMm: null,
        kFactorFront: 1.0,
        kFactorRear: 1.0,
        kFactorCalibrationCount: 0,
        installedOdometerKm: 10000,
        recommendedPressureFrontBar:
          overrides?.setup?.recommendedPressureFrontBar ?? 2.5,
        recommendedPressureRearBar:
          overrides?.setup?.recommendedPressureRearBar ?? 2.5,
        pressureSpecSource: overrides?.setup?.pressureSpecSource ?? 'DOOR_PLACARD',
        measurements: [],
      }),
    },
    vehicleLatestState: {
      findUnique: jest.fn().mockResolvedValue({
        odometerKm: 15000,
        tirePressureFl: 1.8,
        tirePressureFr: 1.8,
        tirePressureRl: 1.8,
        tirePressureRr: 1.8,
        speedKmh: 55,
        sourceTimestamp: now,
        providerFetchedAt: now,
        lastSeenAt: now,
        ...(overrides?.latestState ?? {}),
      }),
    },
    vehicleTrip: {
      findMany: jest.fn().mockResolvedValue([
        { outsideTemperatureStartC: 18, distanceKm: 120 },
      ]),
    },
    tireWearDataPoint: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const drivingImpact = {
    getVehicleImpactForTire: jest.fn().mockResolvedValue({
      vehicleId: 'veh-1',
      windowDays: 30,
      distanceKmWindow: 1500,
      citySharePct: 55,
      highwaySharePct: 35,
      countryRoadSharePct: 10,
      longitudinalStressScore: 35,
      brakingStressScore: 30,
      drivingStressScore: 28,
    }),
  };

  const model = new TireWearModelService(prisma as any, drivingImpact as any);
  return { model, prisma, drivingImpact };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AXLE FACTOR (spec §10)
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeAxleFactor', () => {
  it('FWD front should be higher than FWD rear', () => {
    const front = svc.computeAxleFactor('front', 'FWD', null);
    const rear = svc.computeAxleFactor('rear', 'FWD', null);
    expect(front).toBeGreaterThan(rear);
  });

  it('RWD rear should be higher than RWD front', () => {
    const front = svc.computeAxleFactor('front', 'RWD', null);
    const rear = svc.computeAxleFactor('rear', 'RWD', null);
    expect(rear).toBeGreaterThan(front);
  });

  it('AWD should be roughly equal', () => {
    const front = svc.computeAxleFactor('front', 'AWD', null);
    const rear = svc.computeAxleFactor('rear', 'AWD', null);
    expect(Math.abs(front - rear)).toBeLessThan(0.06);
  });

  it('uses weight distribution when available', () => {
    const heavyFront = svc.computeAxleFactor('front', 'FWD', 60);
    const balancedFront = svc.computeAxleFactor('front', 'FWD', 50);
    expect(heavyFront).toBeGreaterThan(balancedFront);
  });

  it('clamps within [0.88, 1.22]', () => {
    const extreme = svc.computeAxleFactor('front', 'FWD', 80);
    expect(extreme).toBeGreaterThanOrEqual(cfg.factorCaps.axleMin);
    expect(extreme).toBeLessThanOrEqual(cfg.factorCaps.axleMax);
  });

  it('returns reasonable default when driveType unknown', () => {
    const factor = svc.computeAxleFactor('front', null, null);
    expect(factor).toBeGreaterThanOrEqual(0.9);
    expect(factor).toBeLessThanOrEqual(1.2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  USAGE FACTOR (spec §11)
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeUsageFactor', () => {
  it('returns 1.0 when no impact data', () => {
    expect(svc.computeUsageFactor(null)).toBe(1.0);
  });

  it('city-heavy usage raises factor', () => {
    const factor = svc.computeUsageFactor({
      vehicleId: 'v1', windowDays: 30, distanceKmWindow: 1000,
      citySharePct: 80, highwaySharePct: 10, countryRoadSharePct: 10,
      longitudinalStressScore: null, brakingStressScore: null, stopGoStressScore: null, highSpeedStressScore: null, drivingStressScore: null,
    });
    expect(factor).toBeGreaterThan(1.0);
  });

  it('highway-heavy usage lowers factor', () => {
    const factor = svc.computeUsageFactor({
      vehicleId: 'v1', windowDays: 30, distanceKmWindow: 1000,
      citySharePct: 5, highwaySharePct: 90, countryRoadSharePct: 5,
      longitudinalStressScore: null, brakingStressScore: null, stopGoStressScore: null, highSpeedStressScore: null, drivingStressScore: null,
    });
    expect(factor).toBeLessThan(1.0);
  });

  it('clamps within [0.93, 1.15]', () => {
    const extreme = svc.computeUsageFactor({
      vehicleId: 'v1', windowDays: 30, distanceKmWindow: 1000,
      citySharePct: 100, highwaySharePct: 0, countryRoadSharePct: 0,
      longitudinalStressScore: null, brakingStressScore: null, stopGoStressScore: null, highSpeedStressScore: null, drivingStressScore: null,
    });
    expect(extreme).toBeLessThanOrEqual(cfg.factorCaps.usageMax);
    expect(extreme).toBeGreaterThanOrEqual(cfg.factorCaps.usageMin);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  BEHAVIOR FACTOR (spec §12)
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeBehaviorFactor', () => {
  it('returns 1.0 when no impact data', () => {
    expect(svc.computeBehaviorFactor(null)).toBe(1.0);
  });

  it('low stress scores yield factor near 1.0', () => {
    const factor = svc.computeBehaviorFactor({
      vehicleId: 'v1', windowDays: 30, distanceKmWindow: 1000,
      citySharePct: 50, highwaySharePct: 30, countryRoadSharePct: 20,
      longitudinalStressScore: 10, brakingStressScore: 15, stopGoStressScore: 8, highSpeedStressScore: 6, drivingStressScore: 12,
    });
    expect(factor).toBeGreaterThanOrEqual(0.97);
    expect(factor).toBeLessThanOrEqual(1.05);
  });

  it('high stress scores yield elevated factor', () => {
    const factor = svc.computeBehaviorFactor({
      vehicleId: 'v1', windowDays: 30, distanceKmWindow: 1000,
      citySharePct: 50, highwaySharePct: 30, countryRoadSharePct: 20,
      longitudinalStressScore: 85, brakingStressScore: 80, stopGoStressScore: 70, highSpeedStressScore: 65, drivingStressScore: 70,
    });
    expect(factor).toBeGreaterThan(1.15);
    expect(factor).toBeLessThanOrEqual(cfg.factorCaps.behaviorMax);
  });

  it('clamps within [0.97, 1.35]', () => {
    const extreme = svc.computeBehaviorFactor({
      vehicleId: 'v1', windowDays: 30, distanceKmWindow: 1000,
      citySharePct: 50, highwaySharePct: 30, countryRoadSharePct: 20,
      longitudinalStressScore: 100, brakingStressScore: 100, stopGoStressScore: 100, highSpeedStressScore: 100, drivingStressScore: 100,
    });
    expect(extreme).toBeLessThanOrEqual(cfg.factorCaps.behaviorMax);
    expect(extreme).toBeGreaterThanOrEqual(cfg.factorCaps.behaviorMin);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TEMPERATURE FACTOR (spec §13)
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeTemperatureFactor', () => {
  it('returns 1.0 for null', () => {
    expect(svc.computeTemperatureFactor(null)).toBe(1.0);
  });

  it('returns 1.0 for 15°C (optimal)', () => {
    expect(svc.computeTemperatureFactor(15)).toBe(cfg.temperatureFactors.from5to28);
  });

  it('cold below 0°C', () => {
    expect(svc.computeTemperatureFactor(-5)).toBe(cfg.temperatureFactors.below0);
  });

  it('hot above 35°C', () => {
    expect(svc.computeTemperatureFactor(40)).toBe(cfg.temperatureFactors.above35);
  });

  it('moderate cold 0–5°C', () => {
    expect(svc.computeTemperatureFactor(3)).toBe(cfg.temperatureFactors.from0to5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  K-FACTOR CALIBRATION (spec §16)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calibrateKFactor', () => {
  it('skips when predicted wear too small', () => {
    const result = svc.calibrateKFactor(1.0, 8.0, 7.9, 7.85, 1);
    expect(result.newK).toBe(1.0);
    expect(result.alpha).toBe(0);
  });

  it('first measurement uses alpha=0.12', () => {
    const result = svc.calibrateKFactor(1.0, 8.0, 6.0, 5.5, 1);
    expect(result.alpha).toBe(cfg.calibration.alphaFirstMeasurement);
    expect(result.newK).not.toBe(1.0);
  });

  it('stabilized measurement uses alpha=0.24', () => {
    const result = svc.calibrateKFactor(1.0, 8.0, 6.0, 5.5, 5);
    expect(result.alpha).toBe(cfg.calibration.alphaStabilized);
  });

  it('clamps k within [0.75, 1.30]', () => {
    const result = svc.calibrateKFactor(1.0, 8.0, 6.0, 2.0, 5);
    expect(result.newK).toBeGreaterThanOrEqual(cfg.calibration.minK);
    expect(result.newK).toBeLessThanOrEqual(cfg.calibration.maxK);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  STAGGERED SETUP
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeStaggeredLifeAdjustment', () => {
  it('reference width (205) returns 1.0', () => {
    expect(svc.computeStaggeredLifeAdjustment(205)).toBe(1.0);
  });

  it('wider tire reduces life', () => {
    const adj = svc.computeStaggeredLifeAdjustment(265);
    expect(adj).toBeLessThan(1.0);
  });

  it('narrower tire increases life', () => {
    const adj = svc.computeStaggeredLifeAdjustment(175);
    expect(adj).toBeGreaterThan(1.0);
  });

  it('clamps between min and max', () => {
    expect(svc.computeStaggeredLifeAdjustment(400)).toBeGreaterThanOrEqual(cfg.staggered.minLifeMultiplier);
    expect(svc.computeStaggeredLifeAdjustment(100)).toBeLessThanOrEqual(cfg.staggered.maxLifeMultiplier);
  });

  it('null returns 1.0', () => {
    expect(svc.computeStaggeredLifeAdjustment(null)).toBe(1.0);
  });
});

describe('isRotationAllowedForStaggered', () => {
  it('allows side_swap_only', () => {
    expect(svc.isRotationAllowedForStaggered('side_swap_only')).toBe(true);
  });

  it('blocks cross for staggered', () => {
    expect(svc.isRotationAllowedForStaggered('cross')).toBe(false);
  });

  it('blocks full_rotation for staggered', () => {
    expect(svc.isRotationAllowedForStaggered('full_rotation')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REGRESSION
// ═══════════════════════════════════════════════════════════════════════════════

describe('fitLinearRegression', () => {
  it('returns not usable for < 2 points', () => {
    const result = svc.fitLinearRegression([{ x: 0, y: 8 }]);
    expect(result.isUsable).toBe(false);
  });

  it('finds negative slope for wear data', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i * 5000, y: 8 - i * 0.5 }));
    const result = svc.fitLinearRegression(points);
    expect(result.slope).toBeLessThan(0);
    expect(result.rSquared).toBeGreaterThan(0.9);
    expect(result.isUsable).toBe(true);
  });
});

describe('blendFormulaAndRegression', () => {
  it('returns formula only below start threshold', () => {
    expect(svc.blendFormulaAndRegression(5.0, 4.5, 3)).toBe(5.0);
  });

  it('returns regression only above full threshold', () => {
    expect(svc.blendFormulaAndRegression(5.0, 4.5, 20)).toBe(4.5);
  });

  it('blends between thresholds', () => {
    const blended = svc.blendFormulaAndRegression(5.0, 4.5, 10);
    expect(blended).toBeGreaterThan(4.5);
    expect(blended).toBeLessThan(5.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REGEN FACTORS
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeRegenFactor', () => {
  it('ICE returns 1.0', () => expect(svc.computeRegenFactor('Gasoline')).toBe(1.0));
  it('EV returns 0.82', () => expect(svc.computeRegenFactor('Electric')).toBe(0.82));
  it('PHEV returns 0.9', () => expect(svc.computeRegenFactor('PHEV')).toBe(0.9));
  it('null returns 1.0', () => expect(svc.computeRegenFactor(null)).toBe(1.0));
});

describe('computePositionalRegenFactors', () => {
  it('EV FWD has lower front', () => {
    const { front, rear } = svc.computePositionalRegenFactors('Electric', 'FWD');
    expect(front).toBeLessThan(rear);
  });

  it('EV RWD has lower rear', () => {
    const { front, rear } = svc.computePositionalRegenFactors('Electric', 'RWD');
    expect(rear).toBeLessThan(front);
  });

  it('ICE returns 1.0 for both', () => {
    const { front, rear } = svc.computePositionalRegenFactors('Gasoline', 'FWD');
    expect(front).toBe(1.0);
    expect(rear).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIG INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('TIRE_HEALTH_CONFIG', () => {
  it('legal minimum is 1.6', () => {
    expect(cfg.legalMinTreadMm).toBe(1.6);
  });

  it('replace thresholds exist for all seasons', () => {
    expect(cfg.replaceThresholds.SUMMER).toBe(3.0);
    expect(cfg.replaceThresholds.WINTER).toBe(4.0);
    expect(cfg.replaceThresholds.ALL_SEASON).toBe(3.0);
  });

  it('confidence thresholds: high=80, medium=55', () => {
    expect(cfg.confidenceThresholds.high).toBe(80);
    expect(cfg.confidenceThresholds.medium).toBe(55);
  });

  it('health status thresholds: 85/70/50/25', () => {
    expect(cfg.healthStatusThresholds.excellent).toBe(85);
    expect(cfg.healthStatusThresholds.good).toBe(70);
    expect(cfg.healthStatusThresholds.moderate).toBe(50);
    expect(cfg.healthStatusThresholds.poor).toBe(25);
  });

  it('set-level health weights sum to 1', () => {
    expect(cfg.setLevelHealth.minWeight + cfg.setLevelHealth.avgWeight).toBe(1.0);
  });

  it('calibration bounds: 0.75–1.30', () => {
    expect(cfg.calibration.minK).toBe(0.75);
    expect(cfg.calibration.maxK).toBe(1.30);
  });

  it('rotation review thresholds', () => {
    expect(cfg.rotationReview.normalReviewKm).toBe(12000);
    expect(cfg.rotationReview.urbanHeavyReviewKm).toBe(10000);
    expect(cfg.rotationReview.overdueKm).toBe(15000);
  });

  it('usage factors match spec', () => {
    expect(cfg.usageFactors.city).toBe(1.12);
    expect(cfg.usageFactors.highway).toBe(0.95);
    expect(cfg.usageFactors.countryRoad).toBe(1.03);
  });

  it('temperature factors match spec', () => {
    expect(cfg.temperatureFactors.below0).toBe(1.03);
    expect(cfg.temperatureFactors.from5to28).toBe(1.00);
    expect(cfg.temperatureFactors.above35).toBe(1.06);
  });

  it('alert thresholds', () => {
    expect(cfg.alerts.lowRemainingKm).toBe(3000);
    expect(cfg.alerts.criticalRemainingKm).toBe(1000);
    expect(cfg.alerts.unevenWearAttentionMm).toBe(0.6);
    expect(cfg.alerts.unevenWearCriticalMm).toBe(1.0);
  });

  it('factor caps match spec', () => {
    expect(cfg.factorCaps.axleMin).toBe(0.88);
    expect(cfg.factorCaps.axleMax).toBe(1.22);
    expect(cfg.factorCaps.usageMin).toBe(0.93);
    expect(cfg.factorCaps.usageMax).toBe(1.15);
    expect(cfg.factorCaps.behaviorMin).toBe(0.97);
    expect(cfg.factorCaps.behaviorMax).toBe(1.35);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  WEIGHTED TEMPERATURE FACTOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeWeightedTemperatureFactor', () => {
  it('returns 1.0 with no trips', () => {
    expect(svc.computeWeightedTemperatureFactor([])).toBe(1.0);
  });

  it('distance-weights temperatures', () => {
    const factor = svc.computeWeightedTemperatureFactor([
      { outsideTemperatureStartC: -5, distanceKm: 100 },
      { outsideTemperatureStartC: 20, distanceKm: 900 },
    ]);
    expect(factor).toBeGreaterThan(1.0);
    expect(factor).toBeLessThan(1.03);
  });
});

describe('calibrateFromMeasurement without ground-truth wheel readings', () => {
  it('returns unchanged k-factors when measurement object has no tread values', async () => {
    const prisma = {
      vehicleTireSetup: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'setup-1',
          vehicleId: 'veh-1',
          initialTreadFrontMm: 8,
          initialTreadRearMm: 8,
          initialTreadDepthMm: 8,
          kFactorFront: 1.0,
          kFactorRear: 1.0,
          kFactorCalibrationCount: 2,
        }),
        update: jest.fn(),
      },
    };
    const drivingImpact = { getVehicleImpactForTire: jest.fn().mockResolvedValue(null) };
    const model = new TireWearModelService(prisma as never, drivingImpact as never);
    jest.spyOn(model, 'computeWearAnalysis').mockResolvedValue({
      frontLeftMm: 6.5,
      frontRightMm: 6.5,
      rearLeftMm: 6.4,
      rearRightMm: 6.4,
    } as never);

    const result = await model.calibrateFromMeasurement('setup-1', {});

    expect(result.kFactorFront).toBe(1.0);
    expect(result.kFactorRear).toBe(1.0);
    expect(prisma.vehicleTireSetup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kFactorFront: 1.0,
          kFactorRear: 1.0,
          kFactorCalibrationCount: 3,
        }),
      }),
    );
  });
});

describe('computeWearAnalysis pressure freshness gating', () => {
  it('falls back to neutral pressure factors when pressure data is stale', async () => {
    const staleTimestamp = new Date(Date.now() - 14 * 60 * 60 * 1000);
    const { model } = createAnalysisFixture({
      latestState: {
        tirePressureFl: 1.6,
        tirePressureFr: 1.6,
        tirePressureRl: 1.6,
        tirePressureRr: 1.6,
        sourceTimestamp: staleTimestamp,
        providerFetchedAt: staleTimestamp,
        lastSeenAt: staleTimestamp,
      },
    });

    const result = await model.computeWearAnalysis('veh-1');
    expect(result).not.toBeNull();
    expect(result?.factors.pressureFactorFront).toBe(1);
    expect(result?.factors.pressureFactorRear).toBe(1);
    expect(result?.explainability.pressureDataFreshness).toBe('stale');
    expect(result?.explainability.pressureReadingsUsed).toBe(0);
    expect(result?.explainability.possibleCauseHints).toContain(
      'Pressure factor neutral — eligibility gates not met.',
    );
  });

  it('uses pressure factors when pressure data is fresh and complete', async () => {
    const { model } = createAnalysisFixture({
      latestState: {
        tirePressureFl: 1.8,
        tirePressureFr: 1.7,
        tirePressureRl: 1.8,
        tirePressureRr: 1.7,
        sourceTimestamp: new Date(),
      },
      setup: {
        recommendedPressureFrontBar: 2.5,
        recommendedPressureRearBar: 2.5,
        pressureSpecSource: 'DOOR_PLACARD',
      },
    });

    const result = await model.computeWearAnalysis('veh-1');
    expect(result).not.toBeNull();
    expect(result?.factors.pressureFactorFront).toBeGreaterThan(1);
    expect(result?.factors.pressureFactorRear).toBeGreaterThan(1);
    expect(result?.explainability.pressureDataFreshness).toBe('fresh');
    expect(result?.explainability.pressureReadingsUsed).toBe(4);
  });

  it('keeps neutral pressure factors when only maxInflationKpa is on aiTireSpec', async () => {
    const { model } = createAnalysisFixture({
      latestState: {
        tirePressureFl: 1.6,
        tirePressureFr: 1.6,
        tirePressureRl: 1.6,
        tirePressureRr: 1.6,
        sourceTimestamp: new Date(),
      },
      setup: {
        aiTireSpec: { maxInflationKpa: 350 },
        pressureSpecSource: 'UNKNOWN',
        recommendedPressureFrontBar: null,
        recommendedPressureRearBar: null,
      },
    });

    const result = await model.computeWearAnalysis('veh-1');
    expect(result?.factors.pressureFactorFront).toBe(1);
    expect(result?.factors.pressureFactorRear).toBe(1);
  });

  it('queries only the ACTIVE tire setup status', async () => {
    const { model, prisma } = createAnalysisFixture();
    await model.computeWearAnalysis('veh-1');

    expect(prisma.vehicleTireSetup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vehicleId: 'veh-1',
          removedAt: null,
          status: 'ACTIVE',
        }),
      }),
    );
  });
});
