import { useMemo } from 'react';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { useServiceCenterData } from '../service-center/useServiceCenterData';
import {
  buildFleetHealthServiceViewModel,
  type FleetHealthServiceViewModel,
} from './fleet-health-service.view-model';

/**
 * Combined read model for Fleet → Zustand & Service.
 *
 * Health truth: FleetContext.healthMap (RentalHealthV1).
 * Service truth: tasks summary/list + vendors via useServiceCenterData.
 *
 * Does NOT compute health or mutate tasks — UI derivation only.
 */
export function useFleetHealthServiceViewModel(): FleetHealthServiceViewModel & {
  allTasks: ReturnType<typeof useServiceCenterData>['allTasks'];
  vendors: ReturnType<typeof useServiceCenterData>['vendors'];
  reloadService: ReturnType<typeof useServiceCenterData>['reload'];
} {
  const { orgId } = useRentalOrg();
  const { fleetVehicles, healthMap, healthLoading } = useFleetVehicles();
  const service = useServiceCenterData(orgId);

  const vm = useMemo(
    () =>
      buildFleetHealthServiceViewModel({
        vehicles: fleetVehicles,
        healthMap,
        healthLoading,
        taskSummary: service.summary,
        taskList: service.allTasks,
        vendors: service.vendors,
        serviceLoading: service.loading,
        serviceError: service.error,
        serviceLoaded: service.summary != null || service.allTasks.length > 0,
      }),
    [
      fleetVehicles,
      healthMap,
      healthLoading,
      service.summary,
      service.allTasks,
      service.vendors,
      service.loading,
      service.error,
    ],
  );

  return {
    ...vm,
    allTasks: service.allTasks,
    vendors: service.vendors,
    reloadService: service.reload,
  };
}
