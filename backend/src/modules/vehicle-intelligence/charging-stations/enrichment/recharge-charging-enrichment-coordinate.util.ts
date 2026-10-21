export interface RechargeCoordinatePair {
  latitude: number;
  longitude: number;
}

export function isValidRechargeCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): latitude is number {
  if (latitude == null || longitude == null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

export function parseRechargeCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): RechargeCoordinatePair | null {
  if (!isValidRechargeCoordinatePair(latitude, longitude)) return null;
  return { latitude: latitude as number, longitude: longitude as number };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function rechargeLocationSpreadMeters(
  start: RechargeCoordinatePair,
  end: RechargeCoordinatePair,
): number {
  return haversineMeters(start.latitude, start.longitude, end.latitude, end.longitude);
}
