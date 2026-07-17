/**
 * Driving Impact Engine V1 — Unit Tests
 *
 * Tests cover:
 * - Pure scorer functions (no I/O)
 * - DrivingImpactService.computeForTrip() via mocked PrismaService
 * - Edge cases: short trip, zero distance, missing HF data, partial data
 * - Rolling aggregate computation
 * - Consumer DTO accessors for Tire and Brake
 */

import {
  capLinear,
  per100Km,
  percentile95,
  meanBrakeEnergyPerKm,
  computeLongitudinalStressScore,
  computeBrakingStressScore,
  computeStopGoStressScore,
  computeHighSpeedStressScore,
  computeThermalBrakeStressScore,
  computeDrivingStyleScore,
  computeSafetyScore,
  hasSpeedingDataFromTrip,
  safetyDataConfidenceFromTrip,
} from './driving-impact-scorer';

import { DrivingImpactService } from './driving-impact.service';
import { DRIVING_IMPACT_CONFIG as C } from './driving-impact.config';

// ── Pure scorer tests ──────────────────────────────────────────────────────────

describe('capLinear', () => {
  it('returns 0 for value 0', () => {
    expect(capLinear(0, 20)).toBe(0);
  });

  it('returns 50 at half the reference max', () => {
    expect(capLinear(10, 20)).toBe(50);
  });

  it('returns 100 at exactly the reference max', () => {
    expect(capLinear(20, 20)).toBe(100);
  });

  it('caps at 100 above the reference max', () => {
    expect(capLinear(40, 20)).toBe(100);
  });

  it('returns 0 for negative values', () => {
    expect(capLinear(-5, 20)).toBe(0);
  });

  it('returns 0 when referenceMax is 0', () => {
    expect(capLinear(10, 0)).toBe(0);
  });
});

describe('per100Km', () => {
  it('normalizes correctly', () => {
    expect(per100Km(5, 50)).toBe(10);
  });

  it('handles zero count', () => {
    expect(per100Km(0, 100)).toBe(0);
  });
});

