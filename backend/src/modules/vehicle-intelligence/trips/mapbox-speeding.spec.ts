/**
 * SynqDrive Speeding Sections Analysis — Unit Tests
 *
 * Coverage:
 *   - Overspeed point detection (Mapbox limits, fallback limits, tolerance)
 *   - Section building from consecutive overspeed points
 *   - Hysteresis: short gaps don't split sections
 *   - Large gaps split sections correctly
 *   - Section distance / duration calculations
 *   - Severity classification
 *   - Summary derivation from sections
 *   - No hardcoded 130 km/h logic in detection
 *   - Legacy compat fields
 */

import { MapboxService, type RoutePointFull, type MapMatchedLeg } from './mapbox.service';

function makeService(): MapboxService {
  return new MapboxService();
}

function pt(
  lat: number, lon: number, speedKmh: number | null, ts: string,
): RoutePointFull {
  return { latitude: lat, longitude: lon, speedKmh, timestamp: ts };
}

function leg(speedLimit: number | null, distance = 100): MapMatchedLeg {
  return { distance, duration: 10, roadClass: 'motorway', speedLimit, geometry: [] };
}

function ts(seconds: number): string {
  return new Date(Date.UTC(2025, 0, 1, 12, 0, seconds)).toISOString();
}

describe('MapboxService — Speeding Sections', () => {
  const svc = makeService();

  // ── Overspeed Point Detection ─────────────────────────────────────────

  describe('detectOverspeedPoints', () => {
    it('detects overspeed with Mapbox limit and 5% tolerance', () => {
      const legs = [leg(100)];
      const points = [pt(50, 10, 106, ts(0))]; // 106 > 100 * 1.05 = 105
      const flags = svc.detectOverspeedPoints(legs, points);
      expect(flags[0]).not.toBeNull();
      expect(flags[0]!.overByKmh).toBeCloseTo(6, 0);
      expect(flags[0]!.limitSource).toBe('mapbox');
    });

    it('does not flag speed exactly at tolerance', () => {
      const legs = [leg(100)];
      const points = [pt(50, 10, 105, ts(0))]; // 105 <= 100 * 1.05
      const flags = svc.detectOverspeedPoints(legs, points);
      expect(flags[0]).toBeNull();
    });

    it('uses fallback limit when Mapbox limit is null', () => {
      const legs = [leg(null)];
      const points = [pt(50, 10, 90, ts(0))]; // speed 90 → fallback limit 100 → 90 < 105 → no
      const flags = svc.detectOverspeedPoints(legs, points);
      expect(flags[0]).toBeNull();
    });

    it('detects overspeed with fallback limit for city speeds', () => {
      const legs = [leg(null)];
      const points = [pt(50, 10, 54, ts(0))]; // speed 54 → fallback 50 → 54 > 52.5 = yes
      const flags = svc.detectOverspeedPoints(legs, points);
      expect(flags[0]).not.toBeNull();
      expect(flags[0]!.limitSource).toBe('fallback');
      expect(flags[0]!.speedLimitKmh).toBe(50);
    });

    it('assigns per-leg limits, not global average', () => {
      const legs = [leg(50), leg(130)]; // city then highway
      // 2 legs = 3 sampled coords → 3 points with step=1
      const points = [
        pt(50, 10, 70, ts(0)),   // leg[0] → limit 50 → 70 > 52.5 → overspeed
        pt(50, 10, 70, ts(7)),   // leg[1] → limit 130 → 70 < 136.5 → no
        pt(50, 10, 70, ts(14)),  // leg[1] → limit 130 → no
      ];
      const flags = svc.detectOverspeedPoints(legs, points);
      expect(flags[0]).not.toBeNull();
      expect(flags[0]!.speedLimitKmh).toBe(50);
      expect(flags[1]).toBeNull();
      expect(flags[2]).toBeNull();
    });

    it('skips points with null speed', () => {
      const legs = [leg(100)];
      const points = [pt(50, 10, null, ts(0))];
      const flags = svc.detectOverspeedPoints(legs, points);
      expect(flags[0]).toBeNull();
    });
  });

  // ── Section Building ──────────────────────────────────────────────────

  describe('buildSections (via analyzeSpeedingSections)', () => {
    it('creates one section from consecutive overspeed points', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 110, ts(0)),
        pt(50.001, 10, 112, ts(7)),
        pt(50.002, 10, 108, ts(14)),
        pt(50.003, 10, 50, ts(21)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(1);
      expect(result.sections[0].pointCount).toBe(3);
    });

    it('creates two sections when separated by a large gap', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 115, ts(0)),
        pt(50, 10, 115, ts(7)),
        pt(50, 10, 50, ts(14)),
        pt(50, 10, 50, ts(21)),
        pt(50, 10, 50, ts(28)),
        pt(50, 10, 50, ts(35)),
        pt(50, 10, 120, ts(42)),
        pt(50, 10, 118, ts(49)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(2);
    });

    it('keeps section together through short 1-point gap (hysteresis)', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 115, ts(0)),
        pt(50, 10, 104, ts(5)), // briefly below → gap of 1
        pt(50, 10, 115, ts(10)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(1);
      expect(result.sections[0].pointCount).toBe(2); // 2 actual overspeed points
    });

    it('keeps section together through 2-point gap (hysteresis limit)', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 115, ts(0)),
        pt(50, 10, 100, ts(3)),  // gap point 1
        pt(50, 10, 100, ts(6)),  // gap point 2
        pt(50, 10, 115, ts(9)),  // resumes within tolerance
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(1);
    });

    it('splits on 3-point gap (exceeds hysteresis)', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 115, ts(0)),
        pt(50, 10, 100, ts(7)),
        pt(50, 10, 100, ts(14)),
        pt(50, 10, 100, ts(21)),
        pt(50, 10, 115, ts(28)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(2);
    });

    it('returns empty sections for no overspeeding', () => {
      const legs = [leg(130)];
      const points = [
        pt(50, 10, 60, ts(0)),
        pt(50, 10, 80, ts(7)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(0);
      expect(result.sections).toEqual([]);
    });
  });

  // ── Section Metrics ───────────────────────────────────────────────────

  describe('section metrics', () => {
    it('computes duration from timestamps', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 115, ts(0)),
        pt(50, 10, 120, ts(10)),
        pt(50, 10, 110, ts(20)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].durationSeconds).toBe(20);
    });

    it('computes max and avg overspeed', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 110, ts(0)),  // over by 10
        pt(50, 10, 130, ts(7)),  // over by 30
        pt(50, 10, 120, ts(14)), // over by 20
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].maxOverSpeedKmh).toBe(30);
      expect(result.sections[0].avgOverSpeedKmh).toBe(20);
      expect(result.sections[0].maxSpeedKmh).toBe(130);
    });

    it('tracks Mapbox vs fallback limit sources', () => {
      const legs = [leg(100), leg(null)];
      const points = [
        pt(50, 10, 115, ts(0)),  // leg[0] = mapbox
        pt(50, 10, 115, ts(7)),  // leg[1] = fallback (limit null → defaultLimit(115) = 100 → 115>105 → over)
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].mapboxLimitPointCount).toBe(1);
      expect(result.sections[0].fallbackLimitPointCount).toBe(1);
      expect(result.sections[0].primaryLimitSource).toBe('mixed');
    });

    it('includes coordinates for map rendering', () => {
      const legs = [leg(100)];
      const points = [
        pt(50.1, 10.1, 115, ts(0)),
        pt(50.2, 10.2, 115, ts(7)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].coordinates).toEqual([[10.1, 50.1], [10.2, 50.2]]);
    });
  });

  // ── Severity Classification ───────────────────────────────────────────

  describe('severity classification', () => {
    it('classifies low severity for minor exceedance', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 108, ts(0)),
        pt(50, 10, 109, ts(7)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].severity).toBe('low');
    });

    it('classifies moderate for avgOver >= 10', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 112, ts(0)),
        pt(50, 10, 115, ts(7)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].severity).toBe('moderate');
    });

    it('classifies high for avgOver >= 20', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 122, ts(0)),
        pt(50, 10, 125, ts(7)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].severity).toBe('high');
    });

    it('classifies severe for avgOver >= 30', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 132, ts(0)),
        pt(50, 10, 135, ts(7)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].severity).toBe('severe');
    });

    it('classifies severe for maxOver >= 50 even with low avg', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 155, ts(0)), // over by 55
        pt(50, 10, 108, ts(7)), // over by 8 → avg ~31.5
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.sections[0].severity).toBe('severe');
    });
  });

  // ── Summary Derivation ────────────────────────────────────────────────

  describe('summary metrics', () => {
    it('computes total speeding distance and duration', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 115, ts(0)),
        pt(50.001, 10, 115, ts(10)),
        pt(50, 10, 50, ts(20)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(1);
      expect(result.speedingDurationSeconds).toBe(10);
      expect(result.speedingDistanceMeters).toBeGreaterThan(0);
    });

    it('computes speeding exposure percent (distance-based)', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 115, ts(0)),
        pt(50.001, 10, 115, ts(7)),
        pt(50.002, 10, 50, ts(14)),
        pt(50.003, 10, 50, ts(21)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingExposurePercent).toBeGreaterThan(0);
      expect(result.speedingExposurePercent).toBeLessThanOrEqual(100);
    });

    it('provides legacy compat fields', () => {
      const legs = [leg(100)];
      const points = [
        pt(50, 10, 115, ts(0)),
        pt(50, 10, 115, ts(7)),
        pt(50, 10, 50, ts(14)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingPercent).toBeGreaterThan(0);
      expect(typeof result.speedingSegments).toBe('number');
    });

    it('returns zero summary for no speeding', () => {
      const legs = [leg(130)];
      const points = [
        pt(50, 10, 60, ts(0)),
        pt(50, 10, 80, ts(7)),
      ];
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(0);
      expect(result.speedingDistanceMeters).toBe(0);
      expect(result.speedingDurationSeconds).toBe(0);
      expect(result.maxOverSpeedKmh).toBe(0);
      expect(result.speedingExposurePercent).toBe(0);
    });
  });

  // ── No Hardcoded 130 ─────────────────────────────────────────────────

  describe('no hardcoded 130 km/h threshold', () => {
    it('detects speeding at 55 in a 50 zone with Mapbox limit', () => {
      const legs = [leg(50)];
      const points = [pt(50, 10, 55, ts(0))]; // 55 > 50 * 1.05 = 52.5
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(1);
    });

    it('does not flag 120 km/h on a 130 limit road', () => {
      const legs = [leg(130)];
      const points = [pt(50, 10, 120, ts(0))]; // 120 < 130 * 1.05 = 136.5
      const result = svc.analyzeSpeedingSections(legs, points);
      expect(result.speedingSectionCount).toBe(0);
    });
  });

  // ── Haversine ─────────────────────────────────────────────────────────

  describe('haversineM', () => {
    it('returns ~111km for 1 degree latitude', () => {
      const d = MapboxService.haversineM(50, 10, 51, 10);
      expect(d).toBeGreaterThan(110000);
      expect(d).toBeLessThan(112000);
    });

    it('returns 0 for same point', () => {
      expect(MapboxService.haversineM(50, 10, 50, 10)).toBe(0);
    });
  });
});
