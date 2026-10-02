import type { ChargingStationResolveInput } from './charging-station-location.types';

export function isValidChargingStationCoordinateInput(
  input: ChargingStationResolveInput,
): boolean {
  const { latitude, longitude } = input;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }
  if (latitude < -90 || latitude > 90) {
    return false;
  }
  if (longitude < -180 || longitude > 180) {
    return false;
  }
  return true;
}
