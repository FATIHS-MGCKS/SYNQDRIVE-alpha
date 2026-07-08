import { BrakeHealthService } from './brake-health.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';

const cfg = BRAKE_HEALTH_CONFIG;

const mockPrisma = {
  brakeHealthCurrent: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  tripDrivingImpact: { findMany: jest.fn().mockResolvedValue([]) },
  vehicleBrakeReferenceSpec: { findMany: jest.fn().mockResolvedValue([]) },
  vehicleServiceEvent: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  vehicle: { findUnique: jest.fn().mockResolvedValue({ fuelType: 'GASOLINE', brakeForceFrontPercent: null, organizationId: null }) },
  vehicleLatestState: { findUnique: jest.fn().mockResolvedValue({ odometerKm: 50000, brakePadPercent: null, lastSeenAt: new Date('2026-04-13T10:00:00Z') }) },
} as any;

const mockDI = {
  getVehicleImpactForBrake: jest.fn().mockResolvedValue(null),
} as any;

const mockBrakeEvidence = {
  listRecent: jest.fn().mockResolvedValue([]),
  getLatest: jest.fn().mockResolvedValue(null),
  getLatestMeasurement: jest.fn().mockResolvedValue(null),
  getLatestSafetySignal: jest.fn().mockResolvedValue(null),
  record: jest.fn().mockResolvedValue(null),
  recordMany: jest.fn().mockResolvedValue({ count: 0 }),
} as any;

const svc = new BrakeHealthService(mockPrisma, mockDI, mockBrakeEvidence);

// ═══════════════════════════════════════════════════════════════════════════════
//  PAD WEAR MODEL (spec §10)
// ═══════════════════════════════════════════════════════════════════════════════

