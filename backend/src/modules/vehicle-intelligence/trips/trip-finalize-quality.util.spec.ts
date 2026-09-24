import { VehicleDetectionProfile } from '@prisma/client';

import {
  checkTripQuality,
  hasPersistedMeaningfulMovementForQuality,
} from './trip-evidence.helpers';
import {
  analyzePersistedRouteMovement,
  checkTripQualityLegacyMain,
  FINALIZE_END_AUTHORITY_ORDER,
  type PersistedRouteWaypointForMovement,
  resolveFinalizeEndTime,
  resolveLegacyFinalizeEndTime,
  resolvePr1750UnsafeFinalizeEndTime,
} from './trip-finalize-quality.util';

const TRIP_START = new Date('2026-09-24T13:09:29.626Z');
const STALE_LMM = new Date('2026-09-24T13:10:21.390Z');
const PHYSICAL_STOP = new Date('2026-09-24T13:11:00.000Z');
const STATIONARY_TAIL = new Date('2026-09-24T13:12:30.000Z');

function wp(
  iso: string,
  lat: number,
  lon: number,
  speedKmh: number | null,
): PersistedRouteWaypointForMovement {
  return {
    recordedAt: new Date(iso),
    latitude: lat,
    longitude: lon,
    speedKmh,
  };
}

/** Production-style: real motion until ~13:11, then stationary provider tail. */
function productionReproWaypoints(): PersistedRouteWaypointForMovement[] {
  const moving: PersistedRouteWaypointForMovement[] = [
    wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 25),
    wp('2026-09-24T13:09:50.000Z', 50.9375, 6.961, 30),
    wp('2026-09-24T13:10:05.000Z', 50.938, 6.962, 28),
    wp('2026-09-24T13:10:21.390Z', 50.9385, 6.963, 22),
    wp('2026-09-24T13:10:40.000Z', 50.939, 6.964, 18),
    wp('2026-09-24T13:11:00.000Z', 50.9395, 6.965, 8),
  ];
  const tail: PersistedRouteWaypointForMovement[] = [];
  for (let i = 0; i < 9; i++) {
    tail.push(
      wp(
        new Date(STATIONARY_TAIL.getTime() - (8 - i) * 10_000).toISOString(),
        50.9395 + i * 0.00001,
        6.965 + i * 0.00001,
        0,
      ),
    );
  }
  return [...moving, ...tail];
}

function evaluateFinalizeQuality(params: {
  waypoints: PersistedRouteWaypointForMovement[];
  profile: string;
  lmm: Date;
  cusumEnd?: Date | null;
  useUnsafePr1750End?: boolean;
}) {
  const routeMovement = analyzePersistedRouteMovement(
    params.waypoints,
    params.profile,
  );
  const resolved = params.useUnsafePr1750End
    ? resolvePr1750UnsafeFinalizeEndTime({
        cusumSegmentEnd: params.cusumEnd ?? null,
        lastMeaningfulMovementAt: params.lmm,
        latestWaypointRecordedAt:
          params.waypoints[params.waypoints.length - 1]?.recordedAt ?? null,
        possibleEndAt: null,
        tripStartTime: TRIP_START,
        fallbackNow: new Date('2026-09-24T13:15:00.000Z'),
      })
    : resolveFinalizeEndTime({
        cusumSegmentEnd: params.cusumEnd ?? null,
        lastMeaningfulMovementAt: params.lmm,
        latestCredibleMovementAt: routeMovement.latestCredibleMovementAt,
        possibleEndAt: null,
        tripStartTime: TRIP_START,
        fallbackNow: new Date('2026-09-24T13:15:00.000Z'),
      });

  const durationMs = resolved.endTime.getTime() - TRIP_START.getTime();
  const quality = checkTripQuality(
    durationMs,
    null,
    params.waypoints.length,
    null,
    TRIP_START,
    {
      hasMeaningfulPersistedRouteMovement: routeMovement.hasMeaningfulMovement,
      movementAuthority: routeMovement.movementAuthority,
      cumulativeRouteMovementM: routeMovement.cumulativeRouteMovementM,
    },
  );

  return { routeMovement, resolved, durationMs, quality };
}

