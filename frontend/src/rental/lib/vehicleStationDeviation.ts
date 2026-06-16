import type { Station } from '../../lib/api';
import { isVehicleAtHomeStation } from '../../lib/geospatial';

export type VehicleStationDeviation =
  | 'at_home'
  | 'away_from_home'
  | 'unknown'
  | 'no_home_station'
  | 'missing_gps';

export interface VehicleStationContext {
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Read-only helper for operational hints — never auto-flags misuse.
 */
export function describeVehicleStationDeviation(
  vehicle: VehicleStationContext,
  stationsById: Map<string, Station>,
): { deviation: VehicleStationDeviation; hint: string | null } {
  if (!vehicle.homeStationId) {
    return { deviation: 'no_home_station', hint: 'Keine Heimatstation zugewiesen' };
  }
  const home = stationsById.get(vehicle.homeStationId);
  if (!home) {
    return { deviation: 'unknown', hint: 'Heimatstation nicht gefunden' };
  }
  if (vehicle.latitude == null || vehicle.longitude == null) {
    return { deviation: 'missing_gps', hint: 'Keine aktuelle GPS-Position' };
  }
  const atHome = isVehicleAtHomeStation(
    { latitude: vehicle.latitude, longitude: vehicle.longitude },
    {
      latitude: home.latitude,
      longitude: home.longitude,
      radiusMeters: home.radiusMeters ?? home.geofenceRadiusMeters,
    },
  );
  if (atHome === true) return { deviation: 'at_home', hint: null };
  if (atHome === false) {
    if (
      vehicle.currentStationId &&
      vehicle.currentStationId !== vehicle.homeStationId
    ) {
      const current = stationsById.get(vehicle.currentStationId);
      return {
        deviation: 'away_from_home',
        hint: current
          ? `Aktuelle Station: ${current.name}`
          : 'Fahrzeug nicht an Heimatstation',
      };
    }
    return { deviation: 'away_from_home', hint: 'Außerhalb der Heimatstation' };
  }
  return { deviation: 'unknown', hint: 'Geofence-Status unbekannt (Koordinaten/Radius prüfen)' };
}
