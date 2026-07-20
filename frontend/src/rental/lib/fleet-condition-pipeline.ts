import type { VehicleData } from '../data/vehicles';
import type { VehicleHealthResponse } from '../../lib/api';
import {
  matchesDataQualityFilter,
  matchesModuleFilter,
  matchesStatusFilter,
  operatorGroupForVehicle,
  priorityRank,
  vehicleLastUpdatedIso,
  type OperatorDataQualityFilter,
  type OperatorGroupKey,
  type OperatorModuleFilter,
  type OperatorSortMode,
  type OperatorStatusFilter,
} from './fleet-health-control-center';

/**
 * When an expanded operator group exceeds this row count, the UI virtualizes
 * the row list (see FleetConditionView). Threshold derived from scale
 * benchmarks in docs/testing/fleet-health-service-scale-benchmarks.md.
 */
export const FLEET_CONDITION_VIRTUALIZE_THRESHOLD = 50;

export function filterAndSortFleetConditionVehicles(input: {
  fleetVehicles: VehicleData[];
  healthMap: Map<string, VehicleHealthResponse>;
  statusFilter: OperatorStatusFilter;
  moduleFilter: OperatorModuleFilter;
  dataQualityFilter: OperatorDataQualityFilter;
  searchQuery: string;
  sortMode: OperatorSortMode;
  vehicleId?: string;
  stationId?: string;
  vehicleIds?: ReadonlySet<string>;
}): VehicleData[] {
  const q = input.searchQuery.trim().toLowerCase();
  const base = input.fleetVehicles.filter((v) => {
    if (input.vehicleId && v.id !== input.vehicleId) return false;
    if (input.stationId) {
      const stationKey = v.stationId ?? v.homeStationId;
      if (stationKey !== input.stationId) return false;
    }
    if (input.vehicleIds && !input.vehicleIds.has(v.id)) return false;
    const health = input.healthMap.get(v.id);
    if (!matchesStatusFilter(input.statusFilter, health)) return false;
    if (!matchesModuleFilter(input.moduleFilter, health)) return false;
    if (!matchesDataQualityFilter(input.dataQualityFilter, health)) return false;
    if (!q) return true;
    const haystack = [v.model, v.make, v.license, v.station, v.year?.toString()]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  const sorted = [...base];
  sorted.sort((a, b) => {
    const ha = input.healthMap.get(a.id);
    const hb = input.healthMap.get(b.id);
    if (input.sortMode === 'priority') {
      return (
        priorityRank(hb) - priorityRank(ha) ||
        (a.license ?? '').localeCompare(b.license ?? '', 'de')
      );
    }
    if (input.sortMode === 'station') {
      return (a.station ?? '').localeCompare(b.station ?? '', 'de');
    }
    if (input.sortMode === 'license') {
      return (a.license ?? '').localeCompare(b.license ?? '', 'de');
    }
    const ua = vehicleLastUpdatedIso(ha);
    const ub = vehicleLastUpdatedIso(hb);
    return Date.parse(ub ?? '0') - Date.parse(ua ?? '0');
  });
  return sorted;
}

export function groupFleetConditionVehicles(
  filtered: VehicleData[],
  healthMap: Map<string, VehicleHealthResponse>,
): Record<OperatorGroupKey, VehicleData[]> {
  const buckets: Record<OperatorGroupKey, VehicleData[]> = {
    action_required: [],
    needs_review: [],
    limited_data: [],
    good: [],
  };
  for (const v of filtered) {
    const health = healthMap.get(v.id);
    buckets[operatorGroupForVehicle(health)].push(v);
  }
  return buckets;
}

export function countExpandedFleetConditionDomRows(input: {
  grouped: Record<OperatorGroupKey, VehicleData[]>;
  expandedGroups: Set<OperatorGroupKey>;
}): number {
  let rows = 0;
  for (const key of Object.keys(input.grouped) as OperatorGroupKey[]) {
    if (input.expandedGroups.has(key)) {
      rows += input.grouped[key].length;
    }
  }
  return rows;
}

export function shouldVirtualizeFleetConditionGroup(vehicleCount: number): boolean {
  return vehicleCount > FLEET_CONDITION_VIRTUALIZE_THRESHOLD;
}
