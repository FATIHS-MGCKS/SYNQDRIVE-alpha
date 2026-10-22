import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../di-v0-motion-core-shadow-processor';
import type { DiV0MotionCoreShadowEvidenceAdaptation } from '../di-v0-motion-core-shadow-evidence.adapter';
import {
  buildMotionTripMapSamples,
  mapMotionTripMapEvents,
  mapMotionTripMapStops,
} from '../di-v0-motion-core-shadow-trip-map-read.mapper';
import type { MotionCorePositionBucket } from '../../core/kinematics/motion-core-grid';

function makeEvidence(buckets: MotionCorePositionBucket[]): DiV0MotionCoreShadowEvidenceAdaptation {
  return {
    buckets,
    sparseSpeed: [],
    sparsePersisted: [],
    sparseChannelOutcome: null,
    sparseComparable: false,
    limitations: [],
  };
}

describe('di-v0-motion-core-shadow-trip-map-read.mapper', () => {
  it('does not treat missing speed as zero-speed segments', () => {
    const buckets: MotionCorePositionBucket[] = [
      { bucketLabelUtc: '2026-01-01T10:00:00Z', availability: 'PRESENT', latitude: 50.1, longitude: 8.1 },
      { bucketLabelUtc: '2026-01-01T10:00:01Z', availability: 'ROW_ABSENT', latitude: null, longitude: null },
      { bucketLabelUtc: '2026-01-01T10:00:02Z', availability: 'PRESENT', latitude: 50.12, longitude: 8.12 },
    ];
    const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(makeEvidence(buckets), {
      pinnedSnapshotHash: 'hash-a',
      combinedInputIdentity: 'input-a',
      computedAt: new Date('2026-01-01T11:00:00Z'),
    });
    const positions = buckets.map((b) => ({
      bucketLabelUtc: b.bucketLabelUtc,
      latitude: b.latitude,
      longitude: b.longitude,
      availability: b.availability,
    }));
    const { samples } = buildMotionTripMapSamples(processed.payload, positions, []);
    const middle = samples.find((s) => s.bucketLabelUtc.endsWith(':01Z'));
    expect(middle?.speedKmh).toBeNull();
    expect(middle?.latitude).toBeNull();
  });

  it('aligns samples to route timestamps only within tolerance', () => {
    const buckets: MotionCorePositionBucket[] = [
      { bucketLabelUtc: '2026-01-01T10:00:00.000Z', availability: 'ROW_ABSENT', latitude: null, longitude: null },
      { bucketLabelUtc: '2026-01-01T10:00:01.000Z', availability: 'ROW_ABSENT', latitude: null, longitude: null },
    ];
    const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(makeEvidence(buckets), {
      pinnedSnapshotHash: 'hash-b',
      combinedInputIdentity: 'input-b',
    });
    const positions = buckets.map((b) => ({
      bucketLabelUtc: b.bucketLabelUtc,
      latitude: b.latitude,
      longitude: b.longitude,
      availability: b.availability,
    }));
    const routePoints = [
      { timestamp: '2026-01-01T10:00:00.100Z', latitude: 51, longitude: 9 },
      { timestamp: '2026-01-01T10:00:01.050Z', latitude: 51.1, longitude: 9.1 },
    ];
    const { samples, geometrySource } = buildMotionTripMapSamples(processed.payload, positions, routePoints);
    expect(geometrySource).toBe('MAPBOX_ROUTE_ALIGNED');
    expect(samples[0]?.latitude).toBe(51);
    expect(samples[1]?.latitude).toBe(51.1);
  });

  it('maps events without inventing coordinates when label is missing', () => {
    const buckets: MotionCorePositionBucket[] = [
      { bucketLabelUtc: '2026-01-01T10:00:00Z', availability: 'PRESENT', latitude: 50, longitude: 8 },
      { bucketLabelUtc: '2026-01-01T10:00:10Z', availability: 'PRESENT', latitude: 50.01, longitude: 8.01 },
    ];
    const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(
      {
        ...makeEvidence(buckets),
        sparseSpeed: [
          { label: '2026-01-01T10:00:00Z', speedKmh: 0 },
          { label: '2026-01-01T10:00:01Z', speedKmh: 12 },
          { label: '2026-01-01T10:00:02Z', speedKmh: 25 },
          { label: '2026-01-01T10:00:03Z', speedKmh: 30 },
          { label: '2026-01-01T10:00:04Z', speedKmh: 28 },
          { label: '2026-01-01T10:00:05Z', speedKmh: 5 },
        ],
        sparseComparable: true,
      },
      { pinnedSnapshotHash: 'hash-c', combinedInputIdentity: 'input-c' },
    );
    const positions = buckets.map((b) => ({
      bucketLabelUtc: b.bucketLabelUtc,
      latitude: b.latitude,
      longitude: b.longitude,
      availability: b.availability,
    }));
    const { samples } = buildMotionTripMapSamples(processed.payload, positions, []);
    const sampleByLabel = new Map(samples.map((s) => [s.bucketLabelUtc, s]));
    const events = mapMotionTripMapEvents(processed.payload, sampleByLabel);
    const stops = mapMotionTripMapStops(processed.payload.stopEpisodes, sampleByLabel);
    if (events.length > 0) {
      expect(events.every((e) => e.positionResolved === false || e.latitude != null)).toBe(true);
    }
    expect(stops.every((s) => s.positionResolved === false || s.latitude != null)).toBe(true);
  });
});