describe('FINALIZE_END_AUTHORITY_ORDER contract', () => {
  it('documents canonical end authority order', () => {
    expect(FINALIZE_END_AUTHORITY_ORDER).toContain('cusum_segment_end');
    expect(FINALIZE_END_AUTHORITY_ORDER).toContain(
      'latest_credible_route_movement_at',
    );
  });
});

describe('analyzePersistedRouteMovement — route motion authority', () => {
  it('uses findEarliestRouteActivityAt thresholds (speedMotionKmh + 25 m segment)', () => {
    const jitter = [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 0),
      wp('2026-09-24T13:09:40.000Z', 50.93701, 6.96001, 0),
      wp('2026-09-24T13:09:45.000Z', 50.93702, 6.96002, 0),
    ];
    const analysis = analyzePersistedRouteMovement(jitter, 'ICE');
    expect(analysis.hasMeaningfulMovement).toBe(false);
    expect(analysis.motionWaypointCount).toBe(0);
  });

  it('loop return: cumulative path ≥50 m with small net displacement', () => {
    const loop = [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 20),
      wp('2026-09-24T13:09:50.000Z', 50.939, 6.96, 22),
      wp('2026-09-24T13:10:05.000Z', 50.939, 6.963, 20),
      wp('2026-09-24T13:10:20.000Z', 50.937, 6.963, 18),
      wp('2026-09-24T13:10:35.000Z', 50.937, 6.96, 0),
    ];
    const analysis = analyzePersistedRouteMovement(loop, 'ICE');
    expect(analysis.netDisplacementM).not.toBeNull();
    expect(analysis.netDisplacementM!).toBeLessThan(30);
    expect(analysis.cumulativeRouteMovementM).toBeGreaterThanOrEqual(50);
    expect(analysis.hasMeaningfulMovement).toBe(true);
  });

  it('two-waypoint real movement with speed + segment progression', () => {
    const two = [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 15),
      wp('2026-09-24T13:09:55.000Z', 50.938, 6.962, 18),
    ];
    const analysis = analyzePersistedRouteMovement(two, 'ICE');
    expect(analysis.hasMeaningfulMovement).toBe(true);
    expect(analysis.motionWaypointCount).toBe(2);
    expect(analysis.movementAuthority).toBe('route_speed_motion');
  });
});

