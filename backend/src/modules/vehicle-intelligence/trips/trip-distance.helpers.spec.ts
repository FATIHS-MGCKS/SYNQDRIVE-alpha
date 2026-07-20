import {
  resolveDimoCanonicalDistanceKm,
  resolveEnrichmentDistanceKm,
} from './trip-distance.helpers';

describe('trip-distance.helpers', () => {
  const dimoRepairTrip = {
    distanceKm: 0.5,
    dimoSegmentId: 'dimo-seg-42',
    startDetectionMode: 'DIMO_changePointDetection_REPAIR',
    rawDetectionMeta: {
      repairSource: 'DIMO_SEGMENT',
      dimoSegment: { distanceKm: 36 },
    },
  };

  it('prefers dimoSegment.distanceKm from rawDetectionMeta', () => {
    expect(resolveDimoCanonicalDistanceKm(dimoRepairTrip)).toBe(36);
  });

  it('preserves DIMO distance during enrichment even when map-match is lower', () => {
    expect(resolveEnrichmentDistanceKm(dimoRepairTrip, 500)).toBe(36);
  });

  it('uses map-match distance when no DIMO canonical distance exists', () => {
    const trip = {
      distanceKm: 12.3,
      dimoSegmentId: null,
      startDetectionMode: 'V2_LIVE',
      rawDetectionMeta: null,
    };

    expect(resolveEnrichmentDistanceKm(trip, 45_678)).toBe(45.7);
  });

  it('keeps existing trip distance when map-match is unavailable', () => {
    const trip = {
      distanceKm: 12.3,
      dimoSegmentId: null,
      startDetectionMode: 'V2_LIVE',
      rawDetectionMeta: null,
    };

    expect(resolveEnrichmentDistanceKm(trip, null)).toBe(12.3);
  });

  it('returns null for non-DIMO trips without stored distance', () => {
    const trip = {
      distanceKm: null,
      dimoSegmentId: null,
      startDetectionMode: 'V2_LIVE',
      rawDetectionMeta: null,
    };

    expect(resolveDimoCanonicalDistanceKm(trip)).toBeNull();
    expect(resolveEnrichmentDistanceKm(trip, 12_300)).toBe(12.3);
  });
});
