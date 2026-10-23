import { describe, expect, it } from 'vitest';
import {
  buildMotionEventSegmentFeatures,
  buildMotionSpeedLineFeatures,
  deriveMotionEventMetrics,
  formatSignedKmh,
  formatSignedMps2,
  groupMotionEventsByCoordinate,
  isMotionEventKinematicallyImplausible,
  isMotionMapActive,
  motionCoordKey,
  motionEventQualityLabelKey,
  pickMotionSampleAtPoint,
  resolveMotionEventSegment,
  resolveMotionSamplesForMap,
} from './motion-map.utils';
import type { TripMotionMapEvent } from './motion-map.types';
import type { TripMotionMapSample } from './motion-map.types';

describe('buildMotionSpeedLineFeatures', () => {
  it('skips segments across position gaps and null speeds', () => {
    const samples: TripMotionMapSample[] = [
      {
        bucketLabelUtc: '2026-01-01T10:00:00Z',
        speedKmh: 40,
        motionState: 'MOVING',
        evidenceQuality: 'DIRECT',
        latitude: 50,
        longitude: 8,
        positionAvailability: 'PRESENT',
      },
      {
        bucketLabelUtc: '2026-01-01T10:00:01Z',
        speedKmh: null,
        motionState: 'UNKNOWN',
        evidenceQuality: 'UNKNOWN',
        latitude: null,
        longitude: null,
        positionAvailability: 'ROW_ABSENT',
      },
      {
        bucketLabelUtc: '2026-01-01T10:00:06Z',
        speedKmh: 30,
        motionState: 'MOVING',
        evidenceQuality: 'DIRECT',
        latitude: 50.01,
        longitude: 8.01,
        positionAvailability: 'PRESENT',
      },
    ];
    const features = buildMotionSpeedLineFeatures(samples);
    expect(features).toHaveLength(0);
  });

  it('emits colored segments only when speed and coordinates exist', () => {
    const samples: TripMotionMapSample[] = [
      {
        bucketLabelUtc: '2026-01-01T10:00:00Z',
        speedKmh: 55,
        motionState: 'MOVING',
        evidenceQuality: 'DIRECT',
        latitude: 50,
        longitude: 8,
        positionAvailability: 'PRESENT',
      },
      {
        bucketLabelUtc: '2026-01-01T10:00:01Z',
        speedKmh: 60,
        motionState: 'MOVING',
        evidenceQuality: 'DIRECT',
        latitude: 50.001,
        longitude: 8.001,
        positionAvailability: 'PRESENT',
      },
    ];
    const features = buildMotionSpeedLineFeatures(samples);
    expect(features).toHaveLength(1);
    expect(features[0]?.properties?.speed).toBe(55);
  });
});