describe('percentile95', () => {
  it('returns 0 for empty array', () => {
    expect(percentile95([])).toBe(0);
  });

  it('returns the only value for single-element array', () => {
    expect(percentile95([5.5])).toBe(5.5);
  });

  it('returns near-max for large array', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = percentile95(values);
    expect(result).toBeGreaterThanOrEqual(95);
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe('meanBrakeEnergyPerKm', () => {
  it('returns 0 for empty events', () => {
    expect(meanBrakeEnergyPerKm([], 10)).toBe(0);
  });

  it('returns 0 for zero distance', () => {
    expect(meanBrakeEnergyPerKm([{ startSpeedKmh: 100, endSpeedKmh: 0 }], 0)).toBe(0);
  });

  it('computes kinetic energy factor correctly', () => {
    // v1 = 100/3.6 ≈ 27.78 m/s, v2 = 0 m/s
    // 0.5 × (27.78² - 0) ≈ 0.5 × 771.6 ≈ 385.8 over 1 km → 385.8
    const result = meanBrakeEnergyPerKm([{ startSpeedKmh: 100, endSpeedKmh: 0 }], 1);
    expect(result).toBeGreaterThan(300);
    expect(result).toBeLessThan(450);
  });

  it('ignores events where end speed is higher than start speed (wrong direction)', () => {
    const result = meanBrakeEnergyPerKm([{ startSpeedKmh: 30, endSpeedKmh: 80 }], 10);
    expect(result).toBe(0);
  });
});

describe('computeLongitudinalStressScore', () => {
  it('returns 0 for all-zero inputs', () => {
    expect(computeLongitudinalStressScore({
      hardAccelPer100Km: 0,
      extremeAccelPer100Km: 0,
      kickdownPer100Km: 0,
      launchLikePer100Km: 0,
    })).toBe(0);
  });

  it('returns 100 at the reference max', () => {
    // Reference max = 20; set hardAccel to 20 to saturate
    expect(computeLongitudinalStressScore({
      hardAccelPer100Km: 20,
      extremeAccelPer100Km: 0,
      kickdownPer100Km: 0,
      launchLikePer100Km: 0,
    })).toBe(100);
  });

  it('gives higher score for extreme accel than hard accel at same count', () => {
    const hard = computeLongitudinalStressScore({
      hardAccelPer100Km: 5, extremeAccelPer100Km: 0, kickdownPer100Km: 0, launchLikePer100Km: 0,
    });
    const extreme = computeLongitudinalStressScore({
      hardAccelPer100Km: 0, extremeAccelPer100Km: 5, kickdownPer100Km: 0, launchLikePer100Km: 0,
    });
    expect(extreme).toBeGreaterThan(hard);
  });

  it('gives highest score for launchLike', () => {
    const launch = computeLongitudinalStressScore({
      hardAccelPer100Km: 0, extremeAccelPer100Km: 0, kickdownPer100Km: 0, launchLikePer100Km: 5,
    });
    const hard = computeLongitudinalStressScore({
      hardAccelPer100Km: 5, extremeAccelPer100Km: 0, kickdownPer100Km: 0, launchLikePer100Km: 0,
    });
    expect(launch).toBeGreaterThan(hard);
  });
});

describe('computeBrakingStressScore', () => {
  it('returns 0 for all-zero inputs', () => {
    expect(computeBrakingStressScore({
      hardBrakePer100Km: 0, extremeBrakePer100Km: 0, fullBrakingPer100Km: 0,
      brakesPer100Km: 0, p95NegativeDecel: 0,
    })).toBe(0);
  });

  it('caps at 100', () => {
    expect(computeBrakingStressScore({
      hardBrakePer100Km: 100, extremeBrakePer100Km: 100, fullBrakingPer100Km: 100,
      brakesPer100Km: 100, p95NegativeDecel: 100,
    })).toBe(100);
  });

  it('full braking contributes more per event than hard braking', () => {
    const full = computeBrakingStressScore({
      hardBrakePer100Km: 0, extremeBrakePer100Km: 0, fullBrakingPer100Km: 3,
      brakesPer100Km: 0, p95NegativeDecel: 0,
    });
    const hard = computeBrakingStressScore({
      hardBrakePer100Km: 3, extremeBrakePer100Km: 0, fullBrakingPer100Km: 0,
      brakesPer100Km: 0, p95NegativeDecel: 0,
    });
    expect(full).toBeGreaterThan(hard);
  });
});

describe('computeStopGoStressScore', () => {
  it('returns 0 for all-zero inputs', () => {
    expect(computeStopGoStressScore({ citySharePct: 0, stopDensity: 0, brakesPer100Km: 0 })).toBe(0);
  });

  it('returns 40 for 100% city with no stops or brakes', () => {
    expect(computeStopGoStressScore({ citySharePct: 100, stopDensity: 0, brakesPer100Km: 0 })).toBe(40);
  });

  it('returns 100 at full saturation', () => {
    expect(computeStopGoStressScore({
      citySharePct: 100,
      stopDensity: C.STOP_DENSITY_REFERENCE,
      brakesPer100Km: C.BRAKES_PER_100_REFERENCE,
    })).toBe(100);
  });

  it('clamps stop density above reference', () => {
    const clamped = computeStopGoStressScore({
      citySharePct: 0,
      stopDensity: C.STOP_DENSITY_REFERENCE * 10,
      brakesPer100Km: 0,
    });
    expect(clamped).toBe(35); // 0.35 × 1.0 × 100
  });
});

describe('computeHighSpeedStressScore', () => {
  it('returns 0 for no highway and no high-speed braking', () => {
    expect(computeHighSpeedStressScore({ highwaySharePct: 0, highSpeedBrakeShare: 0 })).toBe(0);
  });

  it('returns 50 for 100% highway with no high-speed braking', () => {
    expect(computeHighSpeedStressScore({ highwaySharePct: 100, highSpeedBrakeShare: 0 })).toBe(50);
  });

  it('returns 100 at full saturation', () => {
    expect(computeHighSpeedStressScore({ highwaySharePct: 100, highSpeedBrakeShare: 1 })).toBe(100);
  });
});

describe('computeThermalBrakeStressScore', () => {
  it('returns 0 for all-zero inputs', () => {
    expect(computeThermalBrakeStressScore({
      highSpeedBrakeShare: 0, fullBrakingPer100Km: 0,
      meanBrakeEnergyPerKm: 0, p95NegativeDecel: 0,
    })).toBe(0);
  });

  it('returns 100 at full saturation', () => {
    expect(computeThermalBrakeStressScore({
      highSpeedBrakeShare: 1,
      fullBrakingPer100Km: C.FULL_BRAKING_PER_100_REFERENCE,
      meanBrakeEnergyPerKm: C.BRAKE_ENERGY_REFERENCE,
      p95NegativeDecel: C.P95_DECEL_REFERENCE,
    })).toBe(100);
  });
});

describe('computeDrivingStyleScore', () => {
  it('returns 0 when all component scores are 0', () => {
    expect(computeDrivingStyleScore({
      longitudinalStressScore: 0, brakingStressScore: 0,
      stopGoStressScore: 0, highSpeedStressScore: 0,
    })).toBe(0);
  });

  it('returns 100 when all component scores are 100', () => {
    expect(computeDrivingStyleScore({
      longitudinalStressScore: 100, brakingStressScore: 100,
      stopGoStressScore: 100, highSpeedStressScore: 100,
    })).toBe(100);
  });

  it('weights braking highest', () => {
    const brakingDominated = computeDrivingStyleScore({
      longitudinalStressScore: 0, brakingStressScore: 100,
      stopGoStressScore: 0, highSpeedStressScore: 0,
    });
    const longitudinalDominated = computeDrivingStyleScore({
      longitudinalStressScore: 100, brakingStressScore: 0,
      stopGoStressScore: 0, highSpeedStressScore: 0,
    });
    expect(brakingDominated).toBeGreaterThan(longitudinalDominated);
  });

  it('matches expected composite formula', () => {
    const result = computeDrivingStyleScore({
      longitudinalStressScore: 80, brakingStressScore: 60,
      stopGoStressScore: 40, highSpeedStressScore: 20,
    });
    // 0.30×80 + 0.35×60 + 0.20×40 + 0.15×20 = 24 + 21 + 8 + 3 = 56
    expect(result).toBe(56);
  });
});

describe('computeSafetyScore', () => {
  it('returns 100 with no speeding exposure', () => {
    expect(
      computeSafetyScore({
        speedingExposurePct: 0,
        maxOverSpeedKmh: 0,
        avgOverSpeedKmh: 0,
        speedingSectionCount: 0,
      }),
    ).toBe(100);
  });

  it('decreases when exposure and severity increase', () => {
    const safe = computeSafetyScore({
      speedingExposurePct: 2,
      maxOverSpeedKmh: 5,
      avgOverSpeedKmh: 3,
      speedingSectionCount: 1,
    });
    const risky = computeSafetyScore({
      speedingExposurePct: 35,
      maxOverSpeedKmh: 30,
      avgOverSpeedKmh: 15,
      speedingSectionCount: 8,
    });
    expect(risky).toBeLessThan(safe);
  });
});

// V4.6.95 — Fix 1: missing speeding data must NEVER coerce safety to 100.
describe('hasSpeedingDataFromTrip', () => {
  it('returns false when every speeding-relevant field is null/undefined', () => {
    expect(
      hasSpeedingDataFromTrip({
        speedingExposurePct: null,
        maxOverSpeedKmh: null,
        avgOverSpeedKmh: null,
        speedingSectionCount: null,
        speedingDistanceM: null,
        speedingDurationS: null,
      }),
    ).toBe(false);
    expect(hasSpeedingDataFromTrip({})).toBe(false);
  });

  it('returns true when route enrichment ran and produced zero speeding', () => {
    expect(
      hasSpeedingDataFromTrip({
        speedingExposurePct: 0,
        maxOverSpeedKmh: 0,
        avgOverSpeedKmh: 0,
        speedingSectionCount: 0,
      }),
    ).toBe(true);
  });

  it('returns true when any single field is populated', () => {
    expect(hasSpeedingDataFromTrip({ speedingSectionCount: 2 })).toBe(true);
    expect(hasSpeedingDataFromTrip({ maxOverSpeedKmh: 12 })).toBe(true);
  });
});

describe('safetyDataConfidenceFromTrip', () => {
  it("returns 'none' when no speeding fields are populated", () => {
    expect(safetyDataConfidenceFromTrip({})).toBe('none');
  });

  it("returns 'high' when canonical exposure metric is present", () => {
    expect(
      safetyDataConfidenceFromTrip({ speedingExposurePct: 0 }),
    ).toBe('high');
  });

  it("returns 'medium' when only section/over-speed data is present", () => {
    expect(
      safetyDataConfidenceFromTrip({ speedingSectionCount: 1 }),
    ).toBe('medium');
  });

  it("returns 'low' when only ancillary distance/duration data is present", () => {
    expect(
      safetyDataConfidenceFromTrip({ speedingDistanceM: 10 }),
    ).toBe('low');
  });
});

// ── DrivingImpactService with mocked Prisma ───────────────────────────────────

function makeMockPrisma() {
  return {
    vehicleTrip: { findUnique: jest.fn(), update: jest.fn() },
    tripBehaviorEvent: { count: jest.fn(), findMany: jest.fn() },
    drivingEvent: { findMany: jest.fn() },
    tripDrivingImpact: { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    vehicleDrivingImpactCurrent: { upsert: jest.fn(), findUnique: jest.fn() },
  } as any;
}

function makeMockMetrics() {
  return {
    tripScoreDrift: { inc: jest.fn() },
  } as any;
}

function makeBaseTripRow(overrides: Partial<any> = {}) {
  return {
    id: 'trip-1',
    vehicleId: 'vehicle-1',
    tripStatus: 'COMPLETED',
    updatedAt: new Date('2026-03-01T09:05:00.000Z'),
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    behaviorEnrichmentStatus: 'COMPLETED',
    vehicle: { organizationId: 'org-1', hardwareType: 'UNKNOWN' },
    startTime: new Date('2026-03-01T08:00:00Z'),
    endTime: new Date('2026-03-01T09:00:00Z'),
    distanceKm: 50,
    citySharePercent: 30,
    highwaySharePercent: 60,
    countrySharePercent: 10,
    hardAccelerationCount: 4,
    hardBrakingCount: 6,
    fullBrakingCount: 2,
    kickdownCount: 1,
    brakingEventCount: 12,
    ...overrides,
  };
}

describe('DrivingImpactService.computeForTrip', () => {
  let service: DrivingImpactService;
  let prisma: ReturnType<typeof makeMockPrisma>;
  let metrics: ReturnType<typeof makeMockMetrics>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    metrics = makeMockMetrics();
    prisma.drivingEvent.findMany.mockResolvedValue([]);
    prisma.vehicleTrip.update.mockResolvedValue({});
    prisma.tripDrivingImpact.findUnique.mockResolvedValue(null);
    service = new DrivingImpactService(prisma, metrics);
  });

  it('skips trips below minimum distance threshold', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow({ distanceKm: 1 }));

    const result = await service.computeForTrip('trip-1', 'vehicle-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('skipped');
    expect(prisma.tripDrivingImpact.upsert).not.toHaveBeenCalled();
  });

  it('skips when trip is not found', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(null);

    const result = await service.computeForTrip('trip-1', 'vehicle-1');

    expect(result.processed).toBe(false);
    expect(result.action).toBe('skipped');
  });

  it('persists TripDrivingImpact for a valid urban trip', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow());
    prisma.tripBehaviorEvent.count.mockResolvedValue(2);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([
      { startSpeedKmh: 90, endSpeedKmh: 10, peakValue: 6.5 },
      { startSpeedKmh: 40, endSpeedKmh: 2, peakValue: 4.2 },
    ]);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    const result = await service.computeForTrip('trip-1', 'vehicle-1');

    expect(result.processed).toBe(true);
    expect(result.action).toBe('created');
    expect(result.shouldRecalculateBrake).toBe(true);
    expect(prisma.tripDrivingImpact.upsert).toHaveBeenCalledTimes(1);

    const createArg = prisma.tripDrivingImpact.upsert.mock.calls[0][0].create;
    expect(createArg.vehicleId).toBe('vehicle-1');
    expect(createArg.distanceKm).toBe(50);
    expect(createArg.authoritativeDistanceKm).toBe(50);
    expect(createArg.sourceFingerprint).toBeTruthy();
    expect(createArg.citySharePct).toBe(30);
    expect(createArg.highwaySharePct).toBe(60);
    expect(typeof createArg.longitudinalStressScore).toBe('number');
    expect(typeof createArg.brakingStressScore).toBe('number');
    expect(typeof createArg.drivingStressScore).toBe('number');
    // V4.6.95: trips with no speed-limit / speeding enrichment must yield
    // safetyScore = null (NOT coerced to 100). The base mock row has no
    // speeding fields, so the service must persist null here.
    expect(createArg.safetyScore).toBeNull();
    expect(createArg.modelVersion).toBe(C.MODEL_VERSION);
    expect(prisma.vehicleTrip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-1' },
        data: expect.objectContaining({ drivingScore: expect.any(Number) }),
      }),
    );
  });

  it('V3 LTE_R1: derives extreme braking and brake statistics from DrivingEvent (TELEMETRY_EVENTS)', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(
      makeBaseTripRow({
        vehicle: { organizationId: 'org-1', hardwareType: 'LTE_R1' },
        hardBrakingCount: 3,
        brakingEventCount: 3,
      }),
    );
    prisma.drivingEvent.findMany.mockResolvedValue([
      { eventType: 'EXTREME_BRAKING', speedKmh: 80, severity: 0.9, deltaKmh: null },
      { eventType: 'HARSH_BRAKING', speedKmh: 50, severity: 0.6, deltaKmh: 10 },
    ]);
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    await service.computeForTrip('trip-1', 'vehicle-1');

    expect(prisma.drivingEvent.findMany).toHaveBeenCalled();
    expect(prisma.tripBehaviorEvent.findMany).not.toHaveBeenCalled();
    const createArg = prisma.tripDrivingImpact.upsert.mock.calls[0][0].create;
    expect(createArg.sourceSummaryJson.v3DrivingEventInput).toBe('TELEMETRY_EVENTS');
    expect(createArg.sourceSummaryJson.extremeBrakeCount).toBe(1);
    expect(createArg.extremeBrakePer100Km).toBeCloseTo(2, 5);
  });

  it('computes high-speed brake share correctly', async () => {
    // 1 out of 2 braking events starts above 80 km/h
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow({ brakingEventCount: 2 }));
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([
      { startSpeedKmh: 100, endSpeedKmh: 60, peakValue: 4.0 }, // high speed
      { startSpeedKmh: 50, endSpeedKmh: 10, peakValue: 3.5 },  // not high speed
    ]);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    await service.computeForTrip('trip-1', 'vehicle-1');

    const createArg = prisma.tripDrivingImpact.upsert.mock.calls[0][0].create;
    expect(createArg.highSpeedBrakeShare).toBe(0.5);
  });

  it('computes stop density from near-stop braking events', async () => {
    // 2 braking events ending below 5 km/h over 50 km → 0.04 stops/km
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow({ distanceKm: 50, brakingEventCount: 3 }));
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([
      { startSpeedKmh: 60, endSpeedKmh: 0, peakValue: 5.0 },  // stop
      { startSpeedKmh: 40, endSpeedKmh: 0, peakValue: 4.0 },  // stop
      { startSpeedKmh: 30, endSpeedKmh: 20, peakValue: 2.0 }, // not a stop
    ]);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    await service.computeForTrip('trip-1', 'vehicle-1');

    const createArg = prisma.tripDrivingImpact.upsert.mock.calls[0][0].create;
    expect(createArg.stopDensity).toBeCloseTo(0.04, 2);
  });

  it('returns unchanged without upsert when source fingerprint matches', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow());
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([
      { startSpeedKmh: 90, endSpeedKmh: 10, peakValue: 6.5 },
    ]);
    prisma.tripDrivingImpact.findUnique.mockResolvedValue({
      sourceFingerprint: 'existing-fp',
      analysisStatus: 'COMPLETE',
      authoritativeDistanceKm: 50,
      tripDistanceKmAtSource: 50,
    });

    const { buildTripDrivingImpactSourceFingerprint } = await import(
      './trip-driving-impact-coverage.domain'
    );
    const fp = buildTripDrivingImpactSourceFingerprint({
      tripId: 'trip-1',
      vehicleId: 'vehicle-1',
      authoritativeDistanceKm: 50,
      sourceVersion: 'v1.1.0:trip-distance-km-v1',
      hardAccelerationCount: 4,
      hardBrakingCount: 6,
      fullBrakingCount: 2,
      brakingEventCount: 12,
      citySharePct: 30,
      highwaySharePct: 60,
      countryRoadSharePct: 10,
      behaviorEnrichmentStatus: 'COMPLETED',
      telemetryInput: 'HF_DERIVED',
      tripUpdatedAt: new Date('2026-03-01T09:00:00.000Z').toISOString(),
    });
    prisma.tripDrivingImpact.findUnique.mockResolvedValue({
      sourceFingerprint: fp,
      analysisStatus: 'COMPLETE',
      authoritativeDistanceKm: 50,
      tripDistanceKmAtSource: 50,
    });

    const result = await service.computeForTrip('trip-1', 'vehicle-1');
    expect(result.action).toBe('unchanged');
    expect(result.shouldRecalculateBrake).toBe(false);
    expect(prisma.tripDrivingImpact.upsert).not.toHaveBeenCalled();
  });

  it('handles zero braking events gracefully', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow({ brakingEventCount: 0, hardBrakingCount: 0, fullBrakingCount: 0 }));
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([]);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    const result = await service.computeForTrip('trip-1', 'vehicle-1');

    expect(result.processed).toBe(true);
    expect(result.action).toBe('created');
    const createArg = prisma.tripDrivingImpact.upsert.mock.calls[0][0].create;
    expect(createArg.p95NegativeDecel).toBe(0);
    expect(createArg.highSpeedBrakeShare).toBe(0);
    expect(createArg.stopDensity).toBe(0);
    expect(createArg.meanBrakeEnergyPerKm).toBe(0);
    expect(createArg.brakingStressScore).toBeGreaterThanOrEqual(0);
  });

  it('updates rolling current aggregate after persisting trip impact', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow());
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([]);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      {
        tripId: 'trip-1', vehicleId: 'vehicle-1', distanceKm: 50,
        tripStartedAt: new Date(), tripEndedAt: new Date(),
        citySharePct: 30, highwaySharePct: 60, countryRoadSharePct: 10,
        hardAccelPer100Km: 8, extremeAccelPer100Km: 4, hardBrakePer100Km: 12,
        extremeBrakePer100Km: 4, fullBrakingPer100Km: 4, kickdownPer100Km: 2,
        launchLikePer100Km: 0, brakesPer100Km: 24, stopDensity: 0.08,
        highSpeedBrakeShare: 0.2, meanBrakeEnergyPerKm: 100, p95NegativeDecel: 5,
        longitudinalStressScore: 42, brakingStressScore: 55, stopGoStressScore: 38,
        highSpeedStressScore: 40, thermalBrakeStressScore: 22, drivingStressScore: 46,
      },
    ]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    await service.computeForTrip('trip-1', 'vehicle-1');

    expect(prisma.vehicleDrivingImpactCurrent.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prisma.vehicleDrivingImpactCurrent.upsert.mock.calls[0][0];
    expect(upsertArg.where.vehicleId).toBe('vehicle-1');
    expect(upsertArg.create.windowDays).toBe(C.ROLLING_WINDOW_DAYS);
    expect(upsertArg.create.modelVersion).toBe(C.MODEL_VERSION);
  });

  // V4.8.24 — Safety score retired from impact persistence.
  it('always persists safetyScore = null (retired)', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(
      makeBaseTripRow({
        speedingExposurePct: 30,
        maxOverSpeedKmh: 25,
        avgOverSpeedKmh: 12,
        speedingSectionCount: 6,
      }),
    );
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([]);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    await service.computeForTrip('trip-1', 'vehicle-1');

    const createArg = prisma.tripDrivingImpact.upsert.mock.calls[0][0].create;
    expect(createArg.safetyScore).toBeNull();
    expect(typeof createArg.drivingStressScore).toBe('number');
  });

  it('rolling safetyScore stays null on recompute', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow());
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([]);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      {
        tripId: 'trip-1', vehicleId: 'vehicle-1', distanceKm: 50,
        tripStartedAt: new Date(), tripEndedAt: new Date(),
        citySharePct: 30, highwaySharePct: 60, countryRoadSharePct: 10,
        hardAccelPer100Km: 8, extremeAccelPer100Km: 4, hardBrakePer100Km: 12,
        extremeBrakePer100Km: 4, fullBrakingPer100Km: 4, kickdownPer100Km: 2,
        launchLikePer100Km: 0, brakesPer100Km: 24, stopDensity: 0.08,
        highSpeedBrakeShare: 0.2, meanBrakeEnergyPerKm: 100, p95NegativeDecel: 5,
        longitudinalStressScore: 42, brakingStressScore: 55, stopGoStressScore: 38,
        highSpeedStressScore: 40, thermalBrakeStressScore: 22, drivingStressScore: 46,
        safetyScore: null,
      },
      {
        tripId: 'trip-2', vehicleId: 'vehicle-1', distanceKm: 80,
        tripStartedAt: new Date(), tripEndedAt: new Date(),
        citySharePct: 20, highwaySharePct: 70, countryRoadSharePct: 10,
        hardAccelPer100Km: 6, extremeAccelPer100Km: 2, hardBrakePer100Km: 10,
        extremeBrakePer100Km: 3, fullBrakingPer100Km: 3, kickdownPer100Km: 1,
        launchLikePer100Km: 0, brakesPer100Km: 20, stopDensity: 0.05,
        highSpeedBrakeShare: 0.15, meanBrakeEnergyPerKm: 90, p95NegativeDecel: 4,
        longitudinalStressScore: 38, brakingStressScore: 50, stopGoStressScore: 32,
        highSpeedStressScore: 36, thermalBrakeStressScore: 20, drivingStressScore: 42,
        safetyScore: null,
      },
    ]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    await service.computeForTrip('trip-1', 'vehicle-1');

    const upsertArg = prisma.vehicleDrivingImpactCurrent.upsert.mock.calls[0][0];
    expect(upsertArg.create.safetyScore).toBeNull();
    expect(upsertArg.update.safetyScore).toBeNull();
    // Driving-style aggregation is independent and must still produce a value.
    expect(typeof upsertArg.create.drivingStressScore).toBe('number');
  });

  it('emits score drift metric when legacy score diverges', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow({ drivingScore: 30 }));
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([]);
    prisma.tripDrivingImpact.upsert.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});

    await service.computeForTrip('trip-1', 'vehicle-1');

    expect(metrics.tripScoreDrift.inc).toHaveBeenCalled();
  });
});

