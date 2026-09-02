import {
  aggregateBucketKey,
  bucketIntervalBoundsMs,
  canonicalizeBucketTimestamp,
  classifyWatermarkExclusion,
  compareAggregateBucketMaps,
  DIMO_PROVIDER_SOURCE_AUTHORITY,
  summarizeLagSeconds,
  type AggregateBucketObservation,
  type WatermarkExclusionClassification,
} from './reference-capture-hf-aggregate-bucket-analysis';

describe('reference-capture-hf-aggregate-bucket-analysis', () => {
  it('canonicalizes equivalent RFC3339 bucket timestamps', () => {
    expect(canonicalizeBucketTimestamp('2026-09-01T19:12:25.500Z')).toBe('2026-09-01T19:12:25.500Z');
    expect(canonicalizeBucketTimestamp('2026-09-01T19:12:25.5Z')).toBe('2026-09-01T19:12:25.500Z');
    expect(
      aggregateBucketKey('speed', '2026-09-01T19:12:25.500Z'),
    ).toBe(aggregateBucketKey('speed', '2026-09-01T19:12:25.5Z'));
  });

  it('classifies definite watermark exclusion for bucket [24.252,25.252) with next from 25.500', () => {
    const classification = classifyWatermarkExclusion({
      bucketTimestamp: '2026-09-01T19:12:24.252Z',
      nextWindowFrom: '2026-09-01T19:12:25.500Z',
    });
    expect(classification).toBe('DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK');
    const { endMs } = bucketIntervalBoundsMs('2026-09-01T19:12:24.252Z');
    expect(endMs).toBeLessThanOrEqual(Date.parse('2026-09-01T19:12:25.500Z'));
  });

  it('classifies partial overlap when next window from falls inside bucket interval', () => {
    const classification = classifyWatermarkExclusion({
      bucketTimestamp: '2026-09-01T19:12:24.252Z',
      nextWindowFrom: '2026-09-01T19:12:24.800Z',
    });
    expect(classification).toBe('PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW');
  });

  it('classifies potentially requeryable when bucket starts at/after next window from', () => {
    const classification = classifyWatermarkExclusion({
      bucketTimestamp: '2026-09-01T19:12:26.000Z',
      nextWindowFrom: '2026-09-01T19:12:25.500Z',
    });
    expect(classification).toBe('POTENTIALLY_REQUERYABLE');
  });
});