describe('motion map grouping and route pick', () => {
  it('groups events at the same coordinate', () => {
    const events: TripMotionMapEvent[] = [
      {
        id: 'a',
        kind: 'ACCEL',
        displayKind: 'ACCELERATION',
        startLabelUtc: '2026-01-01T10:00:00Z',
        endLabelUtc: '2026-01-01T10:00:01Z',
        startSpeedKmh: 10,
        endSpeedKmh: 20,
        deltaKmh: 10,
        peakAccel1sMps2: 1,
        quality: 'DIRECT',
        artefactSuspect: false,
        latitude: 50,
        longitude: 8,
        positionResolved: true,
      },
      {
        id: 'b',
        kind: 'DECEL',
        displayKind: 'DECELERATION',
        startLabelUtc: '2026-01-01T10:00:02Z',
        endLabelUtc: '2026-01-01T10:00:03Z',
        startSpeedKmh: 20,
        endSpeedKmh: 10,
        deltaKmh: -10,
        peakAccel1sMps2: -1,
        quality: 'DIRECT',
        artefactSuspect: false,
        latitude: 50.000001,
        longitude: 8.000001,
        positionResolved: true,
      },
    ];
    const grouped = groupMotionEventsByCoordinate(events);
    expect(grouped.size).toBe(1);
    expect(grouped.get(motionCoordKey(50, 8))?.length).toBe(2);
  });

  it('picks nearest sample within hit radius', () => {
    const samples = [
      {
        bucketLabelUtc: '2026-01-01T10:00:00Z',
        speedKmh: 40,
        motionState: 'MOVING',
        evidenceQuality: 'DIRECT',
        latitude: 50,
        longitude: 8,
        positionAvailability: 'PRESENT',
      },
    ];
    const map = {
      queryRenderedFeatures: () => [],
      unproject: () => ({ lng: 8, lat: 50 }),
      project: () => ({ x: 100, y: 100 }),
    };
    const picked = pickMotionSampleAtPoint(map, samples, { x: 110, y: 100 });
    expect(picked?.bucketLabelUtc).toBe('2026-01-01T10:00:00Z');
  });

  it('does not align motion to Mapbox route when snapshot binding is unverified', () => {
    const payload = {
      status: 'SUCCEEDED' as const,
      previewLabel: 'S4 Motion · vorläufig' as const,
      runId: 'r1',
      workItemId: 'w1',
      pinnedSnapshotHash: 'h',
      combinedInputIdentity: 'i',
      algorithmVersions: null,
      computedAtUtc: null,
      geometrySource: 'NONE' as const,
      geometryNote: null,
      samples: [
        {
          bucketLabelUtc: '2026-01-01T10:00:00Z',
          speedKmh: 50,
          motionState: 'MOVING',
          evidenceQuality: 'DIRECT',
          latitude: null,
          longitude: null,
          positionAvailability: null,
        },
      ],
      events: [],
      stopEpisodes: [],
      limitations: [],
      failureCode: null,
      snapshotBindingVerified: false,
      newerFailedRunId: null,
      newerFailedRunStatus: null,
    };
    const routePoints = [
      { timestamp: '2026-01-01T10:00:00Z', latitude: 51, longitude: 9, speedKmh: 30 },
      { timestamp: '2026-01-01T10:00:01Z', latitude: 51.1, longitude: 9.1, speedKmh: 30 },
    ];
    const resolved = resolveMotionSamplesForMap(payload, routePoints);
    expect(resolved.samples[0]?.latitude).toBeNull();
    expect(isMotionMapActive(payload)).toBe(false);
  });
});

/**
 * Pinned Tiguan WOB L 7503 data (trip 98d2a8e0-8b7d-4529-bf76-acee44d61fbe,
 * motion run 8ec6306e-606b-4507-ab03-ea058c5d810d, 19:04 UTC window).
 * Values copied from the persisted shadow payload + verified position grid.
 */
const tiguanSample = (
  label: string,
  speedKmh: number | null,
  lat: number | null,
  lng: number | null,
): TripMotionMapSample => ({
  bucketLabelUtc: `2026-10-22T${label}Z`,
  speedKmh,
  motionState: 'MOVING',
  evidenceQuality: speedKmh == null ? 'INFERRED' : 'DIRECT',
  latitude: lat,
  longitude: lng,
  positionAvailability: lat == null ? 'ROW_ABSENT' : 'PRESENT',
});

const tiguan1904Samples: TripMotionMapSample[] = [
  tiguanSample('19:04:25', null, null, null),
  tiguanSample('19:04:26', 34.7, 51.3284, 9.52193),
  tiguanSample('19:04:27', 28.1, 51.32844, 9.52177),
  tiguanSample('19:04:28', 19.3, 51.32846, 9.52166),
  tiguanSample('19:04:29', 5.5, 51.32846, 9.52163),
  tiguanSample('19:04:30', 4.3, 51.32846, 9.52162),
  tiguanSample('19:04:48', 61.8, 51.3292, 9.51807),
  tiguanSample('19:04:49', 52.3, 51.32928, 9.5178),
  tiguanSample('19:04:50', null, null, null),
  tiguanSample('19:04:51', 103.0, 51.32938, 9.51751),
  tiguanSample('19:04:52', 142.1, 51.3296, 9.51694),
  tiguanSample('19:04:53', null, 51.32977, 9.51657),
];

