import { useCallback, useMemo } from 'react';
import type { Vendor } from '../../../lib/api';
import { FleetConditionView, type ConditionCategory } from '../FleetConditionView';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import { FHS_TAB_PANEL_ID } from './fleet-health-service-a11y';
import { FleetHealthServiceHistoryPanel } from './FleetHealthServiceHistoryPanel';
import { FleetHealthServiceOverviewPanel } from './FleetHealthServiceOverviewPanel';
import { FleetHealthServiceTabBar } from './FleetHealthServiceTabBar';
import { FleetHealthServiceWorkPanel } from './FleetHealthServiceWorkPanel';
import {
  clearFleetHealthServiceNavFilters,
  fleetHealthServiceNavToTaskAdvancedFilters,
  type FleetHealthServiceNavState,
  type FleetHealthServiceTab,
  type FleetHealthServiceWorkSection,
} from './fleet-health-service.types';
import { getBlockingServiceCaseVehicleIds } from './fleet-health-service-vehicle-overview';
import { useFleetHealthServiceViewModel } from './useFleetHealthServiceViewModel';

interface FleetHealthServiceViewProps {
  nav: FleetHealthServiceNavState;
  onNavChange: (nav: FleetHealthServiceNavState) => void;
  onDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
  onOpenVendorDetail?: (vendor: Vendor) => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  onCreateTask?: () => void;
  onOpenVehicle?: (vehicleId: string) => void;
  serviceCenterNavigation?: ServiceCenterNavState | null;
  onServiceCenterNavigationConsumed?: () => void;
  onOpenServiceCenter?: (nav?: Partial<ServiceCenterNavState>) => void;
}

export function FleetHealthServiceView({
  nav,
  onNavChange,
  onDrillDown,
  onOpenVendorDetail,
  onOpenGlobalTasks,
  onCreateTask,
  onOpenVehicle,
  serviceCenterNavigation,
  onServiceCenterNavigationConsumed,
}: FleetHealthServiceViewProps) {
  const vm = useFleetHealthServiceViewModel();
  const activeSubTab = nav.tab;

  const blockingVehicleIds = useMemo(() => {
    if (nav.serviceCaseFilter !== 'blocking') return undefined;
    return getBlockingServiceCaseVehicleIds(vm.serviceCases);
  }, [nav.serviceCaseFilter, vm.serviceCases]);

  const taskAdvancedFilters = useMemo(
    () => fleetHealthServiceNavToTaskAdvancedFilters(nav),
    [nav],
  );

  const focusTaskId =
    serviceCenterNavigation?.focusTaskId && nav.tab === 'work' && nav.workSection === 'tasks'
      ? serviceCenterNavigation.focusTaskId
      : null;

  const handleNavigationConsumed = useCallback(() => {
    onServiceCenterNavigationConsumed?.();
  }, [onServiceCenterNavigationConsumed]);

  const getExistingTaskId = useCallback(
    (vehicleId: string) => vm.byVehicleId.get(vehicleId)?.existingTaskId ?? null,
    [vm.byVehicleId],
  );

  const setTab = useCallback(
    (tab: FleetHealthServiceTab) => {
      onNavChange(clearFleetHealthServiceNavFilters({ ...nav, tab }));
    },
    [nav, onNavChange],
  );

  const setWorkSection = useCallback(
    (workSection: FleetHealthServiceWorkSection) => {
      onNavChange(clearFleetHealthServiceNavFilters({ tab: 'work', workSection }));
    },
    [onNavChange],
  );

  return (
    <div className="space-y-4">
      <FleetHealthServiceTabBar activeTab={activeSubTab} onTabChange={setTab} />

      <div
        id={FHS_TAB_PANEL_ID.overview}
        role="tabpanel"
        aria-labelledby="fhs-tab-overview"
        hidden={activeSubTab !== 'overview'}
        className={activeSubTab !== 'overview' ? 'hidden' : undefined}
      >
        {activeSubTab === 'overview' && (
          <FleetHealthServiceOverviewPanel
            vm={vm}
            nav={nav}
            onNavChange={onNavChange}
            onNavigateSubTab={setTab}
            onNavigateWork={setWorkSection}
            onOpenVehicle={onOpenVehicle}
            onOpenTask={onOpenGlobalTasks}
            onCreateTask={onCreateTask}
          />
        )}
      </div>

      <div
        id={FHS_TAB_PANEL_ID.vehicles}
        role="tabpanel"
        aria-labelledby="fhs-tab-vehicles"
        hidden={activeSubTab !== 'vehicles'}
        className={activeSubTab !== 'vehicles' ? 'hidden' : undefined}
      >
        {activeSubTab === 'vehicles' && (
          <FleetConditionView
            embedded
            hideHeaderActions
            hideKpiStrip
            uiLocale="de"
            initialStatusFilter={nav.vehicleStatusFilter}
            initialVehicleId={nav.vehicleId}
            initialStationId={nav.stationId}
            blockingVehicleIds={blockingVehicleIds}
            onDrillDown={onDrillDown}
            onOpenExistingTask={onOpenGlobalTasks}
            getExistingTaskId={getExistingTaskId}
          />
        )}
      </div>

      <div
        id={FHS_TAB_PANEL_ID.work}
        role="tabpanel"
        aria-labelledby="fhs-tab-work"
        hidden={activeSubTab !== 'work'}
        className={activeSubTab !== 'work' ? 'hidden' : undefined}
      >
        {activeSubTab === 'work' && (
          <FleetHealthServiceWorkPanel
            activeSection={nav.workSection}
            onSectionChange={setWorkSection}
            tasks={vm.allTasks}
            vendors={vm.vendors}
            serviceCases={vm.serviceCases}
            serviceCasesDataReady={vm.serviceCasesDataReady}
            serviceCasesLoading={vm.serviceCasesLoading}
            serviceCasesError={vm.serviceCasesError}
            loading={vm.serviceLoading}
            error={vm.serviceError}
            onReload={() => void vm.reloadAll()}
            onOpenGlobalTasks={(taskId) => {
              onOpenGlobalTasks?.(taskId);
              handleNavigationConsumed();
            }}
            onOpenVendorDetail={onOpenVendorDetail}
            focusTaskId={focusTaskId}
            initialTaskFilter={nav.taskFilter}
            initialAdvancedFilters={taskAdvancedFilters}
          />
        )}
      </div>

      <div
        id={FHS_TAB_PANEL_ID.history}
        role="tabpanel"
        aria-labelledby="fhs-tab-history"
        hidden={activeSubTab !== 'history'}
        className={activeSubTab !== 'history' ? 'hidden' : undefined}
      >
        {activeSubTab === 'history' && (
          <FleetHealthServiceHistoryPanel
            tasks={vm.allTasks}
            vendors={vm.vendors}
            loading={vm.serviceLoading}
            onOpenVehicle={onOpenVehicle}
            initialVehicleId={serviceCenterNavigation?.vehicleId ?? undefined}
          />
        )}
      </div>
    </div>
  );
}
