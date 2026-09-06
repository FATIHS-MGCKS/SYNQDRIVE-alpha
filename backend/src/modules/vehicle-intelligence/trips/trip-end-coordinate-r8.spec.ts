import {
  buildTripFsmForensicsR8V1,
  mergeFinalizeRawDetectionMeta,
  resolveBoundaryConsistentEndCoordinate,
} from './trip-fsm-forensics.util';

describe('trip-end-coordinate R8', () => {
  const canonicalEnd = new Date('2026-09-06T14:30:00.000Z');

  it('A — uses waypoint at or before canonical end', () => {
    const result = resolveBoundaryConsistentEndCoordinate({
      canonicalEndAt: canonicalEnd,
      waypointAtOrBefore: {
        latitude: 52.1,
        longitude: 13.1,
        recordedAt: new Date('2026-09-06T14:29:00.000Z'),
      },
    });
    expect(result.endCoordinateSource).toBe('WAYPOINT_AT_OR_BEFORE_BOUNDARY');
    expect(result.endLatitude).toBe(52.1);
    expect(result.endLongitude).toBe(13.1);
  });

  it('B — clears coords when only later waypoint exists', () => {
    const result = resolveBoundaryConsistentEndCoordinate({
      canonicalEndAt: canonicalEnd,
      waypointAtOrBefore: null,
    });
    expect(result.endCoordinateSource).toBe('NONE');
    expect(result.endLatitude).toBeNull();
    expect(result.endLongitude).toBeNull();
  });

  it('C — exact boundary waypoint match', () => {
    const result = resolveBoundaryConsistentEndCoordinate({
      canonicalEndAt: canonicalEnd,
      waypointAtOrBefore: {
        latitude: 48.0,
        longitude: 11.0,
        recordedAt: canonicalEnd,
      },
    });
    expect(result.endLatitude).toBe(48.0);
    expect(result.endCoordinateObservedAt).toBe(canonicalEnd.toISOString());
  });
});

describe('mergeFinalizeRawDetectionMeta', () => {
  it('preserves lifecycleRecovery and layers R8 forensics (R8.13)', () => {
    const merged = mergeFinalizeRawDetectionMeta({
      priorRaw: {
        lifecycleRecovery: { startEpisode: { candidateStartAt: '2026-09-06T10:00:00.000Z' } },
        splitFrom: { tripId: 'trip-old' },
      },
      finalizeLayer: {
        endValidation: { outcome: 'confirmed' },
        tripFsmForensics: buildTripFsmForensicsR8V1({
          endRecognizedAt: new Date('2026-09-06T11:00:00.000Z'),
          canonicalEndAt: new Date('2026-09-06T10:58:00.000Z'),
        }),
      },
    });
    expect((merged.lifecycleRecovery as any).startEpisode).toBeDefined();
    expect(merged.splitFrom).toEqual({ tripId: 'trip-old' });
    expect(merged.endValidation).toEqual({ outcome: 'confirmed' });
    expect((merged.tripFsmForensics as any).version).toBe('R8_V1');
  });
});
