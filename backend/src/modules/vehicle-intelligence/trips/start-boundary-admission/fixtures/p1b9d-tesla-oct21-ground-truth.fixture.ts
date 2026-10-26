/**
 * TDL P1B.9D — sparse offline fixtures from Production read-only forensics (21.10.2026).
 * Sources: vehicle_trips, vehicle_trip_waypoints, CH HF summaries in TDL P1B.9A/9B.
 * Not a claim of original live core batches at confirmation time.
 */

import type { DimoTripSegment } from '../../../../dimo/dimo-segments.service';
import type { RoutePoint, TripCoreDataPoint } from '../../../../dimo/dimo-segments.service';

export const TESLA_P1B9D_VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
export const TESLA_P1B9D_DIMO_TOKEN = 186946;

/** What is archived Production telemetry vs offline reconstruction context. */
export const P1B9D_FIXTURE_PROVENANCE = {
  archivedFromProduction: [
    'vehicle_trips.start_time / created_at / dimo_segment_id',
    'vehicle_trip_waypoints (lat/lon/speed_kmh timestamps)',
    'CH HF speed sample timestamps summarized in TDL P1B.9A/9B audits',
  ],
  constructedForOfflineReplay: [
    'candidateStartAtUtc (POSSIBLE_START_VALIDATION run; not on trip row)',
    'segment endTime/distance/maxSpeed placeholders',
    'sparse CH corePoints excerpt (not full live confirmation batch)',
    'driver groundTruthStartUtc / groundTruthEndUtc (human GT, not in DB)',
    's4SpeedQcTrust label from prior audit',
  ],
  notClaimed: [
    'Original live P1B shadow JSON or exact core batch at confirmation',
    '±7s accuracy as proof of 21.10 live shadow decision',
  ],
} as const;

export type P1b9dTeslaGroundTruthFixture = {
  tripId: string;
  label: string;
  groundTruthStartUtc: string;
  groundTruthEndUtc: string;
  legacyCanonicalStartUtc: string;
  legacyStartErrorSeconds: number;
  fsmConfirmedAtUtc: string;
  /**
   * FSM `possibleStartAt` at shadow time — not persisted on completed trips.
   * Offline replay uses earliest POSSIBLE_START_VALIDATION run before confirm (P1B.9).
   */
  candidateStartAtUtc: string;
  confirmedAtUtc: string;
  dimoSegmentId: string;
  segmentMechanism: string;
  segments: DimoTripSegment[];
  corePoints: TripCoreDataPoint[];
  routePoints: RoutePoint[];
  integrationModality: 'SOFTWARE_INTEGRATION';
  profile: 'EV';
  /** S4 speed QC from P1B.9B read-only audit (not re-queried in tests). */
  s4SpeedQcTrust: 'TRUSTED_MAX_AVAILABLE';
  telemetryGaps: string[];
};

function segmentFromEpoch(
  segmentId: string,
  startIso: string,
): DimoTripSegment {
  return {
    segmentId,
    mechanism: 'changePointDetection',
    startTime: startIso,
    endTime: '2026-10-21T23:00:00.000Z',
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 600,
    startLatitude: 51.33536,
    startLongitude: 9.50615,
    endLatitude: 51.34,
    endLongitude: 9.517,
    odometerStartKm: null,
    odometerEndKm: null,
    distanceKm: 2,
    maxSpeedKmh: 40,
  };
}

function core(ts: string, speed: number | null): TripCoreDataPoint {
  return {
    timestamp: ts,
    isIgnitionOn: null,
    speed,
    travelledDistance: null,
    fuelAbsoluteLevel: null,
    batteryEnergy: null,
  };
}

function route(
  ts: string,
  lat: number,
  lon: number,
  speedKmh: number | null,
): RoutePoint {
  return {
    timestamp: ts,
    latitude: lat,
    longitude: lon,
    speedKmh,
  };
}

