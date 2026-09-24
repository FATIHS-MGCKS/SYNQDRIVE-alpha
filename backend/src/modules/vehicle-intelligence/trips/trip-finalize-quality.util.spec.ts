import {
  checkTripQuality,
  hasPersistedMeaningfulMovementForQuality,
} from './trip-evidence.helpers';
import {
  checkTripQualityLegacyMain,
  computePersistedRouteDisplacementM,
  resolveFinalizeEndTime,
  resolveLegacyFinalizeEndTime,
} from './trip-finalize-quality.util';

describe('resolveFinalizeEndTime — event-time movement extent', () => {
  const tripStart = new Date('2026-09-24T13:09:29.626Z');
  const staleLmm = new Date('2026-09-24T13:10:21.390Z');
  const latestWp = new Date('2026-09-24T13:12:17.168Z');

  it('uses max(LMM, latest waypoint) when both exist after start', () => {
    const resolved = resolveFinalizeEndTime({
      cusumSegmentEnd: null,
      lastMeaningfulMovementAt: staleLmm,
      latestWaypointRecordedAt: latestWp,
      possibleEndAt: null,
      tripStartTime: tripStart,
      fallbackNow: new Date('2026-09-24T13:15:00.000Z'),
    });
    expect(resolved.endTime.toISOString()).toBe(latestWp.toISOString());
    expect(resolved.source).toBe('last_waypoint');
    const durationMs = resolved.endTime.getTime() - tripStart.getTime();
    expect(durationMs).toBeGreaterThanOrEqual(60_000);
  });

  it('legacy chain prefers stale LMM over later waypoint (BASE repro anchor)', () => {
    const legacyEnd = resolveLegacyFinalizeEndTime({
      cusumSegmentEnd: null,
      lastMeaningfulMovementAt: staleLmm,
      latestWaypointRecordedAt: latestWp,
      possibleEndAt: null,
      tripStartTime: tripStart,
      fallbackNow: new Date('2026-09-24T13:15:00.000Z'),
    });
    expect(legacyEnd.toISOString()).toBe(staleLmm.toISOString());
    const legacyDurationMs = legacyEnd.getTime() - tripStart.getTime();
    expect(legacyDurationMs).toBeLessThan(60_000);
    expect(legacyDurationMs).toBeCloseTo(51_764, -2);
  });

  it('CUSUM segment end still wins over movement extent', () => {
    const cusumEnd = new Date('2026-09-24T13:11:00.000Z');
    const resolved = resolveFinalizeEndTime({
      cusumSegmentEnd: cusumEnd,
      lastMeaningfulMovementAt: staleLmm,
      latestWaypointRecordedAt: latestWp,
      possibleEndAt: null,
      tripStartTime: tripStart,
      fallbackNow: new Date(),
    });
    expect(resolved.endTime).toEqual(cusumEnd);
    expect(resolved.source).toBe('cusum_segment_end');
  });
});

describe('hasPersistedMeaningfulMovementForQuality', () => {
  it('requires >=3 waypoints OR >=2 with >=50m displacement', () => {
    expect(
      hasPersistedMeaningfulMovementForQuality({
        persistedWaypointCount: 15,
        routeDisplacementM: null,
      }),
    ).toBe(true);
    expect(
      hasPersistedMeaningfulMovementForQuality({
        persistedWaypointCount: 2,
        routeDisplacementM: 49,
      }),
    ).toBe(false);
    expect(
      hasPersistedMeaningfulMovementForQuality({
        persistedWaypointCount: 2,
        routeDisplacementM: 50,
      }),
    ).toBe(true);
    expect(
      hasPersistedMeaningfulMovementForQuality({
        persistedWaypointCount: 1,
        routeDisplacementM: 500,
      }),
    ).toBe(false);
  });
});

