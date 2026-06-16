import type { Station } from '../../lib/api';

export function selectableStations(stations: Station[]): Station[] {
  return stations.filter((s) => s.status === 'ACTIVE');
}

export function stationsForPickup(stations: Station[]): Station[] {
  return selectableStations(stations).filter((s) => s.pickupEnabled);
}

export function stationsForReturn(stations: Station[]): Station[] {
  return selectableStations(stations).filter((s) => s.returnEnabled);
}

export function resolveDefaultPickupStationId(
  stations: Station[],
  vehicleHomeStationId?: string | null,
): string | null {
  if (vehicleHomeStationId) {
    const home = stations.find((s) => s.id === vehicleHomeStationId);
    if (home && home.status === 'ACTIVE' && home.pickupEnabled) return home.id;
  }
  const primary = stations.find((s) => s.isPrimary && s.status === 'ACTIVE' && s.pickupEnabled);
  if (primary) return primary.id;
  const first = stationsForPickup(stations)[0];
  return first?.id ?? null;
}

export function isOneWayRental(
  pickupStationId: string | null | undefined,
  returnStationId: string | null | undefined,
): boolean {
  if (!pickupStationId || !returnStationId) return false;
  return pickupStationId !== returnStationId;
}

export type StationBookingWarning =
  | 'inactive'
  | 'archived'
  | 'pickupDisabled'
  | 'returnDisabled';

export function getStationWarnings(
  station: Station | undefined,
  purpose: 'pickup' | 'return',
): StationBookingWarning[] {
  if (!station) return [];
  const warnings: StationBookingWarning[] = [];
  if (station.status === 'ARCHIVED') warnings.push('archived');
  else if (station.status !== 'ACTIVE') warnings.push('inactive');
  if (purpose === 'pickup' && !station.pickupEnabled) warnings.push('pickupDisabled');
  if (purpose === 'return' && !station.returnEnabled) warnings.push('returnDisabled');
  return warnings;
}

export function stationLabel(station: Station): string {
  const city = station.city ? ` (${station.city})` : '';
  return `${station.name}${city}`;
}
