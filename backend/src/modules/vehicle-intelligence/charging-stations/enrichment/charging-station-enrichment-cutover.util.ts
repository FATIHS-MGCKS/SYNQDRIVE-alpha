export type ChargingStationEnrichmentCutoverState = 'missing' | 'invalid' | 'valid';

export function describeChargingStationEnrichmentCutoverMisconfiguration(
  cutoverState: ChargingStationEnrichmentCutoverState,
): string {
  switch (cutoverState) {
    case 'missing':
      return 'CHARGING_STATION_ENRICHMENT_CUTOVER_AT is missing';
    case 'invalid':
      return 'CHARGING_STATION_ENRICHMENT_CUTOVER_AT is invalid';
    default:
      return 'unknown';
  }
}

export function hasValidChargingStationEnrichmentCutover(input: {
  cutoverAt: Date | null;
  cutoverState: ChargingStationEnrichmentCutoverState;
}): boolean {
  return input.cutoverState === 'valid' && input.cutoverAt != null;
}

/** Cutover boundary: physical recharge evidence end on canonical VEE. */
export function isChargingStationEnrichmentEventAfterCutover(
  eventEndTime: Date,
  cutoverAt: Date,
): boolean {
  return eventEndTime.getTime() >= cutoverAt.getTime();
}
