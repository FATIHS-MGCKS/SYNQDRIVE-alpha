import {
  classifyNoNumericDisjointV1,
  classifyNoNumericDisjointV2,
  buildTimeSegmentStats,
  countPositionBucketAvailability,
  diagnosePositionGapAtLabel,
  isConsecutiveSecond,
} from '../di-v0-p21-r3-forensic-classify';
import type { DiV0TripSpeedQualityShadowRow } from '../build-di-v0-trip-speed-quality-projection.v1';

const window = { startLabel: '2026-01-01T00:00:00Z', endLabel: '2026-01-01T00:00:02Z' };

function shadowRow(
  ref: string,
  partial: Partial<DiV0TripSpeedQualityShadowRow> = {},
): DiV0TripSpeedQualityShadowRow {
  return {
    intervalStart: new Date(ref),
    intervalEnd: new Date(Date.parse(ref) + 1000),
    referenceTime: new Date(ref),
    motionState: 'TRANSITION_UNCERTAIN',
    positionState: 'FRESH',
    estimatedSpeedKmh: null,
    speedEvidenceState: 'ABSTAINED',
    valueConfidence: 'UNAVAILABLE',
    sourceRelation: 'UNSUPPORTED',
    abstentionReason: 'HOLD',
    evidenceSources: [],
    sourceQualityFlags: [],
    ...partial,
  };
}

describe('P21 R3 forensic classification', () => {
  it('V2 separates window edge from missing bucket inside window', () => {
    const pos = new Map([
      [
        '2026-01-01T00:00:00Z',
        {
          bucketLabel: '2026-01-01T00:00:00Z',
          availability: 'PRESENT' as const,
          latitude: 52,
          longitude: 9,
          positionState: 'FRESH' as const,
        },
      ],
      [
        '2026-01-01T00:00:01Z',
        {
          bucketLabel: '2026-01-01T00:00:01Z',
          availability: 'PRESENT' as const,
          latitude: 52,
          longitude: 9,
          positionState: 'FRESH' as const,
        },
      ],
    ]);
    const edge = shadowRow('2026-01-01T00:00:00Z');
    expect(classifyNoNumericDisjointV2(edge, pos, window)).toContain('WINDOW_EDGE_OUTSIDE_ACQUISITION');
    expect(diagnosePositionGapAtLabel('2025-12-31T23:59:59Z', pos, window)).toBe(
      'WINDOW_EDGE_OUTSIDE_ACQUISITION',
    );
  });

  it('V1 lumps missing neighbor with ROW_ABSENT; V2 can classify MISSING_BUCKET_INSIDE_WINDOW', () => {
    const pos = new Map([
      [
        '2026-01-01T00:00:01Z',
        {
          bucketLabel: '2026-01-01T00:00:01Z',
          availability: 'ROW_ABSENT' as const,
          positionState: 'FRESH' as const,
        },
      ],
    ]);
    const row = shadowRow('2026-01-01T00:00:01Z');
    expect(classifyNoNumericDisjointV1(row, pos)).toBe('ROW_ABSENT_OR_SIGNAL_NULL_GAP');
    expect(classifyNoNumericDisjointV2(row, pos, window)).toBe('POS_GAP_MISSING_BUCKET_INSIDE_WINDOW');
  });

  it('time segment stats require consecutive seconds', () => {
    const a = new Date('2026-01-01T00:00:00Z');
    const b = new Date('2026-01-01T00:00:01Z');
    const c = new Date('2026-01-01T00:00:03Z');
    expect(isConsecutiveSecond(a, b)).toBe(true);
    expect(isConsecutiveSecond(b, c)).toBe(false);
    const stats = buildTimeSegmentStats([
      { referenceTime: a, classLabel: 'X' },
      { referenceTime: b, classLabel: 'X' },
      { referenceTime: c, classLabel: 'X' },
    ]);
    expect(stats.segmentCount).toBe(2);
    expect(stats.longestRunSeconds).toBe(2);
  });

  it('counts true missing buckets separately from interval impact', () => {
    const pos = new Map([
      [
        '2026-01-01T00:00:00Z',
        {
          bucketLabel: '2026-01-01T00:00:00Z',
          availability: 'ROW_ABSENT' as const,
          positionState: 'FRESH' as const,
        },
      ],
      [
        '2026-01-01T00:00:01Z',
        {
          bucketLabel: '2026-01-01T00:00:01Z',
          availability: 'PRESENT' as const,
          latitude: 52,
          longitude: 9,
          positionState: 'FRESH' as const,
        },
      ],
      [
        '2026-01-01T00:00:02Z',
        {
          bucketLabel: '2026-01-01T00:00:02Z',
          availability: 'SIGNAL_NULL' as const,
          positionState: 'FRESH' as const,
        },
      ],
    ]);
    const stats = countPositionBucketAvailability(pos, window);
    expect(stats.expectedBuckets).toBe(3);
    expect(stats.rowAbsentBuckets).toBe(1);
    expect(stats.signalNullBuckets).toBe(1);
    expect(stats.presentWithCoords).toBe(1);
  });
});
