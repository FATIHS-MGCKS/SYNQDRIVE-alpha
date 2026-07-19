import type { FleetConnectivityListItem, OverallConnectivityState } from '../../../lib/api';

export type FleetConnectivityKpiFilter =
  | 'all'
  | 'action_required'
  | 'telemetry_active'
  | 'standby'
  | 'no_data_source';

export type FleetConnectivityStateFilter = 'all' | OverallConnectivityState;

export function listItemSearchHaystack(item: FleetConnectivityListItem): string {
  const v = item.vehicle;
  return [v.licensePlate, v.make, v.model, v.station, String(v.year ?? '')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function matchesKpiFilter(
  item: FleetConnectivityListItem,
  filter: FleetConnectivityKpiFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'telemetry_active') return item.overallState === 'TELEMETRY_ACTIVE';
  if (filter === 'standby') return item.overallState === 'STANDBY';
  if (filter === 'no_data_source') return item.overallState === 'NO_ACTIVE_DATA_SOURCE';
  if (filter === 'action_required') {
    return (
      item.requiresAction ||
      item.attentionState === 'ACTION_REQUIRED' ||
      item.attentionState === 'CRITICAL' ||
      item.overallState === 'DEVICE_UNPLUGGED' ||
      item.overallState === 'AUTHORIZATION_REQUIRED' ||
      item.overallState === 'INTEGRATION_ERROR' ||
      item.overallState === 'OFFLINE' ||
      item.overallState === 'SOFT_OFFLINE'
    );
  }
  return true;
}

export function matchesStateFilter(
  item: FleetConnectivityListItem,
  filter: FleetConnectivityStateFilter,
): boolean {
  if (filter === 'all') return true;
  return item.overallState === filter;
}

export function filterFleetConnectivityItems(
  items: FleetConnectivityListItem[],
  opts: {
    search: string;
    kpiFilter: FleetConnectivityKpiFilter;
    stateFilter: FleetConnectivityStateFilter;
  },
): FleetConnectivityListItem[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (!matchesKpiFilter(item, opts.kpiFilter)) return false;
    if (!matchesStateFilter(item, opts.stateFilter)) return false;
    if (q && !listItemSearchHaystack(item).includes(q)) return false;
    return true;
  });
}

export function hasActiveConnectivityFilters(opts: {
  search: string;
  kpiFilter: FleetConnectivityKpiFilter;
  stateFilter: FleetConnectivityStateFilter;
}): boolean {
  return (
    opts.search.trim().length > 0 ||
    opts.kpiFilter !== 'all' ||
    opts.stateFilter !== 'all'
  );
}
