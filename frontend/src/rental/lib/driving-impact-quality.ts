export type DrivingImpactQualityHintKey =
  | 'partial'
  | 'stale'
  | 'legacyCompat'
  | 'unavailable'
  | 'r1Contained';

export type DrivingImpactQualityInput = {
  drivingStressScore?: number | null;
  scoreSource?: string | null;
  drivingImpactScoreSource?: string | null;
  drivingImpactAnalysisStatus?: string | null;
};

export function resolveDrivingImpactQualityHintKey(
  input: DrivingImpactQualityInput,
): DrivingImpactQualityHintKey | null {
  const source = input.drivingImpactScoreSource ?? input.scoreSource ?? null;
  if (source === 'r1_temporal_containment_unavailable') return 'r1Contained';
  if (source === 'vehicle_trip_compat') return 'legacyCompat';
  const status = input.drivingImpactAnalysisStatus;
  if (status === 'STALE') return 'stale';
  if (status === 'PARTIAL') return 'partial';
  if (input.drivingStressScore == null && source !== 'vehicle_trip_compat') {
    return 'unavailable';
  }
  return null;
}

export const DRIVING_IMPACT_QUALITY_I18N_KEY: Record<
  DrivingImpactQualityHintKey,
  `trips.drivingImpact.quality.${DrivingImpactQualityHintKey}`
> = {
  partial: 'trips.drivingImpact.quality.partial',
  stale: 'trips.drivingImpact.quality.stale',
  legacyCompat: 'trips.drivingImpact.quality.legacyCompat',
  unavailable: 'trips.drivingImpact.quality.unavailable',
  r1Contained: 'trips.drivingImpact.quality.r1Contained',
};