describe('DrivingImpactService consumer accessors', () => {
  let service: DrivingImpactService;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new DrivingImpactService(prisma);
  });

  it('getVehicleImpactForTire returns only tire-relevant fields', async () => {
    const mockRow = {
      vehicleId: 'v1',
      windowDays: 30,
      distanceKmWindow: 800,
      citySharePct: 35,
      highwaySharePct: 55,
      countryRoadSharePct: 10,
      longitudinalStressScore: 42,
      brakingStressScore: 38,
      drivingStressScore: 40,
    };
    prisma.vehicleDrivingImpactCurrent.findUnique.mockResolvedValue(mockRow);

    const result = await service.getVehicleImpactForTire('v1');
    expect(result).toEqual(mockRow);
  });

  it('getVehicleImpactForBrake returns only brake-relevant fields', async () => {
    const mockRow = {
      vehicleId: 'v1',
      windowDays: 30,
      distanceKmWindow: 800,
      brakingStressScore: 60,
      stopGoStressScore: 45,
      highSpeedStressScore: 50,
      thermalBrakeStressScore: 35,
      hardBrakePer100Km: 8,
      fullBrakingPer100Km: 2,
      brakesPer100Km: 20,
      stopDensity: 0.1,
      highSpeedBrakeShare: 0.3,
      meanBrakeEnergyPerKm: 200,
      p95NegativeDecel: 5.5,
    };
    prisma.vehicleDrivingImpactCurrent.findUnique.mockResolvedValue(mockRow);

    const result = await service.getVehicleImpactForBrake('v1');
    expect(result).toEqual(mockRow);
  });

  it('getTripImpactForTire returns null when no impact row exists', async () => {
    prisma.tripDrivingImpact.findUnique.mockResolvedValue(null);
    const result = await service.getTripImpactForTire('nonexistent-trip');
    expect(result).toBeNull();
  });

  it('getTripImpactForBrake returns null when no impact row exists', async () => {
    prisma.tripDrivingImpact.findUnique.mockResolvedValue(null);
    const result = await service.getTripImpactForBrake('nonexistent-trip');
    expect(result).toBeNull();
  });
});

