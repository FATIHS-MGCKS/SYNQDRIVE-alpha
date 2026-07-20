import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Vendor } from '../../../lib/api';
import { FleetConditionView, type ConditionCategory } from '../FleetConditionView';
import { ServiceCenterContextBar } from '../service-center/ServiceCenterContextBar';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import { FleetHealthServiceHistoryPanel } from './FleetHealthServiceHistoryPanel';
import { FleetHealthServiceOverviewPanel } from './FleetHealthServiceOverviewPanel';
import { FleetHealthServiceSchedulePanel } from './FleetHealthServiceSchedulePanel';
import { FleetHealthServiceTabBar } from './FleetHealthServiceTabBar';
import { FleetHealthServiceTasksPanel } from './FleetHealthServiceTasksPanel';
import { FleetHealthServiceVendorsPanel } from './FleetHealthServiceVendorsPanel';
import { FleetHealthServiceWorkPanel } from './FleetHealthServiceWorkPanel';
import type { FleetHealthServiceTab } from './fleet-health-service.types';
import { resolveFleetHealthServiceTaskSourceState } from './fleet-health-service-task-source';
import {
  isFleetHealthServiceWorkAreaEnabled,
  isFleetHealthServiceWorkAreaSubTab,
  resolveFleetSubTabForWorkView,
  resolveWorkViewFromFleetSubTab,
  resolveWorkViewFromServiceCenterNav,
  type FleetHealthServiceWorkView,
} from './fleet-health-service-work-area';
import { useFleetHealthServiceRefresh } from './FleetHealthServiceRefreshContext';
import { useFleetHealthServiceTaskNavigation } from './useFleetHealthServiceTaskNavigation';
import { useFleetHealthServiceViewModel } from './useFleetHealthServiceViewModel';

