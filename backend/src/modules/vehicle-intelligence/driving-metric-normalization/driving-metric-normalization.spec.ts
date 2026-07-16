import { DRIVING_METRIC_NORMALIZATION_CONFIG as CFG } from './driving-metric-normalization.config';
import {
  normalizeAffectedTripShare,
  normalizeClustersPerTimeWindow,
  normalizeDistanceShare,
  normalizeDurationShare,
  normalizeEnergyPerKm,
  normalizeEventShare,
  normalizeEventsPer100Km,
  normalizeEventsPerDrivingHour,
  normalizeStopDensityPerKm,
  resolveTripDurationHours,
} from './driving-metric-normalization';
import { buildDrivingImpactNormalizedTripMetrics } from './driving-impact-metrics.normalizer';

describe('driving-metric-normalization', () => {
  describe('normalizeEventsPer100Km', () => {
    it('normalizes long trips reliably', () => {
      const result = normalizeEventsPer100Km(10, { distanceKm: 50, durationHours: 1 });
      expect(result.value).toBe(20);
      expect(result.reliability).toBe('RELIABLE');
      expect(result.strategy).toBe('EVENTS_PER_100KM');
    });

    it('marks short trips LIMITED without inflating', () => {
      const result = normalizeEventsPer100Km(4, { distanceKm: 3, durationHours: 0.1 });
      expect(result.value).toBeCloseTo(133.33, 2);
      expect(result.reliability).toBe('LIMITED');
      expect(result.reasonCodes).toContain('SHORT_TRIP_DISTANCE');
    });

    it('returns null for zero distance — no artificial scaling', () => {
      const result = normalizeEventsPer100Km(5, { distanceKm: 0, durationHours: 0.5 });
      expect(result.value).toBeNull();
      expect(result.reliability).toBe('UNRELIABLE');
      expect(result.reasonCodes).toContain('ZERO_DISTANCE');
    });

    it('returns null below minimum reliable distance', () => {
      const result = normalizeEventsPer100Km(2, { distanceKm: 1.5, durationHours: 0.2 });
      expect(result.value).toBeNull();
      expect(result.reliability).toBe('UNRELIABLE');
      expect(result.reasonCodes).toContain('BELOW_MIN_DISTANCE');
    });

    it('applies versioned cap for extreme outliers', () => {
      const result = normalizeEventsPer100Km(500, { distanceKm: 10, durationHours: 1 });
      expect(result.value).toBe(CFG.CAPS.eventsPer100Km);
      expect(result.capped).toBe(true);
      expect(result.reasonCodes).toContain('CAPPED');
    });
  });

  describe('normalizeEventsPerDrivingHour', () => {
    it('requires duration context', () => {
      const result = normalizeEventsPerDrivingHour(6, { distanceKm: 40, durationHours: null });
      expect(result.value).toBeNull();
      expect(result.reasonCodes).toContain('ZERO_DURATION');
    });

    it('normalizes per driving hour on long trips', () => {
      const result = normalizeEventsPerDrivingHour(12, { distanceKm: 120, durationHours: 2 });
      expect(result.value).toBe(6);
      expect(result.reliability).toBe('RELIABLE');
    });
  });

  describe('normalizeDistanceShare', () => {
    it('returns null for zero total distance', () => {
      const result = normalizeDistanceShare(10, 0);
      expect(result.value).toBeNull();
      expect(result.reasonCodes).toContain('ZERO_DISTANCE');
    });
  });

  describe('normalizeEventShare', () => {
    it('returns 0 share when no braking events', () => {
      const result = normalizeEventShare(0, 0, false);
      expect(result.value).toBe(0);
      expect(result.reasonCodes).toContain('NO_EVENTS');
    });
  });

  describe('normalizeAffectedTripShare', () => {
    it('computes affected trip percentage', () => {
      const result = normalizeAffectedTripShare(3, 10);
      expect(result.value).toBe(30);
      expect(result.strategy).toBe('AFFECTED_TRIP_SHARE');
    });
  });

  describe('normalizeClustersPerTimeWindow', () => {
    it('computes clusters per hour', () => {
      const result = normalizeClustersPerTimeWindow(6, 2);
      expect(result.value).toBe(3);
      expect(result.strategy).toBe('CLUSTERS_PER_TIME_WINDOW');
    });
  });

  describe('normalizeDurationShare', () => {
    it('computes duration share percentage', () => {
      const result = normalizeDurationShare(900, 3600);
      expect(result.value).toBe(25);
      expect(result.strategy).toBe('DURATION_SHARE');
    });
  });

  describe('resolveTripDurationHours', () => {
    it('resolves duration from timestamps', () => {
      const start = new Date('2026-03-01T08:00:00Z');
      const end = new Date('2026-03-01T10:30:00Z');
      expect(resolveTripDurationHours(start, end)).toBe(2.5);
    });
  });
});

