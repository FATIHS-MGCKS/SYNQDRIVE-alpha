import { partitionTripIntervalsV2 } from '../di-v0-exp021-coverage-interval-partition';
import type { DiV0TripSpeedQualityShadowRow } from '../build-di-v0-trip-speed-quality-projection.v1';

function row(partial: Partial<DiV0TripSpeedQualityShadowRow> & { referenceTime: Date }): DiV0TripSpeedQualityShadowRow {
  return {
    referenceTime: partial.referenceTime,
    estimatedSpeedKmh: partial.estimatedSpeedKmh ?? null,
    speedEvidenceState: partial.speedEvidenceState ?? 'NONE',
    valueConfidence: partial.valueConfidence ?? 'HIGH',
    sourceRelation: partial.sourceRelation ?? 'AGREEING',
    motionState: partial.motionState ?? 'MOVING_SPEED_UNKNOWN',
    positionState: partial.positionState ?? 'FRESH',
    abstentionReason: partial.abstentionReason ?? null,
    sourceQualityFlags: partial.sourceQualityFlags ?? [],
    evidenceSources: partial.evidenceSources ?? [],
    intervalStart: partial.intervalStart,
    intervalEnd: partial.intervalEnd,
  } as DiV0TripSpeedQualityShadowRow;
}

describe('partitionTripIntervalsV2', () => {
  const window = { startLabel: '2026-01-01T00:00:00.000Z', endLabel: '2026-01-01T00:00:05.000Z' };
  const positions = [
    {
      bucketLabel: '2026-01-01T00:00:01.000Z',
      availability: 'PRESENT' as const,
      latitude: 52.5,
      longitude: 13.4,
      positionState: 'FRESH' as const,
    },
  ];

  it('primary buckets are disjoint and sum to interval count', () => {
    const t = new Date('2026-01-01T00:00:01.000Z');
    const shadowIntervals = [
      row({
        referenceTime: t,
        estimatedSpeedKmh: 40,
        motionState: 'MOVING_SPEED_KNOWN',
        speedEvidenceState: 'NUMERIC',
      }),
      row({
        referenceTime: new Date('2026-01-01T00:00:02.000Z'),
        estimatedSpeedKmh: null,
        motionState: 'STATIONARY_SUPPORTED',
        speedEvidenceState: 'STATIONARY_BAND',
        positionState: 'FRESH',
      }),
    ];
    const { summary } = partitionTripIntervalsV2({
      shadowIntervals,
      positions,
      r1Obd: [],
      pinnedSnapshotHash: 'abc',
      acquisitionWindow: window,
    });
    const sum =
      summary.primarySeconds.TRUSTED_NUMERIC +
      summary.primarySeconds.NUMERIC_QC_WITHHELD +
      summary.primarySeconds.ACCEPTED_STATIONARY_NULL +
      summary.primarySeconds.NO_NUMERIC_SPEED;
    expect(sum).toBe(summary.intervalCount);
  });

});
