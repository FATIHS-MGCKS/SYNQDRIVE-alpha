import {
  applyManualReviewOverrides,
  buildManualReviewFingerprint,
  E3A_RESOLVED_MANUAL_REVIEW_DISPOSITIONS,
  summarizeManualReviewDispositions,
} from './energy-events-recovery-manual-review-overrides';
import type { ManualReviewEntry } from './energy-events-recovery.types';

function entry(
  overrides: Partial<ManualReviewEntry> & Pick<ManualReviewEntry, 'plausibilityReasons' | 'confidence'>,
): ManualReviewEntry {
  return {
    vehicle: 'alias-only',
    tokenId: 100001,
    mechanism: 'refuel',
    startTime: '2026-07-19T03:50:00.000Z',
    endTime: '2026-07-19T03:58:00.000Z',
    durationSeconds: 480,
    fuelDeltaLiters: 3,
    fuelDeltaPercent: 52,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerDeltaKm: 18,
    telemetryEvidenceNotes: [],
    overlapRelation: null,
    existingDbRelation: null,
    existingRowId: null,
    dimoSegmentId: 'private-segment-id',
    recommendation: 'NEEDS_FURTHER_EVIDENCE',
    ...overrides,
  };
}

describe('energy-events recovery manual-review overrides', () => {
  it('builds a privacy-safe fingerprint from bucketed evidence only', () => {
    const fingerprint = buildManualReviewFingerprint(
      entry({
        confidence: 'MEDIUM',
        plausibilityReasons: [
          'fuel_signal_contradiction',
          'refuel_odometer_movement_during_event',
        ],
      }),
    );

    expect(fingerprint).toBe(
      'refuel|2026-07|under_15m|11_to_50km|under_10L|MEDIUM|fuel_signal_contradiction|refuel_odometer_movement_during_event',
    );
    expect(fingerprint).not.toMatch(/\b\d{5,}\b/);
  });

  it('resolves both ICE_A July NEEDS cases to EXCLUDE_FROM_BACKFILL', () => {
    const unresolved = [
      entry({
        confidence: 'MEDIUM',
        plausibilityReasons: [
          'fuel_signal_contradiction',
          'refuel_odometer_movement_during_event',
        ],
      }),
      entry({
        confidence: 'LOW',
        startTime: '2026-07-20T01:00:00.000Z',
        endTime: '2026-07-20T01:08:00.000Z',
        fuelDeltaLiters: 2,
        fuelDeltaPercent: 53,
        odometerDeltaKm: 25,
        plausibilityReasons: ['refuel_odometer_movement_during_event'],
      }),
    ];

    const resolved = applyManualReviewOverrides(unresolved);
    const counts = summarizeManualReviewDispositions(resolved);

    expect(resolved).toHaveLength(2);
    expect(counts.EXCLUDE_FROM_BACKFILL).toBe(2);
    expect(counts.NEEDS_FURTHER_EVIDENCE).toBe(0);
    expect(
      resolved.every((item) =>
        item.telemetryEvidenceNotes.some((note) =>
          note.startsWith('human_review_evidence_category:'),
        ),
      ),
    ).toBe(true);
  });

  it('does not override unrelated manual-review entries', () => {
    const unrelated = entry({
      confidence: 'HIGH',
      durationSeconds: 3 * 60 * 60,
      fuelDeltaLiters: 20,
      fuelDeltaPercent: 40,
      odometerDeltaKm: 120,
      plausibilityReasons: [
        'refuel_duration_very_long',
        'refuel_high_odometer_movement',
      ],
    });

    const [resolved] = applyManualReviewOverrides([unrelated]);
    expect(resolved.recommendation).toBe('NEEDS_FURTHER_EVIDENCE');
  });

  it('documents exactly two E3A human-reviewed dispositions', () => {
    expect(E3A_RESOLVED_MANUAL_REVIEW_DISPOSITIONS).toHaveLength(2);
    expect(
      E3A_RESOLVED_MANUAL_REVIEW_DISPOSITIONS.every(
        (item) => item.disposition === 'EXCLUDE_FROM_BACKFILL',
      ),
    ).toBe(true);
  });
});
