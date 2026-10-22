import { describe, expect, it } from 'vitest';
import { buildMotionSpeedLineFeatures } from './motion-map.utils';
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
