import {
  COORDINATE_ROUTE_EVIDENCE_STABILIZING,
  COORDINATE_ROUTE_UNAVAILABLE,
  isCoordinateStatusRetryable,
  resolveRouteEvidenceCoordinateStatus,
  shouldAttemptCoordinateResolution,
} from './physical-refuel-coordinate-retry.policy';
import { computeCoordinateEvidenceFingerprint } from './physical-refuel-coordinate-evidence.util';
import {
  computeRouteEvidenceFingerprint,
  hasRouteEvidenceChanged,
} from './physical-refuel-route-evidence.util';

describe('physical-refuel route evidence stabilization', () => {
  const observedAt = Date.parse('2026-09-02T00:00:00.000Z');
  const horizonMs = 2 * 60 * 60 * 1000;

  it('RE1 sparse route inside stabilization window → ROUTE_EVIDENCE_STABILIZING', () => {
    const result = resolveRouteEvidenceCoordinateStatus({
      selectorStatus: 'NO_DWELL_FOUND',
      eventObservedAtMs: observedAt,
      asOfMs: observedAt + 30 * 60_000,
      stabilizationHorizonMs: horizonMs,
      routeEvidenceStabilizationUntil: null,
    });
    expect(result.status).toBe(COORDINATE_ROUTE_EVIDENCE_STABILIZING);
    expect(result.stabilizationUntil).not.toBeNull();
  });

  it('RE2 route fingerprint changes when additional samples arrive', () => {
    const sparse = computeRouteEvidenceFingerprint([
      { timestamp: '2026-09-02T00:00:00.000Z', latitude: 51.3, longitude: 9.5 },
    ]);
    const richer = computeRouteEvidenceFingerprint([
      { timestamp: '2026-09-02T00:00:00.000Z', latitude: 51.3, longitude: 9.5 },
      { timestamp: '2026-09-02T00:05:00.000Z', latitude: 51.31, longitude: 9.51 },
    ]);
    expect(hasRouteEvidenceChanged(sparse, richer)).toBe(true);
  });

  it('RE3 after stabilization deadline → stable terminal status', () => {
    const result = resolveRouteEvidenceCoordinateStatus({
      selectorStatus: 'NO_DWELL_FOUND',
      eventObservedAtMs: observedAt,
      asOfMs: observedAt + horizonMs + 1,
      stabilizationHorizonMs: horizonMs,
      routeEvidenceStabilizationUntil: null,
    });
    expect(result.status).toBe('NO_DWELL_FOUND_FOR_STABLE_EVIDENCE');
    expect(result.stabilizationUntil).toBeNull();
  });

  it('RE4 terminal stable hold does not hot-loop when retry is not due', () => {
    expect(
      shouldAttemptCoordinateResolution({
        coordinateLatitude: null,
        coordinateLongitude: null,
        coordinateSource: null,
        coordinateSelectionStatus: 'NO_DWELL_FOUND_FOR_STABLE_EVIDENCE',
        nextCoordinateRetryAt: null,
        asOfMs: observedAt + horizonMs + 1,
      }),
    ).toBe(false);
  });

  it('RE5 event evidence fingerprint invalidation is independent of route fingerprint', () => {
    const base = {
      fuelLevelRiseStart: new Date(observedAt),
      startTime: new Date(observedAt),
      endTime: new Date(observedAt + 300_000),
      startLatitude: 51.3,
      startLongitude: 9.5,
      endLatitude: 51.3,
      endLongitude: 9.5,
    };
    const moved = { ...base, startLatitude: 51.4 };
    expect(
      computeCoordinateEvidenceFingerprint(base as never) !==
        computeCoordinateEvidenceFingerprint(moved as never),
    ).toBe(true);
  });

  it('RE6 ROUTE_UNAVAILABLE is retryable and distinct from ROUTE_EVIDENCE_STABILIZING', () => {
    expect(isCoordinateStatusRetryable(COORDINATE_ROUTE_UNAVAILABLE)).toBe(true);
    expect(isCoordinateStatusRetryable(COORDINATE_ROUTE_EVIDENCE_STABILIZING)).toBe(true);
    expect(COORDINATE_ROUTE_UNAVAILABLE).not.toBe(COORDINATE_ROUTE_EVIDENCE_STABILIZING);
  });
});