describe('computePadWear', () => {
  it('returns null estimates when anchor is null', () => {
    const r = svc.computePadWear(null, 10000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.estimatedMm).toBeNull();
    expect(r.healthPct).toBeNull();
  });

  it('returns 100% health at 0 km', () => {
    const r = svc.computePadWear(12, 0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.estimatedMm).toBe(12);
    expect(r.healthPct).toBe(100);
  });

  it('reduces health over distance', () => {
    const r = svc.computePadWear(12, 35000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.healthPct!).toBeGreaterThan(0);
    expect(r.healthPct!).toBeLessThan(100);
    expect(r.estimatedMm!).toBeLessThan(12);
    expect(r.estimatedMm!).toBeGreaterThan(2);
  });

  it('hits 0% at full base life distance (ICE, balanced)', () => {
    const r = svc.computePadWear(12, 70000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.healthPct!).toBeLessThanOrEqual(5);
  });

  it('city usage wears pads faster than highway', () => {
    const city = svc.computePadWear(12, 20000, 0.72, cfg.padUsageFactors.city, 1.0, 1.0, 1.0, 1.0, 1.0);
    const hwy = svc.computePadWear(12, 20000, 0.72, cfg.padUsageFactors.highway, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(city.estimatedMm!).toBeLessThan(hwy.estimatedMm!);
  });

  it('EV reku reduces pad wear rate', () => {
    const ice = svc.computePadWear(12, 30000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    const ev = svc.computePadWear(12, 30000, 0.72, 1.0, 1.0, 1.0, 1.0, cfg.padRekuFactors.ELECTRIC, 1.0);
    expect(ev.estimatedMm!).toBeGreaterThan(ice.estimatedMm!);
  });

  it('higher bias share wears pads faster', () => {
    const front = svc.computePadWear(12, 20000, 0.74, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    const rear = svc.computePadWear(12, 20000, 0.28, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(front.estimatedMm!).toBeLessThan(rear.estimatedMm!);
  });

  it('remaining km is positive when pad life remains', () => {
    const r = svc.computePadWear(12, 10000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.remainingKm!).toBeGreaterThan(0);
  });

  it('remaining km is 0 when pad is at critical', () => {
    const r = svc.computePadWear(12, 80000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.remainingKm).toBe(0);
  });

  it('k-factor > 1 accelerates wear', () => {
    const base = svc.computePadWear(12, 20000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    const k = svc.computePadWear(12, 20000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.2);
    expect(k.estimatedMm!).toBeLessThan(base.estimatedMm!);
  });

  it('stop density factor > 1 increases wear', () => {
    const base = svc.computePadWear(12, 20000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    const high = svc.computePadWear(12, 20000, 0.72, 1.0, 1.16, 1.0, 1.0, 1.0, 1.0);
    expect(high.estimatedMm!).toBeLessThan(base.estimatedMm!);
  });

  it('returns 0% health when anchor equals critical', () => {
    const r = svc.computePadWear(2.0, 1000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.healthPct).toBe(0);
    expect(r.remainingKm).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DISC WEAR MODEL (spec §11)
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeDiscWear', () => {
  it('returns null estimates when anchor is null', () => {
    const r = svc.computeDiscWear(null, 10000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.estimatedMm).toBeNull();
  });

  it('returns 100% health at 0 km', () => {
    const r = svc.computeDiscWear(28, 0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.estimatedMm).toBe(28);
    expect(r.healthPct).toBe(100);
  });

  it('reduces disc thickness over distance', () => {
    const r = svc.computeDiscWear(28, 45000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.estimatedMm!).toBeLessThan(28);
    expect(r.healthPct!).toBeGreaterThan(0);
    expect(r.healthPct!).toBeLessThan(100);
  });

  it('disc reaches 0% at base life (ICE, balanced)', () => {
    const r = svc.computeDiscWear(28, 90000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(r.healthPct!).toBeLessThanOrEqual(5);
  });

  it('EV reku is > ICE reku (discs last longer on EVs)', () => {
    const ice = svc.computeDiscWear(28, 30000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    const ev = svc.computeDiscWear(28, 30000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, cfg.discRekuFactors.ELECTRIC, 1.0);
    expect(ev.estimatedMm!).toBeGreaterThan(ice.estimatedMm!);
  });

  it('thermal factor > 1 wears discs faster', () => {
    const base = svc.computeDiscWear(28, 30000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    const hot = svc.computeDiscWear(28, 30000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.15, 1.0, 1.0);
    expect(hot.estimatedMm!).toBeLessThan(base.estimatedMm!);
  });

  it('highSpeedBrake factor > 1 accelerates disc wear', () => {
    const base = svc.computeDiscWear(28, 30000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    const high = svc.computeDiscWear(28, 30000, 0.72, 1.0, 1.18, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(high.estimatedMm!).toBeLessThan(base.estimatedMm!);
  });

  it('disc health clamped between 0 and 100', () => {
    const fresh = svc.computeDiscWear(28, 0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(fresh.healthPct).toBe(100);
    const worn = svc.computeDiscWear(28, 200000, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    expect(worn.healthPct).toBe(0);
  });

  it('disc max wear is 2.0mm (health 0 at anchor-2.0)', () => {
    expect(cfg.disc.maxWearMm).toBe(2.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  USAGE FACTORS
// ═══════════════════════════════════════════════════════════════════════════════

describe('computePadUsageFactor', () => {
  it('returns 1.0 when impact is null', () => {
    expect(svc.computePadUsageFactor(null)).toBe(1.0);
  });

  it('pure city driving returns city factor', () => {
    const f = svc.computePadUsageFactor({ citySharePct: 100, highwaySharePct: 0, countryRoadSharePct: 0 } as any);
    expect(f).toBeCloseTo(cfg.padUsageFactors.city, 1);
  });

  it('pure highway returns highway factor', () => {
    const f = svc.computePadUsageFactor({ citySharePct: 0, highwaySharePct: 100, countryRoadSharePct: 0 } as any);
    expect(f).toBeCloseTo(cfg.padUsageFactors.highway, 1);
  });

  it('mixed driving returns blended factor', () => {
    const f = svc.computePadUsageFactor({ citySharePct: 50, highwaySharePct: 30, countryRoadSharePct: 20 } as any);
    expect(f).toBeGreaterThan(cfg.padUsageFactors.highway);
    expect(f).toBeLessThan(cfg.padUsageFactors.city);
  });
});

describe('computeDiscUsageFactor', () => {
  it('returns 1.0 when impact is null', () => {
    expect(svc.computeDiscUsageFactor(null)).toBe(1.0);
  });

  it('city disc factor is less than city pad factor', () => {
    const pad = svc.computePadUsageFactor({ citySharePct: 100, highwaySharePct: 0, countryRoadSharePct: 0 } as any);
    const disc = svc.computeDiscUsageFactor({ citySharePct: 100, highwaySharePct: 0, countryRoadSharePct: 0 } as any);
    expect(disc).toBeLessThan(pad);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIG INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('BRAKE_HEALTH_CONFIG integrity', () => {
  it('pad critical < warning', () => {
    expect(cfg.pad.criticalMm).toBeLessThan(cfg.pad.warningMm);
  });

  it('disc warning < max', () => {
    expect(cfg.disc.warningWearMm).toBeLessThan(cfg.disc.maxWearMm);
  });

  it('brake bias defaults sum to 1.0', () => {
    expect(cfg.brakeBias.defaultFront + cfg.brakeBias.defaultRear).toBeCloseTo(1.0);
    expect(cfg.brakeBias.frontHeavy.front + cfg.brakeBias.frontHeavy.rear).toBeCloseTo(1.0);
    expect(cfg.brakeBias.balanced.front + cfg.brakeBias.balanced.rear).toBeCloseTo(1.0);
    expect(cfg.brakeBias.rearBiased.front + cfg.brakeBias.rearBiased.rear).toBeCloseTo(1.0);
  });

  it('pad reku factors exist for all powertrain types', () => {
    for (const key of ['GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID', 'PLUGIN_HYBRID']) {
      expect(cfg.padRekuFactors[key]).toBeDefined();
      expect(cfg.padRekuFactors[key]).toBeGreaterThan(0);
      expect(cfg.padRekuFactors[key]).toBeLessThanOrEqual(1.0);
    }
  });

  it('disc reku factors exist for all powertrain types', () => {
    for (const key of ['GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID', 'PLUGIN_HYBRID']) {
      expect(cfg.discRekuFactors[key]).toBeDefined();
      expect(cfg.discRekuFactors[key]).toBeGreaterThan(0);
      expect(cfg.discRekuFactors[key]).toBeLessThanOrEqual(1.0);
    }
  });

  it('EV pad reku < ICE pad reku', () => {
    expect(cfg.padRekuFactors.ELECTRIC).toBeLessThan(cfg.padRekuFactors.GASOLINE);
  });

  it('EV disc reku < ICE disc reku', () => {
    expect(cfg.discRekuFactors.ELECTRIC).toBeLessThan(cfg.discRekuFactors.GASOLINE);
  });

  it('calibration limits are correct', () => {
    expect(cfg.calibration.padMinK).toBeLessThan(cfg.calibration.padMaxK);
    expect(cfg.calibration.discMinK).toBeLessThan(cfg.calibration.discMaxK);
    expect(cfg.calibration.padMinK).toBe(0.70);
    expect(cfg.calibration.padMaxK).toBe(1.35);
    expect(cfg.calibration.discMinK).toBe(0.75);
    expect(cfg.calibration.discMaxK).toBe(1.30);
  });

  it('confidence thresholds are correct', () => {
    expect(cfg.confidenceThresholds.high).toBe(80);
    expect(cfg.confidenceThresholds.medium).toBe(55);
  });

  it('set-level weights sum to 1.0', () => {
    expect(cfg.setLevel.minWeight + cfg.setLevel.avgWeight).toBeCloseTo(1.0);
  });

  it('alert thresholds are ordered', () => {
    expect(cfg.alerts.criticalRemainingKm).toBeLessThan(cfg.alerts.lowRemainingKm);
  });

  it('pad stop density anchors are ascending', () => {
    for (let i = 0; i < cfg.padStopDensityAnchors.length - 1; i++) {
      expect(cfg.padStopDensityAnchors[i].threshold).toBeLessThan(cfg.padStopDensityAnchors[i + 1].threshold);
      expect(cfg.padStopDensityAnchors[i].factor).toBeLessThanOrEqual(cfg.padStopDensityAnchors[i + 1].factor);
    }
  });

  it('disc thermal anchors are ascending', () => {
    for (let i = 0; i < cfg.discThermalAnchors.length - 1; i++) {
      expect(cfg.discThermalAnchors[i].score).toBeLessThan(cfg.discThermalAnchors[i + 1].score);
      expect(cfg.discThermalAnchors[i].factor).toBeLessThanOrEqual(cfg.discThermalAnchors[i + 1].factor);
    }
  });

  it('total max confidence points = 98', () => {
    const c = cfg.confidence;
    const total = c.padAnchors + c.rotorAnchors + c.serviceEvents + c.drivingImpactData
      + c.brakingMetrics + c.usageData + c.odometerAvailable + c.measurementExists + c.calibrationStabilized;
    expect(total).toBe(98);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUMMARY DTO (not-initialized)
// ═══════════════════════════════════════════════════════════════════════════════

describe('getSummary', () => {
  it('returns no-baseline summary when no current record', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce(null);
    const r = await svc.getSummary('v1');
    expect(r.isInitialized).toBe(false);
    expect(r.stateClass).toBe('NO_BASELINE');
    expect(r.legacy.status).toBe('awaiting_baseline');
    expect(r.actions?.canAddBrakeService).toBe(true);
    expect(r.frontAxle).toBeDefined();
    expect(r.rearAxle).toBeDefined();
  });

  it('returns warning-only when legacy warning exists but no baseline', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({ isInitialized: false });
    mockPrisma.vehicleLatestState.findUnique.mockResolvedValueOnce({
      brakePadPercent: 28,
      lastSeenAt: new Date('2026-04-13T10:00:00Z'),
    });
    const r = await svc.getSummary('v1');
    expect(r.isInitialized).toBe(false);
    expect(r.stateClass).toBe('WARNING_ONLY');
  });

  it('returns initialized summary with pads and discs', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      isInitialized: true,
      anchorOdometerKm: 42000,
      frontPadAnchorMm: 12,
      rearPadAnchorMm: 10,
      frontDiscAnchorMm: 28,
      rearDiscAnchorMm: 26,
      padsHealthPct: 72,
      padsRemainingKm: 28000,
      discsHealthPct: 88,
      discsRemainingKm: 55000,
      anchorServiceDate: new Date('2024-06-01'),
      distanceSinceAnchorKm: 8000,
      modeledDistanceKm: 7200,
      modeledTripCount: 44,
      modelCoverageRatio: 0.9,
      modelingSource: 'trip_impacts',
      baselineWarnings: [],
      confidenceScore: 62,
      confidenceLabel: 'Medium',
      hasAlert: false,
    });
    const r = await svc.getSummary('v1');
    expect(r.isInitialized).toBe(true);
    expect(r.stateClass).toBe('ESTIMATED');
    expect(r.legacy.padsHealthPct).toBe(72);
    expect(r.legacy.discsHealthPct).toBe(88);
    expect(r.overallCondition).toBeDefined();
    expect(r.frontAxle.condition).toBeDefined();
    expect(r.alerts).toEqual(r.openAlerts);
    expect(r.confidence?.label).toBe('Medium');
    expect(r.hasAlert).toBe(r.openAlerts.some((a) => a.severity === 'critical' || a.severity === 'warning'));
  });
});

describe('getDetail', () => {
  const detailCurrent = {
    isInitialized: true,
    anchorOdometerKm: 42000,
    frontPadAnchorMm: 12,
    rearPadAnchorMm: 10,
    frontDiscAnchorMm: 28,
    rearDiscAnchorMm: 26,
    frontPadEstimatedMm: 9.5,
    rearPadEstimatedMm: 8.2,
    frontDiscEstimatedMm: 26,
    rearDiscEstimatedMm: 24.5,
    frontPadHealthPct: 72,
    rearPadHealthPct: 68,
    frontDiscHealthPct: 88,
    rearDiscHealthPct: 85,
    frontPadRemainingKm: 28000,
    rearPadRemainingKm: 26000,
    frontDiscRemainingKm: 55000,
    rearDiscRemainingKm: 52000,
    frontPadWearRateMmPerKm: 0.0003,
    rearPadWearRateMmPerKm: 0.00028,
    frontDiscWearRateMmPerKm: 0.0001,
    rearDiscWearRateMmPerKm: 0.00009,
    frontPadKFactor: 1,
    rearPadKFactor: 1,
    frontDiscKFactor: 1,
    rearDiscKFactor: 1,
    padsHealthPct: 72,
    padsRemainingKm: 28000,
    discsHealthPct: 88,
    discsRemainingKm: 55000,
    anchorServiceDate: new Date('2024-06-01'),
    distanceSinceAnchorKm: 8000,
    modeledDistanceKm: 7200,
    modeledTripCount: 44,
    modelCoverageRatio: 0.9,
    modelingSource: 'trip_impacts',
    baselineWarnings: [],
    confidenceScore: 62,
    confidenceLabel: 'Medium',
    hasAlert: false,
  };

  it('nests wear-model estimates under legacy (UI must use summary canonical fields)', async () => {
    mockPrisma.brakeHealthCurrent.findUnique
      .mockResolvedValueOnce(detailCurrent)
      .mockResolvedValueOnce(detailCurrent);
    mockPrisma.vehicleBrakeReferenceSpec.findMany.mockResolvedValueOnce([]);
    mockPrisma.vehicleServiceEvent.findMany.mockResolvedValueOnce([]);

    const d = await svc.getDetail('v1');

    expect(d.summary.overallCondition).toBeDefined();
    expect(d.summary.frontAxle.condition).toBeDefined();
    expect(d.summary.rearAxle.condition).toBeDefined();
    expect(d.legacy.frontPads?.estimatedMm).toBe(9.5);
    expect(d.legacy.frontPads?.healthPct).toBe(72);
    expect((d as { frontPads?: unknown }).frontPads).toBeUndefined();
    expect(d.alerts).toHaveLength(d.summary.openAlerts.length);
    expect(d.alerts[0]?.message).toBe(d.summary.openAlerts[0]?.message);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CANONICAL READ MODEL (evidence-based honesty)
// ═══════════════════════════════════════════════════════════════════════════════

describe('canonical read model', () => {
  const baseCurrent = {
    isInitialized: true,
    stateClass: 'ESTIMATED',
    anchorOdometerKm: 40000,
    anchorServiceDate: new Date('2025-06-01T00:00:00Z'),
    frontPadAnchorMm: 12,
    rearPadAnchorMm: 10,
    frontDiscAnchorMm: 28,
    rearDiscAnchorMm: 26,
    padsHealthPct: 60,
    padsRemainingKm: 8000,
    discsHealthPct: 80,
    discsRemainingKm: 20000,
    distanceSinceAnchorKm: 8000,
    modeledDistanceKm: 7200,
    modeledTripCount: 44,
    modelCoverageRatio: 0.9,
    modelingSource: 'trip_impacts',
    baselineWarnings: [],
    confidenceScore: 62,
    confidenceLabel: 'Medium',
    hasAlert: false,
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };

  it('a pure estimate (no evidence) caps at WARNING and never CRITICAL', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      ...baseCurrent,
      // Front axle modeled near end-of-life — but it is an ESTIMATE only.
      frontPadHealthPct: 5,
      frontDiscHealthPct: 40,
      rearPadHealthPct: 60,
      rearDiscHealthPct: 70,
      frontPadRemainingKm: 800,
      frontDiscRemainingKm: 4000,
      rearPadRemainingKm: 9000,
      rearDiscRemainingKm: 12000,
    });
    mockPrisma.vehicleServiceEvent.findFirst.mockResolvedValueOnce(null);
    mockBrakeEvidence.listRecent.mockResolvedValueOnce([]);

    const r = await svc.getSummary('v1');
    expect(r.overallCondition).toBe('WARNING'); // capped — not CRITICAL
    expect(r.frontDataBasis).toBe('ESTIMATED');
    expect(r.estimatedFrontRemainingKmMin).not.toBeNull();
    expect(r.estimatedFrontRemainingKmMax).not.toBeNull();
    // No fake measured timestamp invented from an estimate.
    expect(r.lastMeasurementAt).toBeNull();
  });

  it('a measured-critical pad overrides the estimate → CRITICAL + MEASURED basis', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      ...baseCurrent,
      // Healthy estimate …
      frontPadHealthPct: 80,
      frontDiscHealthPct: 85,
      rearPadHealthPct: 80,
      rearDiscHealthPct: 85,
      frontPadRemainingKm: 12000,
      frontDiscRemainingKm: 20000,
      rearPadRemainingKm: 12000,
      rearDiscRemainingKm: 20000,
    });
    mockPrisma.vehicleServiceEvent.findFirst.mockResolvedValueOnce(null);
    // … but a fresh manual measurement says the front pad is at 1.5 mm (≤ critical 2.0).
    mockBrakeEvidence.listRecent.mockResolvedValueOnce([
      {
        id: 'e1',
        vehicleId: 'v1',
        source: 'MANUAL_MEASUREMENT',
        axle: 'FRONT',
        measuredPadMm: 1.5,
        measuredDiscMm: null,
        discCondition: null,
        brakeFluidStatus: null,
        dtcSeverity: null,
        immediateReplacement: null,
        mileageAtMeasurementKm: 50000,
        measuredAt: new Date('2026-05-20T00:00:00Z'),
        createdAt: new Date('2026-05-20T00:00:00Z'),
      },
    ]);

    const r = await svc.getSummary('v1');
    expect(r.overallCondition).toBe('CRITICAL');
    expect(r.frontDataBasis).toBe('MEASURED');
    expect(r.frontAxleCondition).toBe('CRITICAL');
    expect(r.lastMeasurementAt).not.toBeNull();
    expect(r.lastMeasurementMileageKm).toBe(50000);
    expect(r.openAlerts.some((a) => a.code === 'BRAKE_PAD_CRITICAL')).toBe(true);
  });

  it('a critical brake-fluid safety signal drives CRITICAL', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      ...baseCurrent,
      frontPadHealthPct: 80,
      frontDiscHealthPct: 85,
      rearPadHealthPct: 80,
      rearDiscHealthPct: 85,
      frontPadRemainingKm: 12000,
      frontDiscRemainingKm: 20000,
      rearPadRemainingKm: 12000,
      rearDiscRemainingKm: 20000,
    });
    mockPrisma.vehicleServiceEvent.findFirst.mockResolvedValueOnce(null);
    mockBrakeEvidence.listRecent.mockResolvedValueOnce([
      {
        id: 'e2',
        vehicleId: 'v1',
        source: 'WORKSHOP_REPORT',
        axle: 'UNKNOWN',
        measuredPadMm: null,
        measuredDiscMm: null,
        discCondition: null,
        brakeFluidStatus: 'CRITICAL',
        dtcSeverity: null,
        immediateReplacement: null,
        mileageAtMeasurementKm: null,
        measuredAt: new Date('2026-05-25T00:00:00Z'),
        createdAt: new Date('2026-05-25T00:00:00Z'),
      },
    ]);

    const r = await svc.getSummary('v1');
    expect(r.overallCondition).toBe('CRITICAL');
    expect(r.openAlerts.some((a) => a.code === 'BRAKE_FLUID_WARNING' && a.severity === 'critical')).toBe(true);
  });

  it('DTC WARNING does not produce critical alert severity', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      ...baseCurrent,
      frontPadHealthPct: 80,
      frontDiscHealthPct: 85,
      rearPadHealthPct: 80,
      rearDiscHealthPct: 85,
      frontPadRemainingKm: 12000,
      frontDiscRemainingKm: 20000,
      rearPadRemainingKm: 12000,
      rearDiscRemainingKm: 20000,
    });
    mockPrisma.vehicleServiceEvent.findFirst.mockResolvedValueOnce(null);
    mockBrakeEvidence.listRecent.mockResolvedValueOnce([
      {
        id: 'e3',
        vehicleId: 'v1',
        source: 'DTC_SIGNAL',
        axle: 'UNKNOWN',
        measuredPadMm: null,
        measuredDiscMm: null,
        discCondition: null,
        brakeFluidStatus: null,
        dtcSeverity: 'WARNING',
        immediateReplacement: null,
        mileageAtMeasurementKm: null,
        measuredAt: new Date('2026-05-26T00:00:00Z'),
        createdAt: new Date('2026-05-26T00:00:00Z'),
      },
    ]);

    const r = await svc.getSummary('v1');
    const dtcAlert = r.openAlerts.find((a) => a.code === 'BRAKE_SYSTEM_DTC');
    expect(dtcAlert).toBeDefined();
    expect(dtcAlert?.severity).toBe('warning');
    expect(r.overallCondition).not.toBe('CRITICAL');
  });

  it('DTC CRITICAL produces critical alert severity and condition', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      ...baseCurrent,
      frontPadHealthPct: 80,
      frontDiscHealthPct: 85,
      rearPadHealthPct: 80,
      rearDiscHealthPct: 85,
      frontPadRemainingKm: 12000,
      frontDiscRemainingKm: 20000,
      rearPadRemainingKm: 12000,
      rearDiscRemainingKm: 20000,
    });
    mockPrisma.vehicleServiceEvent.findFirst.mockResolvedValueOnce(null);
    mockBrakeEvidence.listRecent.mockResolvedValueOnce([
      {
        id: 'e4',
        vehicleId: 'v1',
        source: 'DTC_SIGNAL',
        axle: 'UNKNOWN',
        measuredPadMm: null,
        measuredDiscMm: null,
        discCondition: null,
        brakeFluidStatus: null,
        dtcSeverity: 'CRITICAL',
        immediateReplacement: null,
        mileageAtMeasurementKm: null,
        measuredAt: new Date('2026-05-27T00:00:00Z'),
        createdAt: new Date('2026-05-27T00:00:00Z'),
      },
    ]);

    const r = await svc.getSummary('v1');
    const dtcAlert = r.openAlerts.find((a) => a.code === 'BRAKE_SYSTEM_DTC');
    expect(dtcAlert?.severity).toBe('critical');
    expect(r.overallCondition).toBe('CRITICAL');
  });

  it('legacy pad percents do not override canonical overallCondition', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      ...baseCurrent,
      padsHealthPct: 5,
      discsHealthPct: 5,
      frontPadHealthPct: 5,
      frontDiscHealthPct: 5,
      rearPadHealthPct: 5,
      rearDiscHealthPct: 5,
      frontPadRemainingKm: 500,
      frontDiscRemainingKm: 500,
      rearPadRemainingKm: 500,
      rearDiscRemainingKm: 500,
    });
    mockPrisma.vehicleServiceEvent.findFirst.mockResolvedValueOnce(null);
    mockBrakeEvidence.listRecent.mockResolvedValueOnce([]);

    const r = await svc.getSummary('v1');
    expect(r.legacy.padsHealthPct).toBe(5);
    expect(r.overallCondition).toBe('WARNING');
    expect(r.legacy.status).not.toBe('critical');
  });
});

describe('recalculate temporal coverage', () => {
  it('uses per-trip modeled distance and applies rolling only to uncovered gap', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      vehicleId: 'v1',
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
    mockPrisma.vehicle.findUnique.mockResolvedValueOnce({
      fuelType: 'GASOLINE',
      brakeForceFrontPercent: null,
    });
    mockPrisma.vehicleLatestState.findUnique.mockResolvedValueOnce({ odometerKm: 11200 });
    mockPrisma.tripDrivingImpact.findMany.mockResolvedValueOnce([
      {
        tripId: 't1',
        distanceKm: 120,
        citySharePct: 70,
        highwaySharePct: 20,
        countryRoadSharePct: 10,
        hardBrakePer100Km: 5,
        fullBrakingPer100Km: 1,
        stopDensity: 1.4,
        highSpeedBrakeShare: 0.12,
        thermalBrakeStressScore: 45,
      },
      {
        tripId: 't2',
        distanceKm: 80,
        citySharePct: 40,
        highwaySharePct: 40,
        countryRoadSharePct: 20,
        hardBrakePer100Km: 3,
        fullBrakingPer100Km: 0.6,
        stopDensity: 0.9,
        highSpeedBrakeShare: 0.08,
        thermalBrakeStressScore: 35,
      },
    ]);
    mockDI.getVehicleImpactForBrake.mockResolvedValueOnce({
      citySharePct: 55,
      highwaySharePct: 30,
      countryRoadSharePct: 15,
      hardBrakePer100Km: 4,
      fullBrakingPer100Km: 0.8,
      stopDensity: 1.1,
      highSpeedBrakeShare: 0.1,
      thermalBrakeStressScore: 40,
      brakingStressScore: 58,
    });

    await svc.recalculate('v1');

    expect(mockPrisma.brakeHealthCurrent.update).toHaveBeenCalled();
    const updateArg = mockPrisma.brakeHealthCurrent.update.mock.calls.at(-1)?.[0];
    expect(updateArg.data.modeledDistanceKm).toBe(200);
    expect(updateArg.data.modelingSource).toBe('trip_impacts_plus_rolling_gap');
    expect(updateArg.data.modelCoverageRatio).toBeLessThan(0.2);
    expect(updateArg.data.distanceSinceAnchorKm).toBe(1200);
  });
});
