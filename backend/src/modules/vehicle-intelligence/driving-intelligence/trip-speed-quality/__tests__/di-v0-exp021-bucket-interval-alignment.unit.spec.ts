import {
  buildBucketIntervalAlignmentReport,
  countPinPositionStatesInWindow,
  halfOpenWindowFromInclusiveEnd,
} from '../di-v0-exp021-bucket-interval-alignment';
import type { DiV0TripSpeedQualityShadowRow } from '../build-di-v0-trip-speed-quality-projection.v1';

describe('buildBucketIntervalAlignmentReport', () => {
  const window = { startLabel: '2026-01-01T00:00:00Z', endLabel: '2026-01-01T00:00:10Z' };

  const shadowRow = (iso: string): DiV0TripSpeedQualityShadowRow =>
    ({
      referenceTime: new Date(iso),
      estimatedSpeedKmh: null,
      speedEvidenceState: 'NONE',
      valueConfidence: 'HIGH',
      sourceRelation: 'AGREEING',
      motionState: 'MOVING_SPEED_UNKNOWN',
      positionState: 'ROW_ABSENT',
      abstentionReason: null,
      sourceQualityFlags: [],
      evidenceSources: [],
    }) as DiV0TripSpeedQualityShadowRow;

  it('reconciles extra POSITION_GAP intervals vs ROW_ABSENT buckets via duplicate shadow center labels', () => {
    const positions = [
      { bucketLabel: '2026-01-01T00:00:02Z', availability: 'ROW_ABSENT' as const, positionState: 'ROW_ABSENT' as const },
      { bucketLabel: '2026-01-01T00:00:03Z', availability: 'ROW_ABSENT' as const, positionState: 'ROW_ABSENT' as const },
      { bucketLabel: '2026-01-01T00:00:04Z', availability: 'PRESENT' as const, latitude: 52.5, longitude: 13.4, positionState: 'FRESH' as const },
    ];
    const shadowIntervals = [
      shadowRow('2026-01-01T00:00:02.000Z'),
      shadowRow('2026-01-01T00:00:02.000Z'),
      shadowRow('2026-01-01T00:00:03.000Z'),
    ];
    const report = buildBucketIntervalAlignmentReport({
      shadowIntervals,
      positions,
      r1Obd: [],
      pinnedSnapshotHash: 'pin',
      acquisitionWindow: window,
    });
    expect(report.reconciliation.rowAbsentBucketsInAcquisitionWindow).toBe(2);
    expect(report.reconciliation.positionGapIntervalSeconds).toBe(3);
    expect(report.reconciliation.uniqueCenterLabelsAmongPositionGapIntervals).toBe(2);
    expect(report.reconciliation.duplicateIntervalRowsOnRowAbsentCenters).toBe(1);
    expect(report.shadowGrid.duplicateCenterLabelExtraRows).toBe(1);
  });
});

describe('countPinPositionStatesInWindow', () => {
  it('uses half-open window for inclusive end mark', () => {
    const half = halfOpenWindowFromInclusiveEnd('2026-10-14T14:55:43Z', '2026-10-14T14:55:44Z');
    expect(half.endExclusive).toBe('2026-10-14T14:55:45Z');
    const counts = countPinPositionStatesInWindow(
      [
        { bucketLabel: '2026-10-14T14:55:43Z', availability: 'ROW_ABSENT', positionState: 'ROW_ABSENT' },
        { bucketLabel: '2026-10-14T14:55:44Z', availability: 'PRESENT', latitude: 1, longitude: 2, positionState: 'FRESH' },
      ],
      '2026-10-14T14:55:43Z',
      '2026-10-14T14:55:44Z',
      { startLabel: '2026-10-14T14:55:00Z', endLabel: '2026-10-14T15:00:00Z' },
    );
    expect(counts.expectedLabelsInWindow).toBe(2);
    expect(counts.rowAbsentExplicit).toBe(1);
    expect(counts.presentValidCoordinates).toBe(1);
  });
});