const tiguanDecel190426: TripMotionMapEvent = {
  id: 'motion-ev-17-2026-10-22T19:04:26Z',
  kind: 'DECELERATION',
  displayKind: 'DECELERATION',
  startLabelUtc: '2026-10-22T19:04:26Z',
  endLabelUtc: '2026-10-22T19:04:29Z',
  startSpeedKmh: 34.7,
  endSpeedKmh: 5.5,
  deltaKmh: 29.2,
  peakAccel1sMps2: null,
  quality: 'DEGRADED',
  artefactSuspect: false,
  latitude: 51.3284,
  longitude: 9.52193,
  positionResolved: true,
};

const tiguanAccel190449: TripMotionMapEvent = {
  ...tiguanDecel190426,
  id: 'motion-ev-20-2026-10-22T19:04:49Z',
  kind: 'ACCELERATION',
  displayKind: 'ACCELERATION',
  startLabelUtc: '2026-10-22T19:04:49Z',
  endLabelUtc: '2026-10-22T19:04:52Z',
  startSpeedKmh: 52.3,
  endSpeedKmh: 142.1,
  deltaKmh: 89.8,
  latitude: 51.32928,
  longitude: 9.5178,
};

describe('deriveMotionEventMetrics (pinned Tiguan 19:04 UTC events)', () => {
  it('signs the persisted unsigned deltaKmh for braking (IMG_7778 case: 35→6 must not read +29)', () => {
    const m = deriveMotionEventMetrics(tiguanDecel190426);
    expect(m.signedDeltaKmh).toBeCloseTo(-29.2, 5);
    expect(m.durationS).toBe(3);
    expect(m.meanAccelMps2).toBeCloseTo(-29.2 / 3.6 / 3, 5);
    expect(formatSignedKmh(m.signedDeltaKmh)).toBe('−29');
    expect(formatSignedMps2(m.meanAccelMps2!)).toBe('−2.7');
  });

  it('keeps acceleration positive and exposes the implausible 8.3 m/s² mean for 52→142 km/h in 3 s', () => {
    const m = deriveMotionEventMetrics(tiguanAccel190449);
    expect(m.signedDeltaKmh).toBeCloseTo(89.8, 5);
    expect(m.durationS).toBe(3);
    expect(m.meanAccelMps2).toBeCloseTo(8.31, 2);
    expect(formatSignedKmh(m.signedDeltaKmh)).toBe('+90');
    expect(formatSignedMps2(m.meanAccelMps2!)).toBe('+8.3');
  });

  it('falls back to displayKind for sign when start and end speeds are equal', () => {
    const m = deriveMotionEventMetrics({
      ...tiguanDecel190426,
      startSpeedKmh: 10,
      endSpeedKmh: 10,
      deltaKmh: 0,
    });
    expect(m.signedDeltaKmh).toBe(-0);
    expect(formatSignedKmh(m.signedDeltaKmh)).toBe('0');
  });

  it('maps event quality to label keys and leaves unknown values unmapped', () => {
    expect(motionEventQualityLabelKey('OK')).toBe('trips.motionMap.qualityOk');
    expect(motionEventQualityLabelKey('LIMITED')).toBe('trips.motionMap.qualityLimited');
    expect(motionEventQualityLabelKey('DEGRADED')).toBe('trips.motionMap.qualityDegraded');
    expect(motionEventQualityLabelKey('ARTEFACT_SUSPECT')).toBeNull();
  });
});

