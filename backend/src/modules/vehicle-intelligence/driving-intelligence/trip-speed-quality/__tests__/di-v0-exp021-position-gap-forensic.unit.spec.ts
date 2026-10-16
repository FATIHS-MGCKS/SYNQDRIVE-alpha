import {
  analyzePositionGapForensic,
  classifyBucketStage,
} from '../di-v0-exp021-position-gap-forensic';
import type { DiV0TripSpeedQualityShadowRow } from '../build-di-v0-trip-speed-quality-projection.v1';

describe('analyzePositionGapForensic', () => {
  const window = { startLabel: '2026-01-01T00:00:00.000Z', endLabel: '2026-01-01T00:00:04.000Z' };

  it('counts missing buckets separately from POSITION_GAP-classified intervals', () => {
    const positions = [
      {
        bucketLabel: '2026-01-01T00:00:01.000Z',
        availability: 'PRESENT' as const,
        latitude: 52.5,
        longitude: 13.4,
        positionState: 'FRESH' as const,
      },
    ];
    const row = (iso: string): DiV0TripSpeedQualityShadowRow =>
      ({
        referenceTime: new Date(iso),
        estimatedSpeedKmh: null,
        speedEvidenceState: 'NONE',
        valueConfidence: 'HIGH',
        sourceRelation: 'AGREEING',
        motionState: 'MOVING_SPEED_UNKNOWN',
        positionState: 'FRESH',
        abstentionReason: null,
        sourceQualityFlags: [],
        evidenceSources: [],
      }) as DiV0TripSpeedQualityShadowRow;

    const shadowIntervals = [
      row('2026-01-01T00:00:01.000Z'),
      row('2026-01-01T00:00:02.000Z'),
      row('2026-01-01T00:00:03.000Z'),
    ];
    const result = analyzePositionGapForensic({
      shadowIntervals,
      positions,
      r1Obd: [],
      pinnedSnapshotHash: 'pin',
      acquisitionWindow: window,
    });
    expect(result.expectedBucketCount).toBe(4);
    expect(result.bucketStageCounts.EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP).toBeGreaterThan(0);
    expect(result.intervalPositionGapSeconds).toBeGreaterThanOrEqual(0);
    expect(classifyBucketStage('2026-01-01T00:00:02.000Z', new Map(), window)).toBe(
      'EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP',
    );
  });
});
