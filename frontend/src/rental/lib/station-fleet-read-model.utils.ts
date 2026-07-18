import type {
  StationFleetGroupKey,
  StationFleetGroupSection,
  StationFleetReadModel,
  StationFleetStationRef,
} from '../../lib/api';

export const STATION_FLEET_GROUP_ORDER: readonly StationFleetGroupKey[] = [
  'on_site',
  'home_fleet_away',
  'foreign_on_site',
  'expected',
  'currently_rented',
];

export function formatFleetStationRef(
  station: StationFleetStationRef | null,
  fallback = '—',
): string {
  if (!station) return fallback;
  if (station.code) return `${station.name} (${station.code})`;
  return station.name;
}

export function formatFleetConfirmationAt(
  value: string | null,
  locale: string,
): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function fleetHasAnyVehicles(model: StationFleetReadModel | null | undefined): boolean {
  if (!model) return false;
  return model.groups.some((group) => group.total > 0);
}

export function mergeFleetGroupPage(
  current: StationFleetReadModel | null,
  incoming: StationFleetReadModel,
  groupKey: StationFleetGroupKey,
): StationFleetReadModel {
  if (!current || current.stationId !== incoming.stationId) return incoming;

  const incomingGroup = incoming.groups.find((group) => group.key === groupKey);
  if (!incomingGroup) return incoming;

  const groups = current.groups.map((group) =>
    group.key === groupKey ? incomingGroup : group,
  );

  return {
    ...incoming,
    groups,
  };
}

export function getFleetGroupSection(
  model: StationFleetReadModel | null,
  key: StationFleetGroupKey,
): StationFleetGroupSection | null {
  return model?.groups.find((group) => group.key === key) ?? null;
}

export function fleetSearchIsActive(search: string): boolean {
  return search.trim().length > 0;
}
