export type DrivingImpactQualityHintKey =
  | 'partial'
  | 'stale'
  | 'pending'
  | 'failed'
  | 'unsupported'
  | 'legacyCompat'
  | 'unavailable'
  | 'r1Contained';

export type DrivingImpactQualityInput = {
  drivingStressScore?: number | null;
  scoreSource?: string | null;
  drivingImpactScoreSource?: string | null;
  drivingImpactAnalysisStatus?: string | null;
};

/** Ordered quality hints: analysis status, then legacy mirror provenance, then missing score. */
export function resolveDrivingImpactQualityHintKeys(
  input: DrivingImpactQualityInput,
): DrivingImpactQualityHintKey[] {
  const source = input.drivingImpactScoreSource ?? input.scoreSource ?? null;
  if (source === 'r1_temporal_containment_unavailable') {
    return ['r1Contained'];
  }

  const keys: DrivingImpactQualityHintKey[] = [];
  const status = input.drivingImpactAnalysisStatus;

  switch (status) {
    case 'STALE':
      keys.push('stale');
      break;
    case 'PARTIAL':
      keys.push('partial');
      break;
    case 'PENDING':
      keys.push('pending');
      break;
    case 'FAILED':
      keys.push('failed');
      break;
    case 'UNSUPPORTED':
      keys.push('unsupported');
      break;
    default:
      break;
  }

  if (source === 'vehicle_trip_compat') {
    keys.push('legacyCompat');
  }

  if (
    keys.length === 0 &&
    input.drivingStressScore == null &&
    source !== 'vehicle_trip_compat'
  ) {
    keys.push('unavailable');
  }

  return keys;
}

export const DRIVING_IMPACT_QUALITY_I18N_KEY: Record<
  DrivingImpactQualityHintKey,
  `trips.drivingImpact.quality.${DrivingImpactQualityHintKey}`
> = {
  partial: 'trips.drivingImpact.quality.partial',
  stale: 'trips.drivingImpact.quality.stale',
  pending: 'trips.drivingImpact.quality.pending',
  failed: 'trips.drivingImpact.quality.failed',
  unsupported: 'trips.drivingImpact.quality.unsupported',
  legacyCompat: 'trips.drivingImpact.quality.legacyCompat',
  unavailable: 'trips.drivingImpact.quality.unavailable',
  r1Contained: 'trips.drivingImpact.quality.r1Contained',
};
