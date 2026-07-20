import { useMemo } from 'react';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { useServiceCenterData } from '../service-center/useServiceCenterData';
import { useFleetHealthServiceCases } from './useFleetHealthServiceCases';
import {
  buildFleetHealthServiceViewModel,
  type FleetHealthServiceViewModel,
} from './fleet-health-service.view-model';

/**
 * Combined read model for Fleet → Zustand & Service.
 *
 * Health truth: FleetContext.healthMap (RentalHealthV1).
 * Service truth: tasks + vendors + service cases (org-scoped lists).
 */
export function useFleetHealthServiceViewModel(): FleetHealthServiceViewModel & {
  allTasks: ReturnType<typeof useServiceCenterData>['allTasks'];
  vendors: ReturnType<typeof useServiceCenterData>['vendors'];
  reloadService: () => void;
} {
  const { orgId } = useRentalOrg();
  const { fleetVehicles, healthMap, healthLoading, healthError } = useFleetVehicles();
  const service = useServiceCenterData(orgId);
  const serviceCasesState = useFleetHealthServiceCases(orgId);

  const reloadService = () => {
    void service.reload();
    void serviceCasesState.reload();
  };

  const vm = useMemo(
    () =>
      buildFleetHealthServiceViewModel({
        vehicles: fleetVehicles,
        healthMap,
        healthLoading,
        healthError,
        taskSummary: service.summary,
        taskList: service.allTasks,
        vendors: service.vendors,
        serviceLoading: service.loading || serviceCasesState.loading,
        serviceError: service.error ?? serviceCasesState.error,
        serviceLoaded: service.summary != null || service.allTasks.length > 0,
        serviceCases: serviceCasesState.serviceCases,
        serviceCasesError: serviceCasesState.error,
        serviceCasesLoading: serviceCasesState.loading,
      }),
    [
      fleetVehicles,
      healthMap,
      healthLoading,
      healthError,
      service.summary,
      service.allTasks,
      service.vendors,
      service.loading,
      service.error,
      serviceCasesState.serviceCases,
      serviceCasesState.loading,
      serviceCasesState.error,
    ],
  );

  return {
    ...vm,
    allTasks: service.allTasks,
    vendors: service.vendors,
    reloadService,
  };
}
