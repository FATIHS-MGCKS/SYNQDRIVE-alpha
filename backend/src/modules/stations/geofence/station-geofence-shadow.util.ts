export type GeofenceShadowState = 'HOME' | 'AWAY' | 'UNKNOWN';

export interface GeofenceShadowDto {
  state: GeofenceShadowState;
  distanceMeters: number | null;
}

/** Read-only shadow evaluation — never writes currentStationId (GEO-03). */
export function evaluateGeofenceShadow(input: {
  stationLatitude: number | null;
  stationLongitude: number | null;
  radiusMeters: number | null;
  vehicleLatitude: number | null;
  vehicleLongitude: number | null;
}): GeofenceShadowDto {
  const { stationLatitude, stationLongitude, radiusMeters, vehicleLatitude, vehicleLongitude } =
    input;

  if (
    stationLatitude == null ||
    stationLongitude == null ||
    vehicleLatitude == null ||
    vehicleLongitude == null
  ) {
    return { state: 'UNKNOWN', distanceMeters: null };
  }

  const radius = radiusMeters ?? 100;
  const distanceMeters = haversineMeters(
    stationLatitude,
    stationLongitude,
    vehicleLatitude,
    vehicleLongitude,
  );

  return {
    state: distanceMeters <= radius ? 'HOME' : 'AWAY',
    distanceMeters: Math.round(distanceMeters),
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
