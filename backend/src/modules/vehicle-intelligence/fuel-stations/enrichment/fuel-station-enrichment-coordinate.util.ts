import type { VehicleEnergyEvent } from '@prisma/client';

export const FUEL_STATION_ENRICHMENT_COORDINATE_SOURCE = 'energy_event_start' as const;

export interface CanonicalFuelStationCoordinate {
  latitude: number;
  longitude: number;
  source: typeof FUEL_STATION_ENRICHMENT_COORDINATE_SOURCE;
}

/**
 * V1 coordinate policy: use the same start coordinate shown in the trip timeline
 * (`startLatitude` / `startLongitude`). Do not infer from end coords or routes.
 */
export function deriveCanonicalFuelStationCoordinate(
  event: Pick<VehicleEnergyEvent, 'startLatitude' | 'startLongitude'>,
): CanonicalFuelStationCoordinate | null {
  const { startLatitude, startLongitude } = event;
  if (
    startLatitude == null ||
    startLongitude == null ||
    !Number.isFinite(startLatitude) ||
    !Number.isFinite(startLongitude) ||
    startLatitude < -90 ||
    startLatitude > 90 ||
    startLongitude < -180 ||
    startLongitude > 180
  ) {
    return null;
  }

  return {
    latitude: startLatitude,
    longitude: startLongitude,
    source: FUEL_STATION_ENRICHMENT_COORDINATE_SOURCE,
  };
}