describe('mandatory test matrix — quality vs canonical end decoupling', () => {
  const reproWps = productionReproWaypoints();

  it('1 PRODUCTION REPRO — kept with LMM-duration; canonical end uses last credible motion', () => {
    const routeMovement = analyzePersistedRouteMovement(reproWps, 'ICE');
    const decoupledQuality = checkTripQuality(
      STALE_LMM.getTime() - TRIP_START.getTime(),
      null,
      reproWps.length,
      null,
      TRIP_START,
      {
        hasMeaningfulPersistedRouteMovement: routeMovement.hasMeaningfulMovement,
        movementAuthority: routeMovement.movementAuthority,
        cumulativeRouteMovementM: routeMovement.cumulativeRouteMovementM,
      },
    );
    expect(decoupledQuality.shouldDiscard).toBe(false);

    const { resolved } = evaluateFinalizeQuality({
      waypoints: reproWps,
      profile: 'ICE',
      lmm: STALE_LMM,
    });
    expect(resolved.endTime.toISOString()).toBe(PHYSICAL_STOP.toISOString());
    expect(resolved.source).toBe('persisted_route_movement');
  });

  it('2 STATIONARY TAIL — canonical end does not follow latest waypoint', () => {
    const { resolved } = evaluateFinalizeQuality({
      waypoints: reproWps,
      profile: 'ICE',
      lmm: STALE_LMM,
    });
    const latest = reproWps[reproWps.length - 1]!.recordedAt;
    expect(latest.getTime()).toBeGreaterThan(PHYSICAL_STOP.getTime());
    expect(resolved.endTime.getTime()).toBeLessThan(latest.getTime());
    expect(resolved.endTime.toISOString()).toBe(PHYSICAL_STOP.toISOString());
  });

  it('3 GPS JITTER — >=3 waypoints without motion remain discardable', () => {
    const jitter = [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 0),
      wp('2026-09-24T13:09:40.000Z', 50.93701, 6.96001, 0),
      wp('2026-09-24T13:09:45.000Z', 50.93702, 6.96002, 0),
    ];
    const analysis = analyzePersistedRouteMovement(jitter, 'ICE');
    const quality = checkTripQuality(45_000, null, 3, null, TRIP_START, {
      hasMeaningfulPersistedRouteMovement: analysis.hasMeaningfulMovement,
    });
    expect(analysis.hasMeaningfulMovement).toBe(false);
    expect(quality.shouldDiscard).toBe(true);
    expect(quality.reason).toBe('too_short_no_distance');
  });

  it('4 REAL SHORT DRIVE — motion preserved under 60s', () => {
    const short = [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 25),
      wp('2026-09-24T13:09:50.000Z', 50.938, 6.962, 28),
      wp('2026-09-24T13:10:05.000Z', 50.939, 6.964, 20),
    ];
    const { quality } = evaluateFinalizeQuality({
      waypoints: short,
      profile: 'ICE',
      lmm: new Date('2026-09-24T13:10:05.000Z'),
    });
    expect(quality.shouldDiscard).toBe(false);
  });

  it('7 CUSUM PRIORITY — route evidence cannot override CUSUM end', () => {
    const cusumEnd = new Date('2026-09-24T13:10:50.000Z');
    const { resolved } = evaluateFinalizeQuality({
      waypoints: reproWps,
      profile: 'ICE',
      lmm: STALE_LMM,
      cusumEnd,
    });
    expect(resolved.endTime).toEqual(cusumEnd);
    expect(resolved.source).toBe('cusum_segment_end');
  });

  it('8 EV profile — production-style repro passes', () => {
    const { quality } = evaluateFinalizeQuality({
      waypoints: reproWps,
      profile: VehicleDetectionProfile.EV,
      lmm: STALE_LMM,
    });
    expect(quality.shouldDiscard).toBe(false);
  });

  it('9 ICE profile — production-style repro passes', () => {
    const { quality } = evaluateFinalizeQuality({
      waypoints: reproWps,
      profile: VehicleDetectionProfile.ICE,
      lmm: STALE_LMM,
    });
    expect(quality.shouldDiscard).toBe(false);
  });

  it('10 NO-MOVEMENT FALSE START — still cancelled', () => {
    const base = checkTripQualityLegacyMain(
      20_000,
      null,
      0,
      null,
      TRIP_START,
    );
    expect(base.shouldDiscard).toBe(true);
  });
});

