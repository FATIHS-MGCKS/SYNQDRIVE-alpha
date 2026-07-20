import { useMemo } from 'react';
import { useFleetVehicles } from '../../FleetContext';
import {
  buildFleetHealthServiceViewModel,
  type FleetHealthServiceViewModel,
} from './fleet-health-service.view-model';
import { useFleetHealthServiceRefresh } from './FleetHealthServiceRefreshContext';

/**
 * Combined read model for Fleet → Zustand & Service.
 *
 * Health truth: FleetContext.healthMap (RentalHealthV1).
 * Service truth: tasks summary/list + vendors via FleetHealthServiceRefreshProvider.
 *
 * Does NOT compute health or mutate tasks — UI derivation only.
 */
export function useFleetHealthServiceViewModel(): FleetHealthServiceViewModel & {
  allTasks: ReturnType<typeof useFleetHealthServiceRefresh>['service']['allTasks'];
  vendors: ReturnType<typeof useFleetHealthServiceRefresh>['service']['vendors'];
  reloadAll: ReturnType<typeof useFleetHealthServiceRefresh>['reloadAll'];
  refreshing: boolean;
} {
  const { fleetVehicles, healthMap, healthLoading } = useFleetVehicles();
  const { service, reloadAll, refreshing } = useFleetHealthServiceRefresh();

  const vm = useMemo(
    () =>
      buildFleetHealthServiceViewModel({
        vehicles: fleetVehicles,
        healthMap,
        healthLoading,
        taskSummary: service.summary,
        taskList: service.allTasks,
        vendors: service.vendors.data,
        serviceLoading: service.loading,
        serviceError: service.error,
        serviceLoaded:
          service.taskSummary.status === 'ready' ||
          service.taskSummary.status === 'stale' ||
          service.tasks.status === 'ready' ||
          service.tasks.status === 'stale',
      }),
    [
      fleetVehicles,
      healthMap,
      healthLoading,
      service.summary,
      service.allTasks,
      service.vendors.data,
      service.loading,
      service.error,
      service.taskSummary.status,
      service.tasks.status,
    ],
  );

  return {
    ...vm,
    allTasks: service.allTasks,
    vendors: service.vendors.data,
    reloadAll,
    refreshing,
  };
}
