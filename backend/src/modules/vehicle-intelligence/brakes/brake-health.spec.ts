import { BrakeHealthService } from './brake-health.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';

const cfg = BRAKE_HEALTH_CONFIG;

const mockPrisma = {
  brakeHealthCurrent: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  vehicleBrakeReferenceSpec: { findMany: jest.fn().mockResolvedValue([]) },
  vehicleServiceEvent: { findMany: jest.fn().mockResolvedValue([]) },
  vehicle: { findUnique: jest.fn().mockResolvedValue({ fuelType: 'GASOLINE', brakeForceFrontPercent: null, organizationId: null }) },
  vehicleLatestState: { findUnique: jest.fn().mockResolvedValue({ odometerKm: 50000 }) },
} as any;

const mockDI = {
  getVehicleImpactForBrake: jest.fn().mockResolvedValue(null),
} as any;

const svc = new BrakeHealthService(mockPrisma, mockDI);

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
  it('returns awaiting_service_anchor when no current record', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce(null);
    const r = await svc.getSummary('v1');
    expect(r.isInitialized).toBe(false);
    expect(r.status).toBe('awaiting_service_anchor');
    expect(r.actions?.canAddBrakeService).toBe(true);
  });

  it('returns awaiting_service_anchor when isInitialized is false', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({ isInitialized: false });
    const r = await svc.getSummary('v1');
    expect(r.isInitialized).toBe(false);
  });

  it('returns initialized summary with pads and discs', async () => {
    mockPrisma.brakeHealthCurrent.findUnique.mockResolvedValueOnce({
      isInitialized: true,
      padsHealthPct: 72,
      padsRemainingKm: 28000,
      discsHealthPct: 88,
      discsRemainingKm: 55000,
      anchorServiceDate: new Date('2024-06-01'),
      confidenceScore: 62,
      confidenceLabel: 'Medium',
      hasAlert: false,
    });
    const r = await svc.getSummary('v1');
    expect(r.isInitialized).toBe(true);
    expect(r.pads?.healthPercent).toBe(72);
    expect(r.discs?.healthPercent).toBe(88);
    expect(r.confidence?.label).toBe('Medium');
    expect(r.hasAlert).toBe(false);
  });
});
