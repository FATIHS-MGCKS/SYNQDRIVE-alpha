import type {
  EnergyRecoveryCandidate,
  ManualReviewDisposition,
  ManualReviewEntry,
} from './energy-events-recovery.types';

export function deriveManualReviewDisposition(
  reasons: string[],
): ManualReviewDisposition {
  if (reasons.some((reason) => reason.includes('implausibly_large'))) {
    return 'EXCLUDE_FROM_BACKFILL';
  }
  if (
    reasons.some((reason) =>
      [
        'refuel_missing_fuel_evidence',
        'recharge_soc_impossible',
        'recharge_soc_energy_contradiction',
        'overlapping_duplicate_session',
        'cross_window_overlapping_different_id',
        'existing_db_overlap_different_id',
      ].includes(reason),
    )
  ) {
    return 'NEEDS_FURTHER_EVIDENCE';
  }
  if (reasons.includes('refuel_duration_very_long')) {
    return 'NEEDS_FURTHER_EVIDENCE';
  }
  if (reasons.includes('refuel_odometer_movement_during_event')) {
    return 'NEEDS_FURTHER_EVIDENCE';
  }
  return 'NEEDS_FURTHER_EVIDENCE';
}

export function buildManualReviewReport(
  candidates: EnergyRecoveryCandidate[],
): ManualReviewEntry[] {
  return candidates
    .filter((candidate) => candidate.classification === 'MANUAL_REVIEW_REQUIRED')
    .map((candidate) => ({
      vehicle: candidate.label,
      tokenId: candidate.tokenId,
      mechanism: candidate.mechanism,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      durationSeconds: candidate.durationSeconds,
      fuelDeltaLiters: candidate.fuelDeltaLiters,
      fuelDeltaPercent: candidate.fuelDeltaPercent,
      socDeltaPercent: candidate.socDeltaPercent,
      energyDeltaKwh: candidate.energyDeltaKwh,
      confidence: candidate.confidence,
      plausibilityReasons: candidate.manualReviewReasons,
      overlapRelation: candidate.overlapRelation ?? null,
      existingDbRelation: candidate.existingDbRelation ?? null,
      existingRowId: candidate.existingRowId,
      dimoSegmentId: candidate.dimoSegmentId,
      recommendation: deriveManualReviewDisposition(candidate.manualReviewReasons),
    }));
}

export function allManualReviewsResolved(
  entries: ManualReviewEntry[],
): boolean {
  return entries.every(
    (entry) => entry.recommendation === 'APPROVE_FOR_BACKFILL',
  );
}