describe('checkTripQuality — short trip movement evidence', () => {
  const start = new Date('2026-09-24T13:09:29.626Z');

  it('control 1: <60s, distance null, no movement → too_short_no_distance', () => {
    const r = checkTripQuality(30_000, null, 0, null, start);
    expect(r.shouldDiscard).toBe(true);
    expect(r.reason).toBe('too_short_no_distance');
  });

  it('control 2: <60s, one waypoint, no displacement → still discarded', () => {
    const r = checkTripQuality(45_000, null, 1, null, start, {
      routeDisplacementM: 5,
    });
    expect(r.shouldDiscard).toBe(true);
    expect(r.reason).toBe('too_short_no_distance');
  });

  it('control 3: <60s with credible route movement (>=3 wp) → preserved', () => {
    const r = checkTripQuality(45_000, null, 15, null, start, {
      routeDisplacementM: null,
    });
    expect(r.shouldDiscard).toBe(false);
  });

  it('control 4: distance >= 0.1 km → preserved', () => {
    const r = checkTripQuality(30_000, 0.15, 0, null, start);
    expect(r.shouldDiscard).toBe(false);
  });

  it('control 5: no_meaningful_movement rule preserved', () => {
    const r = checkTripQuality(120_000, 0.05, 1, null, start);
    expect(r.shouldDiscard).toBe(true);
    expect(r.reason).toBe('no_meaningful_movement');
  });

  it('control 6: normal long trip unchanged', () => {
    const r = checkTripQuality(600_000, 8.5, 5, null, start);
    expect(r.shouldDiscard).toBe(false);
    expect(r.shouldMergeWithPrevious).toBe(false);
  });
});

describe('KS FH 660E post-split Trip 2 — BASE vs HEAD quality repro', () => {
  const tripStart = new Date('2026-09-24T13:09:29.626Z');
  const staleLmm = new Date('2026-09-24T13:10:21.390Z');
  const latestWp = new Date('2026-09-24T13:12:17.168Z');
  const waypointCount = 15;
  const distanceKm = null;

  function evaluateHeadFinalizeQuality() {
    const resolved = resolveFinalizeEndTime({
      cusumSegmentEnd: null,
      lastMeaningfulMovementAt: staleLmm,
      latestWaypointRecordedAt: latestWp,
      possibleEndAt: null,
      tripStartTime: tripStart,
      fallbackNow: new Date('2026-09-24T13:15:00.000Z'),
    });
    const durationMs = resolved.endTime.getTime() - tripStart.getTime();
    const displacement = computePersistedRouteDisplacementM(
      { latitude: 50.937, longitude: 6.96 },
      { latitude: 50.939, longitude: 6.965 },
    );
    return checkTripQuality(
      durationMs,
      distanceKm,
      waypointCount,
      null,
      tripStart,
      { routeDisplacementM: displacement },
    );
  }

  function evaluateBaseFinalizeQuality() {
    const legacyEnd = resolveLegacyFinalizeEndTime({
      cusumSegmentEnd: null,
      lastMeaningfulMovementAt: staleLmm,
      latestWaypointRecordedAt: latestWp,
      possibleEndAt: null,
      tripStartTime: tripStart,
      fallbackNow: new Date('2026-09-24T13:15:00.000Z'),
    });
    const durationMs = legacyEnd.getTime() - tripStart.getTime();
    return checkTripQualityLegacyMain(
      durationMs,
      distanceKm,
      waypointCount,
      null,
      tripStart,
    );
  }

  it('BASE discards; HEAD keeps (mandatory RED/GREEN contract)', () => {
    const base = evaluateBaseFinalizeQuality();
    const head = evaluateHeadFinalizeQuality();

    const REAL_SHORT_TRIP_DISCARDED_BASE = base.shouldDiscard;
    const REAL_SHORT_TRIP_DISCARDED_HEAD = head.shouldDiscard;
    const HEAD_TRIP_STATUS = head.shouldDiscard ? 'CANCELLED' : 'COMPLETED';

    expect(REAL_SHORT_TRIP_DISCARDED_BASE).toBe(true);
    expect(base.reason).toBe('too_short_no_distance');
    expect(REAL_SHORT_TRIP_DISCARDED_HEAD).toBe(false);
    expect(HEAD_TRIP_STATUS).toBe('COMPLETED');
  });
});