describe('resolveMotionEventSegment / buildMotionEventSegmentFeatures', () => {
  it('selects the positioned samples inside the event window (19:04:26–19:04:29 → 4 samples, not extended)', () => {
    const seg = resolveMotionEventSegment(tiguanDecel190426, tiguan1904Samples);
    expect(seg.samples.map((s) => s.bucketLabelUtc.slice(11, 19))).toEqual([
      '19:04:26',
      '19:04:27',
      '19:04:28',
      '19:04:29',
    ]);
    expect(seg.extended).toBe(false);
    expect(seg.start?.bucketLabelUtc).toBe('2026-10-22T19:04:26Z');
    expect(seg.end?.bucketLabelUtc).toBe('2026-10-22T19:04:29Z');

    const { line, endpoints } = buildMotionEventSegmentFeatures(seg, tiguanDecel190426);
    expect(line).toHaveLength(1);
    expect(line[0]?.geometry.coordinates).toHaveLength(4);
    expect(line[0]?.properties?.displayKind).toBe('DECELERATION');
    expect(endpoints.map((f) => f.properties?.role)).toEqual(['start', 'end']);
  });

  it('skips ROW_ABSENT buckets inside the window without extending (19:04:49–19:04:52 has a gap at :50)', () => {
    const seg = resolveMotionEventSegment(tiguanAccel190449, tiguan1904Samples);
    expect(seg.samples.map((s) => s.bucketLabelUtc.slice(11, 19))).toEqual(['19:04:49', '19:04:51', '19:04:52']);
    expect(seg.extended).toBe(false);
  });

  it('extends to nearest positioned neighbours when the window has fewer than two positioned samples', () => {
    const singleBucketEvent = {
      startLabelUtc: '2026-10-22T19:04:50Z',
      endLabelUtc: '2026-10-22T19:04:50Z',
    };
    const seg = resolveMotionEventSegment(singleBucketEvent, tiguan1904Samples);
    expect(seg.extended).toBe(true);
    expect(seg.samples.map((s) => s.bucketLabelUtc.slice(11, 19))).toEqual([
      '19:04:48',
      '19:04:49',
      '19:04:51',
      '19:04:52',
    ]);
  });

  it('returns an empty segment when no positioned samples exist nearby', () => {
    const seg = resolveMotionEventSegment(
      { startLabelUtc: '2026-10-22T18:30:00Z', endLabelUtc: '2026-10-22T18:30:03Z' },
      tiguan1904Samples,
    );
    expect(seg.samples).toHaveLength(0);
    const { line, endpoints } = buildMotionEventSegmentFeatures(seg, tiguanDecel190426);
    expect(line).toHaveLength(0);
    expect(endpoints).toHaveLength(0);
  });
});

describe('isMotionEventKinematicallyImplausible (display gate G1 from offline candidate K-E)', () => {
  it('flags 52→142 km/h in 3 s (8.3 m/s²) and the 1931 km/h endpoint, not the plausible 35→6 braking', () => {
    expect(isMotionEventKinematicallyImplausible(tiguanAccel190449)).toBe(true);
    expect(isMotionEventKinematicallyImplausible(tiguanDecel190426)).toBe(false);
    expect(
      isMotionEventKinematicallyImplausible({
        ...tiguanAccel190449,
        startLabelUtc: '2026-10-22T18:49:12Z',
        endLabelUtc: '2026-10-22T18:49:18Z',
        startSpeedKmh: 67.3,
        endSpeedKmh: 1930.8,
        deltaKmh: 1863.5,
      }),
    ).toBe(true);
  });

  it('keeps the seven video-matched Tiguan events (max 38.6 km/h in 4 s) plausible', () => {
    const matched = [
      [44, 72.2, 4], [49.2, 80.5, 4], [34.1, 6.6, 5], [40.3, 9.2, 4], [7.4, 46, 4], [40.4, 57.5, 2], [37.6, 19.1, 3],
    ] as const;
    for (const [from, to, dur] of matched) {
      const kind = to > from ? 'ACCELERATION' : 'DECELERATION';
      expect(
        isMotionEventKinematicallyImplausible({
          displayKind: kind,
          startLabelUtc: '2026-10-22T18:00:00Z',
          endLabelUtc: new Date(Date.parse('2026-10-22T18:00:00Z') + dur * 1000).toISOString(),
          startSpeedKmh: from,
          endSpeedKmh: to,
          deltaKmh: Math.abs(to - from),
        }),
        `${from}→${to} in ${dur}s`,
      ).toBe(false);
    }
  });
});
