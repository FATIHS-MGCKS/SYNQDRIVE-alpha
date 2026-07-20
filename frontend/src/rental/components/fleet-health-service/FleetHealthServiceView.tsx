import { useCallback } from 'react';
import type { Vendor } from '../../../lib/api';
import { FleetConditionView, type ConditionCategory } from '../FleetConditionView';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import { FleetHealthServiceHistoryPanel } from './FleetHealthServiceHistoryPanel';
import { FleetHealthServiceOverviewPanel } from './FleetHealthServiceOverviewPanel';
import { FleetHealthServiceTabBar } from './FleetHealthServiceTabBar';
import { FleetHealthServiceWorkPanel } from './FleetHealthServiceWorkPanel';
import type {
  FleetHealthServiceNavState,
  FleetHealthServiceTab,
  FleetHealthServiceWorkSection,
} from './fleet-health-service.types';
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
      onNavChange({
        ...nav,
        tab,
        vehicleStatusFilter: undefined,
        taskFilter: undefined,
      });
    },
    [nav, onNavChange],
  );

  const setWorkSection = useCallback(
    (workSection: FleetHealthServiceWorkSection) => {
      onNavChange({
        tab: 'work',
        workSection,
        vehicleStatusFilter: undefined,
        taskFilter: undefined,
      });
    },
    [onNavChange],
  );

  return (
    <div className="space-y-4">
      <FleetHealthServiceTabBar activeTab={activeSubTab} onTabChange={setTab} />

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

      {activeSubTab === 'vehicles' && (
        <FleetConditionView
          embedded
          hideHeaderActions
          hideKpiStrip
          uiLocale="de"
          initialStatusFilter={nav.vehicleStatusFilter}
          onDrillDown={onDrillDown}
          onOpenExistingTask={onOpenGlobalTasks}
          getExistingTaskId={getExistingTaskId}
        />
      )}

      {activeSubTab === 'work' && (
        <FleetHealthServiceWorkPanel
          activeSection={nav.workSection}
          onSectionChange={setWorkSection}
          tasks={vm.allTasks}
          vendors={vm.vendors}
          loading={vm.serviceLoading}
          error={vm.serviceError}
          onReload={() => void vm.reloadService()}
          onOpenGlobalTasks={(taskId) => {
            onOpenGlobalTasks?.(taskId);
            handleNavigationConsumed();
          }}
          onOpenVendorDetail={onOpenVendorDetail}
          focusTaskId={focusTaskId}
          initialTaskFilter={nav.taskFilter}
        />
      )}

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
  );
}
