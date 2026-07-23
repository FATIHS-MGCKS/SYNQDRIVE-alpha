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
 * Service truth: tasks summary/list + vendors + service cases via refresh provider.
 */
export function useFleetHealthServiceViewModel(): FleetHealthServiceViewModel & {
  allTasks: ReturnType<typeof useFleetHealthServiceRefresh>['service']['allTasks'];
  vendors: ReturnType<typeof useFleetHealthServiceRefresh>['service']['vendors']['data'];
  serviceCasesLoading: boolean;
  serviceCasesError: string | null;
  serviceCasesDataReady: boolean;
  reloadAll: ReturnType<typeof useFleetHealthServiceRefresh>['reloadAll'];
  refreshing: boolean;
} {
  const { fleetVehicles, healthMap, healthLoading, healthError, healthFetchedAt } = useFleetVehicles();
  const { service, reloadAll, refreshing } = useFleetHealthServiceRefresh();

  const vm = useMemo(
    () =>
      buildFleetHealthServiceViewModel({
        vehicles: fleetVehicles,
        healthMap,
        healthLoading,
        healthError,
        healthFetchedAt,
        taskSummary: service.summary,
        taskList: service.allTasks,
        vendors: service.vendors.data,
        tasksFetchedAt: service.tasksFetchedAt,
        vendorsFetchedAt: service.vendorsFetchedAt,
        serviceCasesFetchedAt: service.serviceCasesFetchedAt,
        serviceLoading: service.loading,
        serviceError: service.error,
        serviceLoaded:
          service.taskSummary.status === 'ready' ||
          service.taskSummary.status === 'stale' ||
          service.tasks.status === 'ready' ||
          service.tasks.status === 'stale',
        serviceCases: service.serviceCases.data,
        serviceCasesError: service.serviceCases.error,
        serviceCasesLoading: service.serviceCases.status === 'loading',
      }),
    [
      fleetVehicles,
      healthMap,
      healthLoading,
      healthError,
      healthFetchedAt,
      service.summary,
      service.allTasks,
      service.vendors.data,
      service.tasksFetchedAt,
      service.vendorsFetchedAt,
      service.serviceCasesFetchedAt,
      service.loading,
      service.error,
      service.taskSummary.status,
      service.tasks.status,
      service.serviceCases.data,
      service.serviceCases.error,
      service.serviceCases.status,
    ],
  );

  return {
    ...vm,
    allTasks: service.allTasks,
    vendors: service.vendors.data,
    serviceCasesLoading: service.serviceCases.status === 'loading',
    serviceCasesError: service.serviceCases.error,
    serviceCasesDataReady:
      service.serviceCases.status === 'ready' || service.serviceCases.status === 'stale',
    reloadAll,
    refreshing,
  };
}
