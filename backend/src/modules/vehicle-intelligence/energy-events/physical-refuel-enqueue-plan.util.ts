import type { VehicleEnergyEventFuelStationEnrichment } from '@prisma/client';
import { isV2StaleEnrichmentRecoverable } from '../fuel-stations/enrichment/fuel-station-enrichment-stale.util';

export function shouldIncludeRefuelInEnqueuePlan(params: {
  fuelStationEnrichment: VehicleEnergyEventFuelStationEnrichment | null | undefined;
  enrichmentEnqueuedAt: Date | null | undefined;
  asOfMs: number;
}): boolean {
  if (isV2StaleEnrichmentRecoverable(params.fuelStationEnrichment, params.asOfMs)) {
    return true;
  }
  if (params.fuelStationEnrichment) return false;
  if (params.enrichmentEnqueuedAt) return false;
  return true;
}