describe('driving-impact-metrics.normalizer', () => {
  it('builds flat rates for a long trip', () => {
    const start = new Date('2026-03-01T08:00:00Z');
    const end = new Date('2026-03-01T10:00:00Z');
    const metrics = buildDrivingImpactNormalizedTripMetrics({
      distanceKm: 100,
      tripStartedAt: start,
      tripEndedAt: end,
      counts: {
        hardAccel: 8,
        extremeAccel: 2,
        hardBrake: 10,
        extremeBrake: 1,
        fullBraking: 2,
        kickdown: 3,
        launchLike: 1,
        brakesTotal: 20,
        stopCount: 15,
        highSpeedBrakeCount: 4,
        totalBrakingRows: 8,
      },
      usageSplit: {
        citySharePct: 30,
        highwaySharePct: 50,
        countryRoadSharePct: 20,
      },
      brakeEnergy: {
        measuredEnergyTotal: 120,
        proxyEnergyTotal: 40,
      },
    });

    expect(metrics.flat.hardAccelPer100Km).toBe(8);
    expect(metrics.flat.brakesPer100Km).toBe(20);
    expect(metrics.flat.stopDensity).toBe(0.15);
    expect(metrics.flat.highSpeedBrakeShare).toBe(0.5);
    expect(metrics.eventsPerDrivingHour.hardBrake.value).toBe(5);
    expect(metrics.context.distanceReliability).toBe('RELIABLE');
  });

  it('applies minimum-data rules for short trips', () => {
    const start = new Date('2026-03-01T08:00:00Z');
    const end = new Date('2026-03-01T08:12:00Z');
    const metrics = buildDrivingImpactNormalizedTripMetrics({
      distanceKm: 3,
      tripStartedAt: start,
      tripEndedAt: end,
      counts: {
        hardAccel: 2,
        extremeAccel: 0,
        hardBrake: 1,
        extremeBrake: 0,
        fullBraking: 0,
        kickdown: 0,
        launchLike: 0,
        brakesTotal: 1,
        stopCount: 1,
        highSpeedBrakeCount: 0,
        totalBrakingRows: 1,
      },
      usageSplit: {
        citySharePct: 100,
        highwaySharePct: 0,
        countryRoadSharePct: 0,
      },
      brakeEnergy: {
        measuredEnergyTotal: 0,
        proxyEnergyTotal: 0,
      },
    });

    expect(metrics.eventsPer100Km.hardAccel.reliability).toBe('LIMITED');
    expect(metrics.eventsPer100Km.hardAccel.reasonCodes).toContain('SHORT_TRIP_DISTANCE');
    expect(metrics.eventsPerDrivingHour.hardBrake.reliability).toBe('LIMITED');
    expect(metrics.eventsPerDrivingHour.hardBrake.reasonCodes).toContain('SHORT_TRIP_DURATION');
    expect(metrics.flat.hardAccelPer100Km).toBeCloseTo(66.67, 2);
  });
});
