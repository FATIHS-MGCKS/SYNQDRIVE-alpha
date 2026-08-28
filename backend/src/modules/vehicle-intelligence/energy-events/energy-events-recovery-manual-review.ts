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
  if (reasons.includes('fuel_signal_contradiction')) {
    return 'NEEDS_FURTHER_EVIDENCE';
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
        'same_id_material_payload_mismatch',
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

function buildTelemetryEvidenceNotes(
  candidate: EnergyRecoveryCandidate,
): string[] {
  const notes: string[] = [];
  if (candidate.mechanism === 'refuel' && candidate.durationSeconds > 2 * 60 * 60) {
    notes.push('long_duration_refuel_review_odometer_and_stationary_evidence');
  }
  if (
    candidate.odometerStartKm != null &&
    candidate.odometerEndKm != null &&
    Math.abs(candidate.odometerEndKm - candidate.odometerStartKm) > 5
  ) {
    notes.push(
      `odometer_delta_km=${Math.abs(candidate.odometerEndKm - candidate.odometerStartKm).toFixed(1)}`,
    );
  }
  if (
    candidate.fuelDeltaLiters != null &&
    candidate.fuelDeltaPercent != null
  ) {
    notes.push(
      `fuel_delta_liters=${candidate.fuelDeltaLiters} fuel_delta_percent=${candidate.fuelDeltaPercent}`,
    );
  }
  if (candidate.manualReviewReasons.includes('fuel_signal_contradiction')) {
    notes.push('relative_and_absolute_fuel_signals_contradictory');
  }
  return notes;
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
      odometerDeltaKm:
        candidate.odometerStartKm != null && candidate.odometerEndKm != null
          ? Math.abs(candidate.odometerEndKm - candidate.odometerStartKm)
          : null,
      confidence: candidate.confidence,
      plausibilityReasons: candidate.manualReviewReasons,
      telemetryEvidenceNotes: buildTelemetryEvidenceNotes(candidate),
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