describe('BASE / PR1750-HEAD / FINAL proof harness', () => {
  const reproWps = productionReproWaypoints();

  it('captures BASE false cancel, PR1750 stationary tail risk, FINAL decoupled fix', () => {
    const baseEnd = resolveLegacyFinalizeEndTime({
      lastMeaningfulMovementAt: STALE_LMM,
      latestWaypointRecordedAt: reproWps[reproWps.length - 1]!.recordedAt,
      tripStartTime: TRIP_START,
      fallbackNow: new Date(),
    });
    const baseQuality = checkTripQualityLegacyMain(
      baseEnd.getTime() - TRIP_START.getTime(),
      null,
      reproWps.length,
      null,
      TRIP_START,
    );

    const pr1750 = evaluateFinalizeQuality({
      waypoints: reproWps,
      profile: 'ICE',
      lmm: STALE_LMM,
      useUnsafePr1750End: true,
    });

    const finalEval = evaluateFinalizeQuality({
      waypoints: reproWps,
      profile: 'ICE',
      lmm: STALE_LMM,
    });

    const BASE_FALSE_CANCEL = baseQuality.shouldDiscard;
    const CURRENT_HEAD_FALSE_CANCEL = pr1750.quality.shouldDiscard;
    const CURRENT_HEAD_STATIONARY_TAIL_END_RISK =
      pr1750.resolved.endTime.getTime() >
      PHYSICAL_STOP.getTime() + 60_000;
    const FINAL_HEAD_FALSE_CANCEL = finalEval.quality.shouldDiscard;
    const FINAL_HEAD_STATIONARY_TAIL_EXTENDS_END =
      finalEval.resolved.endTime.getTime() >= STATIONARY_TAIL.getTime();

    expect(BASE_FALSE_CANCEL).toBe(true);
    expect(CURRENT_HEAD_FALSE_CANCEL).toBe(false);
    expect(CURRENT_HEAD_STATIONARY_TAIL_END_RISK).toBe(true);
    expect(FINAL_HEAD_FALSE_CANCEL).toBe(false);
    expect(FINAL_HEAD_STATIONARY_TAIL_EXTENDS_END).toBe(false);
    expect(finalEval.resolved.endTime.toISOString()).toBe(PHYSICAL_STOP.toISOString());
  });
});

