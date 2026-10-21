export type FuelStationEnrichmentCutoverState = 'missing' | 'invalid' | 'valid';

export interface FuelStationEnrichmentCutoverConfig {
  cutoverAt: Date | null;
  cutoverState: FuelStationEnrichmentCutoverState;
}

/**
 * Canonical cutover authority: VehicleEnergyEvent.startTime (event occurrence),
 * not database createdAt. Read-only — does not mutate Energy Events.
 */
export function isFuelStationEnrichmentEventAfterCutover(
  eventStartTime: Date,
  cutoverAt: Date | null,
): boolean {
  if (!cutoverAt) return false;
  return eventStartTime.getTime() >= cutoverAt.getTime();
}

export function hasValidFuelStationEnrichmentCutover(
  cutover: Pick<FuelStationEnrichmentCutoverConfig, 'cutoverAt' | 'cutoverState'>,
): boolean {
  return cutover.cutoverState === 'valid' && cutover.cutoverAt instanceof Date;
}

export function describeFuelStationEnrichmentCutoverMisconfiguration(
  cutoverState: FuelStationEnrichmentCutoverState,
): string {
  if (cutoverState === 'invalid') {
    return 'FUEL_STATION_ENRICHMENT_CUTOVER_AT is set but invalid';
  }
  return 'FUEL_STATION_ENRICHMENT_CUTOVER_AT is required but missing';
}
