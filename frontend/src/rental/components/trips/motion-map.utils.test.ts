import { describe, expect, it } from 'vitest';
import {
  buildMotionSpeedLineFeatures,
  groupMotionEventsByCoordinate,
  motionCoordKey,
  pickMotionSampleAtPoint,
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
});