/** Trip 14c41c06 — driver GT start 12:03:15 UTC; legacy segment 11:58:00 (−315 s). */
export const P1B9D_TESLA_TRIP_1: P1b9dTeslaGroundTruthFixture = {
  tripId: '14c41c06-0a54-49d1-b5d2-f9d7373e638d',
  label: 'TESLA_GT_TRIP_1',
  groundTruthStartUtc: '2026-10-21T12:03:15.000Z',
  groundTruthEndUtc: '2026-10-21T12:07:10.000Z',
  legacyCanonicalStartUtc: '2026-10-21T11:58:00.000Z',
  legacyStartErrorSeconds: -315,
  fsmConfirmedAtUtc: '2026-10-21T12:04:10.951Z',
  candidateStartAtUtc: '2026-10-21T12:03:39.737Z',
  confirmedAtUtc: '2026-10-21T12:04:10.951Z',
  dimoSegmentId: 'dimo-seg-186946-1792583880000',
  segmentMechanism: 'changePointDetection',
  segments: [
    segmentFromEpoch(
      'dimo-seg-186946-1792583880000',
      '2026-10-21T11:58:00.000Z',
    ),
  ],
  corePoints: [
    core('2026-10-21T12:02:42.000Z', 0),
    core('2026-10-21T12:03:11.000Z', 1),
    core('2026-10-21T12:03:32.000Z', 12),
  ],
  routePoints: [
    route('2026-10-21T11:58:49.000Z', 51.335363, 9.506153, null),
    route('2026-10-21T12:03:08.000Z', 51.335361, 9.506148, 1),
    route('2026-10-21T12:03:15.000Z', 51.335342, 9.506117, null),
    route('2026-10-21T12:03:29.000Z', 51.335228, 9.506213, 4),
    route('2026-10-21T12:03:50.000Z', 51.335474, 9.50681, 23),
  ],
  integrationModality: 'SOFTWARE_INTEGRATION',
  profile: 'EV',
  s4SpeedQcTrust: 'TRUSTED_MAX_AVAILABLE',
  telemetryGaps: [
    'NO_CH_SPEED_SAMPLES_11:55-11:59_UTC',
    'SPARSE_WAYPOINT_SPEED_BEFORE_GT',
  ],
};

/** Trip 7a9d6a28 — driver GT start 12:20:08 UTC; legacy segment 12:15:00 (−308 s). */
export const P1B9D_TESLA_TRIP_2: P1b9dTeslaGroundTruthFixture = {
  tripId: '7a9d6a28-d91a-4919-98d8-d92fbea1573e',
  label: 'TESLA_GT_TRIP_2',
  groundTruthStartUtc: '2026-10-21T12:20:08.000Z',
  groundTruthEndUtc: '2026-10-21T12:24:10.000Z',
  legacyCanonicalStartUtc: '2026-10-21T12:15:00.000Z',
  legacyStartErrorSeconds: -308,
  fsmConfirmedAtUtc: '2026-10-21T12:20:20.005Z',
  candidateStartAtUtc: '2026-10-21T12:20:20.005Z',
  confirmedAtUtc: '2026-10-21T12:20:20.005Z',
  dimoSegmentId: 'dimo-seg-186946-1792584900000',
  segmentMechanism: 'changePointDetection',
  segments: [
    segmentFromEpoch(
      'dimo-seg-186946-1792584900000',
      '2026-10-21T12:15:00.000Z',
    ),
  ],
  corePoints: [
    core('2026-10-21T12:19:55.000Z', 0),
    core('2026-10-21T12:20:15.000Z', 6),
    core('2026-10-21T12:20:50.000Z', 45),
  ],
  routePoints: [
    route('2026-10-21T12:15:00.000Z', 51.340278, 9.516667, null),
    route('2026-10-21T12:20:08.000Z', 51.340272, 9.516662, null),
    route('2026-10-21T12:20:15.000Z', 51.340245, 9.516657, 6),
    route('2026-10-21T12:20:50.000Z', 51.339657, 9.517001, 45),
  ],
  integrationModality: 'SOFTWARE_INTEGRATION',
  profile: 'EV',
  s4SpeedQcTrust: 'TRUSTED_MAX_AVAILABLE',
  telemetryGaps: ['WAYPOINT_AT_GT_WITHOUT_SPEED_SAMPLE'],
};

export const P1B9D_TESLA_FIXTURES = [P1B9D_TESLA_TRIP_1, P1B9D_TESLA_TRIP_2];

/** Trip 1 — strip 12:03:08Z route speed=1 (weak EV threshold margin); keep archived positions. */
export function trip1RouteWithoutWeakSpeedEvidence(
  fixture: P1b9dTeslaGroundTruthFixture = P1B9D_TESLA_TRIP_1,
): RoutePoint[] {
  return fixture.routePoints.map((p) =>
    p.timestamp === '2026-10-21T12:03:08.000Z'
      ? { ...p, speedKmh: null }
      : p,
  );
}

/** Trip 1 — additionally strip 12:03:11Z core speed=1 (HF excerpt); positions unchanged. */
export function trip1CoreWithoutWeakSpeedEvidence(
  fixture: P1b9dTeslaGroundTruthFixture = P1B9D_TESLA_TRIP_1,
): TripCoreDataPoint[] {
  return fixture.corePoints.map((p) =>
    p.timestamp === '2026-10-21T12:03:11.000Z'
      ? { ...p, speed: null }
      : p,
  );
}