describe('post-stop GPS spike robustness (Phase A controls)', () => {
  const PARK_LAT = 50.9395;
  const PARK_LON = 6.965;
  /** ~35 m north — above TRIP_ROUTE_MOVEMENT_MIN_METERS. */
  const SPIKE_LAT = PARK_LAT + 0.00032;

  function realMotionUntilStop(): PersistedRouteWaypointForMovement[] {
    return [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 25),
      wp('2026-09-24T13:09:50.000Z', 50.9375, 6.961, 30),
      wp('2026-09-24T13:10:05.000Z', 50.938, 6.962, 28),
      wp('2026-09-24T13:10:21.390Z', 50.9385, 6.963, 22),
      wp('2026-09-24T13:10:40.000Z', 50.939, 6.964, 18),
      wp('2026-09-24T13:11:00.000Z', PARK_LAT, PARK_LON, 8),
    ];
  }

  function withPostStopGpsSpike(
    base: PersistedRouteWaypointForMovement[],
  ): PersistedRouteWaypointForMovement[] {
    return [
      ...base,
      wp('2026-09-24T13:11:30.000Z', PARK_LAT, PARK_LON, 0),
      wp('2026-09-24T13:12:00.000Z', SPIKE_LAT, PARK_LON, 0),
      wp('2026-09-24T13:12:10.000Z', PARK_LAT, PARK_LON, 0),
    ];
  }

  it('CASE 1 — isolated post-stop GPS spike must not extend canonical end', () => {
    const waypoints = withPostStopGpsSpike(realMotionUntilStop());
    const analysis = analyzePersistedRouteMovement(waypoints, 'ICE');
    const resolved = resolveFinalizeEndTime({
      cusumSegmentEnd: null,
      lastMeaningfulMovementAt: STALE_LMM,
      latestCredibleMovementAt: analysis.latestCredibleMovementAt,
      possibleEndAt: null,
      tripStartTime: TRIP_START,
      fallbackNow: new Date('2026-09-24T13:15:00.000Z'),
    });

    expect(analysis.latestCredibleMovementAt!.getTime()).toBeLessThanOrEqual(
      PHYSICAL_STOP.getTime(),
    );
    expect(resolved.endTime.getTime()).toBeLessThanOrEqual(
      PHYSICAL_STOP.getTime(),
    );
    expect(resolved.endTime.toISOString()).toBe(PHYSICAL_STOP.toISOString());
  });

  it('CASE 1b — spike-only tail must not prove meaningful movement', () => {
    const parkedOnly = [
      wp('2026-09-24T13:11:00.000Z', PARK_LAT, PARK_LON, 0),
      wp('2026-09-24T13:11:30.000Z', PARK_LAT, PARK_LON, 0),
      wp('2026-09-24T13:12:00.000Z', SPIKE_LAT, PARK_LON, 0),
      wp('2026-09-24T13:12:10.000Z', PARK_LAT, PARK_LON, 0),
    ];
    const analysis = analyzePersistedRouteMovement(parkedOnly, 'ICE');
    expect(analysis.hasMeaningfulMovement).toBe(false);
    expect(
      analysis.latestCredibleMovementAt == null ||
        analysis.latestCredibleMovementAt.getTime() <=
          new Date('2026-09-24T13:11:00.000Z').getTime(),
    ).toBe(true);
  });

  it('CASE 2 — sustained coordinate-only progression remains usable', () => {
    const baseLat = 50.937;
    const baseLon = 6.96;
    const step = 0.0003;
    const sustained = [
      wp('2026-09-24T13:10:00.000Z', baseLat, baseLon, 0),
      wp('2026-09-24T13:10:20.000Z', baseLat + step, baseLon, 0),
      wp('2026-09-24T13:10:40.000Z', baseLat + 2 * step, baseLon, 0),
      wp('2026-09-24T13:11:00.000Z', baseLat + 3 * step, baseLon, 0),
    ];
    const analysis = analyzePersistedRouteMovement(sustained, 'ICE');
    expect(analysis.hasMeaningfulMovement).toBe(true);
    expect(analysis.latestCredibleMovementAt!.toISOString()).toBe(
      '2026-09-24T13:11:00.000Z',
    );
  });

  it('CASE 3 — speed-corroborated motion unchanged', () => {
    const two = [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 15),
      wp('2026-09-24T13:09:55.000Z', 50.938, 6.962, 18),
    ];
    expect(analyzePersistedRouteMovement(two, 'ICE').hasMeaningfulMovement).toBe(
      true,
    );
  });

  it('CASE 4 — loop return unchanged', () => {
    const loop = [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 20),
      wp('2026-09-24T13:09:50.000Z', 50.939, 6.96, 22),
      wp('2026-09-24T13:10:05.000Z', 50.939, 6.963, 20),
      wp('2026-09-24T13:10:20.000Z', 50.937, 6.963, 18),
      wp('2026-09-24T13:10:35.000Z', 50.937, 6.96, 0),
    ];
    expect(analyzePersistedRouteMovement(loop, 'ICE').hasMeaningfulMovement).toBe(
      true,
    );
  });

  it('CASE 5 — tiny jitter unchanged', () => {
    const jitter = [
      wp('2026-09-24T13:09:35.000Z', 50.937, 6.96, 0),
      wp('2026-09-24T13:09:40.000Z', 50.93701, 6.96001, 0),
      wp('2026-09-24T13:09:45.000Z', 50.93702, 6.96002, 0),
    ];
    expect(analyzePersistedRouteMovement(jitter, 'ICE').hasMeaningfulMovement).toBe(
      false,
    );
  });

  it('CASE D — production repro still fixed with post-stop spike present', () => {
    const waypoints = withPostStopGpsSpike(productionReproWaypoints());
    const routeMovement = analyzePersistedRouteMovement(waypoints, 'ICE');
    const quality = checkTripQuality(
      STALE_LMM.getTime() - TRIP_START.getTime(),
      null,
      waypoints.length,
      null,
      TRIP_START,
      {
        hasMeaningfulPersistedRouteMovement: routeMovement.hasMeaningfulMovement,
      },
    );
    expect(quality.shouldDiscard).toBe(false);
  });
});

describe('checkTripQuality — persisted movement evidence controls', () => {
  it('control 4: distance >= 0.1 km still preserved', () => {
    expect(checkTripQuality(30_000, 0.15, 0, null, TRIP_START).shouldDiscard).toBe(
      false,
    );
  });

  it('control 5: no_meaningful_movement rule preserved', () => {
    const r = checkTripQuality(120_000, 0.05, 1, null, TRIP_START);
    expect(r.shouldDiscard).toBe(true);
    expect(r.reason).toBe('no_meaningful_movement');
  });
});
