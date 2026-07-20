import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiTask, Vendor } from '../../../lib/api';
import {
  hasServiceCenterContextFilters,
  serviceCenterNavToAdvancedFilters,
  type ServiceCenterNavState,
} from '../../lib/service-center-navigation';
import type { ServiceTaskAdvancedFilters } from '../../lib/service-task-filters';
import type { ServiceTaskFilter } from '../service-center/service-center.types';

export interface FleetHealthServiceTaskNavigationState {
  taskFilter: ServiceTaskFilter;
  setTaskFilter: (filter: ServiceTaskFilter) => void;
  focusTaskId: string | null;
  navContext: Pick<
    ServiceCenterNavState,
    'vehicleId' | 'vendorId' | 'taskType' | 'taskFilter' | 'taskStatus'
  >;
  advancedNavPatch: Partial<ServiceTaskAdvancedFilters>;
  clearNavContext: () => void;
  filteredTasks: ApiTask[];
  contextVendorName: string | null;
  hasNavContext: boolean;
}

export function useFleetHealthServiceTaskNavigation(input: {
  navigation?: ServiceCenterNavState | null;
  onNavigationConsumed?: () => void;
  allTasks: ApiTask[];
  vendors: Vendor[];
}): FleetHealthServiceTaskNavigationState {
  const { navigation, onNavigationConsumed, allTasks, vendors } = input;

  const [taskFilter, setTaskFilter] = useState<ServiceTaskFilter>('all');
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [navContext, setNavContext] = useState<
    Pick<ServiceCenterNavState, 'vehicleId' | 'vendorId' | 'taskType' | 'taskFilter' | 'taskStatus'>
  >({});
  const [advancedNavPatch, setAdvancedNavPatch] = useState<Partial<ServiceTaskAdvancedFilters>>({});

  const clearNavContext = useCallback(() => {
    setNavContext({});
    setAdvancedNavPatch({});
    setTaskFilter('all');
    setFocusTaskId(null);
  }, []);

  useEffect(() => {
    if (navigation == null) return;

    const nav = navigation;
    if (!hasServiceCenterContextFilters(nav)) {
      setNavContext({});
      setAdvancedNavPatch({});
    } else {
      const patch = serviceCenterNavToAdvancedFilters(nav);
      if (Object.keys(patch).length > 0) {
        setAdvancedNavPatch(patch);
      }
      setNavContext({
        vehicleId: nav.vehicleId,
        vendorId: nav.vendorId,
        taskType: nav.taskType,
        taskFilter: nav.taskFilter,
        taskStatus: nav.taskStatus,
      });
    }

    if (nav.taskFilter) setTaskFilter(nav.taskFilter);
    if (nav.focusTaskId) {
      setFocusTaskId(nav.focusTaskId);
    } else {
      setFocusTaskId(null);
    }

    onNavigationConsumed?.();
  }, [navigation, onNavigationConsumed]);

  const filteredTasks = useMemo(() => {
    if (!navContext.vehicleId) return allTasks;
    return allTasks.filter((task) => task.vehicleId === navContext.vehicleId);
  }, [allTasks, navContext.vehicleId]);

  const contextVendorName = useMemo(() => {
    if (!navContext.vendorId) return null;
    return vendors.find((vendor) => vendor.id === navContext.vendorId)?.name ?? null;
  }, [navContext.vendorId, vendors]);

  const hasNavContext = hasServiceCenterContextFilters(navContext);

  return {
    taskFilter,
    setTaskFilter,
    focusTaskId,
    navContext,
    advancedNavPatch,
    clearNavContext,
    filteredTasks,
    contextVendorName,
    hasNavContext,
  };
}