interface FleetHealthServiceViewProps {
  activeSubTab: FleetHealthServiceTab;
  onSubTabChange: (tab: FleetHealthServiceTab) => void;
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
  activeSubTab,
  onSubTabChange,
  onDrillDown,
  onOpenVendorDetail,
  onOpenGlobalTasks,
  onCreateTask,
  onOpenVehicle,
  serviceCenterNavigation,
  onServiceCenterNavigationConsumed,
}: FleetHealthServiceViewProps) {
  const vm = useFleetHealthServiceViewModel();
  const { service } = useFleetHealthServiceRefresh();
  const workAreaEnabled = isFleetHealthServiceWorkAreaEnabled();

  const taskSource = useMemo(
    () => resolveFleetHealthServiceTaskSourceState(service),
    [service.tasks.status, service.tasks.error, service.taskSummary.status, service.taskSummary.error],
  );

  const serviceCasesLoading = service.serviceCases.status === 'loading';

  const taskNavigation = useFleetHealthServiceTaskNavigation({
    navigation: serviceCenterNavigation,
    onNavigationConsumed: onServiceCenterNavigationConsumed,
    allTasks: vm.allTasks,
    vendors: vm.vendors,
  });

  const [workView, setWorkView] = useState<FleetHealthServiceWorkView>(() =>
    resolveWorkViewFromFleetSubTab(activeSubTab) ?? 'tasks',
  );

  useEffect(() => {
    const mapped = resolveWorkViewFromFleetSubTab(activeSubTab);
    if (mapped) setWorkView(mapped);
  }, [activeSubTab]);

  useEffect(() => {
    if (!serviceCenterNavigation) return;
    setWorkView(resolveWorkViewFromServiceCenterNav(serviceCenterNavigation));
  }, [serviceCenterNavigation]);

  const handleWorkViewChange = useCallback(
    (view: FleetHealthServiceWorkView) => {
      setWorkView(view);
      const nextSubTab = resolveFleetSubTabForWorkView(view);
      if (nextSubTab !== activeSubTab) {
        onSubTabChange(nextSubTab);
      }
    },
    [activeSubTab, onSubTabChange],
  );

  const getExistingTaskId = useCallback(
    (vehicleId: string) => vm.byVehicleId.get(vehicleId)?.existingTaskId ?? null,
    [vm.byVehicleId],
  );

  const showWorkPanel = workAreaEnabled && isFleetHealthServiceWorkAreaSubTab(activeSubTab);
  const showLegacyTasks = !showWorkPanel && activeSubTab === 'tasks';
  const showTaskContextBar =
    (showWorkPanel && workView === 'tasks') || showLegacyTasks;

  const handleOpenGlobalTask = useCallback(
    (taskId: string) => {
      onOpenGlobalTasks?.(taskId);
    },
    [onOpenGlobalTasks],
  );

  const handleReloadAll = useCallback(() => {
    void vm.reloadAll();
  }, [vm]);

  const taskPanelCommonProps = {
    tasks: taskNavigation.filteredTasks,
    vendors: vm.vendors,
    loading: taskSource.loading,
    error: taskSource.error,
    filter: taskNavigation.taskFilter,
    onFilterChange: taskNavigation.setTaskFilter,
    initialAdvancedFilters: taskNavigation.advancedNavPatch,
    focusTaskId: taskNavigation.focusTaskId,
    onReload: handleReloadAll,
    onOpenGlobalTasks: handleOpenGlobalTask,
  };

  return (
    <div className="space-y-4">
      <FleetHealthServiceTabBar activeTab={activeSubTab} onTabChange={onSubTabChange} />

      {activeSubTab === 'overview' && (
        <FleetHealthServiceOverviewPanel
          vm={vm}
          onNavigateSubTab={onSubTabChange}
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
          onDrillDown={onDrillDown}
          onOpenExistingTask={onOpenGlobalTasks}
          getExistingTaskId={getExistingTaskId}
        />
      )}

      {showTaskContextBar && taskNavigation.hasNavContext ? (
        <ServiceCenterContextBar
          context={taskNavigation.navContext}
          vendorName={taskNavigation.contextVendorName}
          onClear={taskNavigation.clearNavContext}
        />
      ) : null}

      {showWorkPanel ? (
        <FleetHealthServiceWorkPanel
          activeView={workView}
          onViewChange={handleWorkViewChange}
          vm={vm}
          vendors={vm.vendors}
          tasks={taskNavigation.filteredTasks}
          tasksLoading={taskSource.loading}
          tasksError={taskSource.error}
          taskFilter={taskNavigation.taskFilter}
          onTaskFilterChange={taskNavigation.setTaskFilter}
          initialAdvancedFilters={taskNavigation.advancedNavPatch}
          serviceCasesError={service.serviceCases.error}
          serviceCasesLoading={serviceCasesLoading}
          focusTaskId={taskNavigation.focusTaskId}
          onReload={handleReloadAll}
          onOpenGlobalTasks={handleOpenGlobalTask}
          onOpenVendors={() => onSubTabChange('vendors')}
        />
      ) : null}

      {showLegacyTasks ? <FleetHealthServiceTasksPanel {...taskPanelCommonProps} /> : null}

      {!showWorkPanel && activeSubTab === 'schedule' && (
        <FleetHealthServiceSchedulePanel
          tasks={taskNavigation.filteredTasks}
          vendors={vm.vendors}
          loading={taskSource.loading}
          onSelectTask={handleOpenGlobalTask}
        />
      )}

      {activeSubTab === 'vendors' && (
        <FleetHealthServiceVendorsPanel onOpenVendorDetail={onOpenVendorDetail} />
      )}

      {activeSubTab === 'history' && (
        <FleetHealthServiceHistoryPanel
          tasks={taskNavigation.filteredTasks}
          vendors={vm.vendors}
          loading={taskSource.loading}
          onOpenVehicle={onOpenVehicle}
          initialVehicleId={serviceCenterNavigation?.vehicleId ?? undefined}
        />
      )}
    </div>
  );
}
