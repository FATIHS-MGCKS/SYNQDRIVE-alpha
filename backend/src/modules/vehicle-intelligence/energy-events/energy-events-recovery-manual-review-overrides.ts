import type {
  ManualReviewDisposition,
  ManualReviewEntry,
} from './energy-events-recovery.types';
import {
  durationBucket,
  fuelDeltaBucket,
  odometerDeltaBucket,
} from './energy-events-recovery-artifact-sanitize';

/**
 * Privacy-safe manual-review override key. Uses only bucketed evidence already
 * present in sanitized artifacts — never tokenIds, plates, segment ids, or GPS.
 */
export function buildManualReviewFingerprint(entry: ManualReviewEntry): string {
  const reasons = [...entry.plausibilityReasons].sort();
  return [
    entry.mechanism,
    entry.startTime.slice(0, 7),
    durationBucket(entry.durationSeconds),
    odometerDeltaBucket(entry.odometerDeltaKm) ?? 'null',
    fuelDeltaBucket(entry.fuelDeltaLiters) ?? 'null',
    entry.confidence,
    ...reasons,
  ].join('|');
}

export interface ResolvedManualReviewDisposition {
  fingerprint: string;
  disposition: Exclude<ManualReviewDisposition, 'NEEDS_FURTHER_EVIDENCE'>;
  evidenceCategory: string;
}

/**
 * Human-reviewed dispositions from secured production telemetry inspection
 * (Aug 2026). Both ICE_A July under-15m refuel candidates were excluded after
 * bounded raw-signal analysis showed continuous driving with no stationary
 * refuel interval and no sustained discrete fuel step.
 */
export const E3A_RESOLVED_MANUAL_REVIEW_DISPOSITIONS: ResolvedManualReviewDisposition[] =
  [
    {
      fingerprint: [
        'refuel',
        '2026-07',
        'under_15m',
        '11_to_50km',
        'under_10L',
        'MEDIUM',
        'fuel_signal_contradiction',
        'refuel_odometer_movement_during_event',
      ].join('|'),
      disposition: 'EXCLUDE_FROM_BACKFILL',
      evidenceCategory:
        'continuous_driving_irreconcilable_fuel_signals_no_stationary_refuel',
    },
    {
      fingerprint: [
        'refuel',
        '2026-07',
        'under_15m',
        '11_to_50km',
        'under_10L',
        'LOW',
        'refuel_odometer_movement_during_event',
      ].join('|'),
      disposition: 'EXCLUDE_FROM_BACKFILL',
      evidenceCategory:
        'dimo_segment_padding_unsustained_micro_fuel_bump_during_driving',
    },
  ];

const OVERRIDE_BY_FINGERPRINT = new Map(
  E3A_RESOLVED_MANUAL_REVIEW_DISPOSITIONS.map((override) => [
    override.fingerprint,
    override,
  ]),
);

export function applyManualReviewOverrides(
  entries: ManualReviewEntry[],
  overrides: ResolvedManualReviewDisposition[] = E3A_RESOLVED_MANUAL_REVIEW_DISPOSITIONS,
): ManualReviewEntry[] {
  const overrideMap = new Map(
    overrides.map((override) => [override.fingerprint, override]),
  );

  return entries.map((entry) => {
    const override =
      overrideMap.get(buildManualReviewFingerprint(entry)) ??
      OVERRIDE_BY_FINGERPRINT.get(buildManualReviewFingerprint(entry));
    if (!override) return entry;
    return {
      ...entry,
      recommendation: override.disposition,
      telemetryEvidenceNotes: [
        ...entry.telemetryEvidenceNotes,
        `human_review_evidence_category:${override.evidenceCategory}`,
      ],
    };
  });
}

export function summarizeManualReviewDispositions(
  entries: ManualReviewEntry[],
): Record<ManualReviewDisposition, number> {
  return entries.reduce(
    (counts, entry) => {
      counts[entry.recommendation] += 1;
      return counts;
    },
    {
      APPROVE_FOR_BACKFILL: 0,
      EXCLUDE_FROM_BACKFILL: 0,
      NEEDS_FURTHER_EVIDENCE: 0,
    },
  );
}