// ── Fixture scenarios ─────────────────────────────────────────────────────────

describe('Fixture: Urban aggressive trip', () => {
  it('produces high braking and stop-go scores', () => {
    const braking = computeBrakingStressScore({
      hardBrakePer100Km: 15,
      extremeBrakePer100Km: 5,
      fullBrakingPer100Km: 3,
      brakesPer100Km: 30,
      p95NegativeDecel: 7,
    });
    const stopGo = computeStopGoStressScore({
      citySharePct: 95,
      stopDensity: 2.5,
      brakesPer100Km: 30,
    });
    expect(braking).toBeGreaterThan(60);
    expect(stopGo).toBeGreaterThan(70);
  });
});

describe('Fixture: Highway calm trip', () => {
  it('produces high high-speed score and low stop-go score', () => {
    const highSpeed = computeHighSpeedStressScore({
      highwaySharePct: 90,
      highSpeedBrakeShare: 0.4,
    });
    const stopGo = computeStopGoStressScore({
      citySharePct: 5,
      stopDensity: 0.02,
      brakesPer100Km: 4,
    });
    expect(highSpeed).toBeGreaterThan(55);
    expect(stopGo).toBeLessThan(15);
  });
});

describe('Fixture: Short trip below threshold', () => {
  it('computeForTrip returns false for 1 km trip', async () => {
    const prisma = makeMockPrisma();
    const service = new DrivingImpactService(prisma);
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow({ distanceKm: 1 }));

    const result = await service.computeForTrip('trip-short', 'vehicle-1');
    expect(result.processed).toBe(false);
    expect(result.action).toBe('skipped');
    expect(prisma.tripDrivingImpact.upsert).not.toHaveBeenCalled();
  });
});

describe('Fixture: EV/ICE metadata context', () => {
  it('score computation is powertrain-agnostic (only behavior inputs matter)', () => {
    // The engine computes the same scores regardless of EV or ICE context.
    // Powertrain type is only used as metadata in sourceSummaryJson if supplied;
    // it does NOT affect any formula.
    const score = computeLongitudinalStressScore({
      hardAccelPer100Km: 5,
      extremeAccelPer100Km: 2,
      kickdownPer100Km: 1,
      launchLikePer100Km: 0,
    });
    // 1.0×5 + 1.8×2 + 1.2×1 + 2.0×0 = 5 + 3.6 + 1.2 = 9.8 → 9.8/20 × 100 = 49
    expect(score).toBeCloseTo(49, 0);
  });
});
