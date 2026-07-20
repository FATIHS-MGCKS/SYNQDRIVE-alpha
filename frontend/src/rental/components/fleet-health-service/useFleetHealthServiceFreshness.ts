import { useMemo } from 'react';
import { useFleetVehicles } from '../../FleetContext';
import { useFleetHealthServiceRefresh } from './FleetHealthServiceRefreshContext';
import {
  buildFleetHealthServiceFreshness,
  buildFleetHealthServiceFreshnessDetailRows,
  formatFleetHealthServiceCompactLabel,
  type FleetHealthServiceFreshness,
  type FleetHealthServiceFreshnessDetailRow,
} from './fleet-health-service-freshness';

export function useFleetHealthServiceFreshness(nowMs = Date.now()): {
  freshness: FleetHealthServiceFreshness;
  compactLabel: string | null;
  compactLabelDe: string | null;
  detailRowsDe: FleetHealthServiceFreshnessDetailRow[];
  detailRowsEn: FleetHealthServiceFreshnessDetailRow[];
} {
  const { fleetVehicles, healthMap, healthFetchedAt } = useFleetVehicles();
  const { service } = useFleetHealthServiceRefresh();

  const freshness = useMemo(
    () =>
      buildFleetHealthServiceFreshness({
        healthFetchedAt,
        healthMap,
        vehicleIds: fleetVehicles.map((vehicle) => vehicle.id),
        tasksFetchedAt: service.tasksFetchedAt,
        vendorsFetchedAt: service.vendorsFetchedAt,
        serviceCasesFetchedAt: service.serviceCasesFetchedAt,
      }),
    [
      healthFetchedAt,
      healthMap,
      fleetVehicles,
      service.tasksFetchedAt,
      service.vendorsFetchedAt,
      service.serviceCasesFetchedAt,
    ],
  );

  return useMemo(
    () => ({
      freshness,
      compactLabel: formatFleetHealthServiceCompactLabel(freshness, 'en', nowMs),
      compactLabelDe: formatFleetHealthServiceCompactLabel(freshness, 'de', nowMs),
      detailRowsDe: buildFleetHealthServiceFreshnessDetailRows(freshness, 'de', nowMs),
      detailRowsEn: buildFleetHealthServiceFreshnessDetailRows(freshness, 'en', nowMs),
    }),
    [freshness, nowMs],
  );
}
