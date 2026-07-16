import type { DimoTripSegment } from '@modules/dimo/dimo-segments.service';
import {
  assertTripBoundaryImmutable,
  classifyBoundaryDifference,
  compareMechanism,
  computeBoundaryDeltas,
  findBestMatchingSegment,
  resolveDimoTripSegmentValidation,
  toSegmentBoundarySnapshot,
} from './dimo-trip-segment-validation.comparator';
import type { TripBoundarySnapshot } from './dimo-trip-segment-validation.types';

function baseTrip(overrides: Partial<TripBoundarySnapshot> = {}): TripBoundarySnapshot {
  return {
    tripId: 'trip-1',
    vehicleId: 'veh-1',
    dimoSegmentId: 'dimo-seg-42-1700000000000',
    tripSource: 'V2_LIVE',
    startTime: new Date('2026-07-16T10:00:00.000Z'),
    endTime: new Date('2026-07-16T10:30:00.000Z'),
    durationMinutes: 30,
    distanceKm: 18.5,
    ...overrides,
  };
}

function baseSegment(overrides: Partial<DimoTripSegment> = {}): DimoTripSegment {
  return {
    segmentId: 'dimo-seg-42-1700000000000',
    mechanism: 'changePointDetection',
    startTime: '2026-07-16T10:00:30.000Z',
    endTime: '2026-07-16T10:29:45.000Z',
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 1755,
    startLatitude: 48.1,
    startLongitude: 11.5,
    endLatitude: 48.2,
    endLongitude: 11.6,
    odometerStartKm: 1000,
    odometerEndKm: 1018.5,
    distanceKm: 18.4,
    maxSpeedKmh: 95,
    ...overrides,
  };
}

describe('dimo-trip-segment-validation.comparator', () => {
  it('classifies MATCHED when boundaries within minor tolerance', () => {
    const trip = baseTrip();
    const segment = toSegmentBoundarySnapshot(baseSegment(), 'changePointDetection');
    const deltas = computeBoundaryDeltas(trip, segment);
    expect(classifyBoundaryDifference(deltas)).toBe('MATCHED');
  });

  it('classifies MINOR_BOUNDARY_DIFFERENCE for moderate start drift', () => {
    const trip = baseTrip();
    const segment = toSegmentBoundarySnapshot(
      baseSegment({ startTime: '2026-07-16T10:03:00.000Z' }),
      'frequencyAnalysis',
    );
    const deltas = computeBoundaryDeltas(trip, segment);
    expect(classifyBoundaryDifference(deltas)).toBe('MINOR_BOUNDARY_DIFFERENCE');
  });

  it('classifies MAJOR_BOUNDARY_DIFFERENCE for large end drift', () => {
    const trip = baseTrip();
    const segment = toSegmentBoundarySnapshot(
      baseSegment({ endTime: '2026-07-16T10:50:00.000Z' }),
      'ignitionDetection',
    );
    const deltas = computeBoundaryDeltas(trip, segment);
    expect(classifyBoundaryDifference(deltas)).toBe('MAJOR_BOUNDARY_DIFFERENCE');
  });

  it('returns SEGMENT_MISSING when no overlapping segment exists', () => {
    const trip = baseTrip();
    const farSegment = baseSegment({
      segmentId: 'dimo-seg-42-1700005000000',
      startTime: '2026-07-16T14:00:00.000Z',
      endTime: '2026-07-16T14:30:00.000Z',
    });
    const result = compareMechanism(trip, [farSegment], 'changePointDetection', null);
    expect(result.status).toBe('SEGMENT_MISSING');
    expect(result.matchedSegment).toBeNull();
  });

  it('returns PROVIDER_ERROR when DIMO fetch fails', () => {
    const trip = baseTrip();
    const result = compareMechanism(trip, [], 'ignitionDetection', 'GraphQL timeout');
    expect(result.status).toBe('PROVIDER_ERROR');
    expect(result.providerError).toBe('GraphQL timeout');
  });

  it('prefers exact dimoSegmentId match over overlap scoring', () => {
    const trip = baseTrip({ dimoSegmentId: 'dimo-seg-42-1700000000000' });
    const exact = baseSegment({ segmentId: 'dimo-seg-42-1700000000000' });
    const other = baseSegment({
      segmentId: 'dimo-seg-42-1700001000000',
      startTime: '2026-07-16T10:00:00.000Z',
      endTime: '2026-07-16T10:30:00.000Z',
    });
    const matched = findBestMatchingSegment(trip, [other, exact], 'changePointDetection');
    expect(matched?.segmentId).toBe('dimo-seg-42-1700000000000');
  });

  it('compares all three mechanisms independently', () => {
    const trip = baseTrip();
    const mechanisms = [
      compareMechanism(trip, [baseSegment()], 'ignitionDetection', null),
      compareMechanism(trip, [baseSegment()], 'frequencyAnalysis', null),
      compareMechanism(
        trip,
        [],
        'changePointDetection',
        null,
      ),
    ];
    const resolved = resolveDimoTripSegmentValidation({
      modelVersion: 'dimo-segment-validation-v1',
      trip,
      mechanisms,
    });
    expect(resolved.mechanisms).toHaveLength(3);
    expect(resolved.overallStatus).toBe('MATCHED');
    expect(resolved.primaryMechanism).toBe('ignitionDetection');
  });

  it('does not mutate trip boundary snapshot during validation', () => {
    const trip = baseTrip();
    const before = { ...trip, startTime: new Date(trip.startTime), endTime: trip.endTime ? new Date(trip.endTime) : null };

    compareMechanism(trip, [baseSegment()], 'changePointDetection', null);
    resolveDimoTripSegmentValidation({
      modelVersion: 'dimo-segment-validation-v1',
      trip,
      mechanisms: [compareMechanism(trip, [baseSegment()], 'changePointDetection', null)],
    });

    assertTripBoundaryImmutable(before, trip);
    expect(trip.startTime.toISOString()).toBe('2026-07-16T10:00:00.000Z');
    expect(trip.endTime?.toISOString()).toBe('2026-07-16T10:30:00.000Z');
    expect(trip.dimoSegmentId).toBe('dimo-seg-42-1700000000000');
    expect(trip.distanceKm).toBe(18.5);
  });

  it('LTE_R1 ICE profile: matched segment with realistic drift', () => {
    const trip = baseTrip({
      dimoSegmentId: 'dimo-seg-8812-1700000000000',
      distanceKm: 22.1,
      durationMinutes: 28,
    });
    const segment = baseSegment({
      segmentId: 'dimo-seg-8812-1700000000000',
      distanceKm: 21.8,
      startTime: '2026-07-16T10:01:00.000Z',
      endTime: '2026-07-16T10:28:30.000Z',
    });
    const result = compareMechanism(trip, [segment], 'frequencyAnalysis', null);
    expect(result.status).toBe('MATCHED');
    expect(result.matchedSegment?.dataQuality).toBe('HIGH');
  });

  it('EV profile: segment missing when provider returns empty', () => {
    const trip = baseTrip({
      dimoSegmentId: 'v2-veh-ev-1700000000000',
      tripSource: 'V2_LIVE',
      distanceKm: 12.0,
    });
    const result = compareMechanism(trip, [], 'changePointDetection', null);
    expect(result.status).toBe('SEGMENT_MISSING');
    expect(result.reasons).toContain('NO_OVERLAPPING_SEGMENT');
  });
});
