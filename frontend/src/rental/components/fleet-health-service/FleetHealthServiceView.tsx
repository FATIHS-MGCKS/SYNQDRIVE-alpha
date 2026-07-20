import { useCallback, useEffect, useState } from 'react';
import type { Vendor } from '../../../lib/api';
import { FleetConditionView, type ConditionCategory } from '../FleetConditionView';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import { FleetHealthServiceHistoryPanel } from './FleetHealthServiceHistoryPanel';
import { FleetHealthServiceOverviewPanel } from './FleetHealthServiceOverviewPanel';
import { FleetHealthServiceSchedulePanel } from './FleetHealthServiceSchedulePanel';
import { FleetHealthServiceTabBar } from './FleetHealthServiceTabBar';
import { FleetHealthServiceTasksPanel } from './FleetHealthServiceTasksPanel';
import { FleetHealthServiceVendorsPanel } from './FleetHealthServiceVendorsPanel';
import { FleetHealthServiceWorkPanel } from './FleetHealthServiceWorkPanel';
import type { FleetHealthServiceTab } from './fleet-health-service.types';
import {
  isFleetHealthServiceWorkAreaEnabled,
  isFleetHealthServiceWorkAreaSubTab,
  resolveFleetSubTabForWorkView,
  resolveWorkViewFromFleetSubTab,
  resolveWorkViewFromServiceCenterNav,
  type FleetHealthServiceWorkView,
} from './fleet-health-service-work-area';
import { useFleetHealthServiceRefresh } from './FleetHealthServiceRefreshContext';
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

  const focusTaskId =
    serviceCenterNavigation?.focusTaskId && activeSubTab === 'tasks'
      ? serviceCenterNavigation.focusTaskId
      : null;

  const handleNavigationConsumed = useCallback(() => {
    onServiceCenterNavigationConsumed?.();
  }, [onServiceCenterNavigationConsumed]);

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

      {showWorkPanel ? (
        <FleetHealthServiceWorkPanel
          activeView={workView}
          onViewChange={handleWorkViewChange}
          vm={vm}
          vendors={vm.vendors}
          serviceCasesError={service.serviceCases.error}
          focusTaskId={focusTaskId}
          onReload={() => void vm.reloadAll()}
          onOpenGlobalTasks={(taskId) => {
            onOpenGlobalTasks?.(taskId);
            handleNavigationConsumed();
          }}
          onOpenVendors={() => onSubTabChange('vendors')}
        />
      ) : null}

      {!showWorkPanel && activeSubTab === 'tasks' && (
        <FleetHealthServiceTasksPanel
          tasks={vm.allTasks}
          vendors={vm.vendors}
          loading={vm.serviceLoading}
          error={vm.serviceError}
          onReload={() => void vm.reloadAll()}
          onOpenGlobalTasks={(taskId) => {
            onOpenGlobalTasks?.(taskId);
            handleNavigationConsumed();
          }}
          focusTaskId={focusTaskId}
        />
      )}

      {!showWorkPanel && activeSubTab === 'schedule' && (
        <FleetHealthServiceSchedulePanel
          tasks={vm.allTasks}
          vendors={vm.vendors}
          loading={vm.serviceLoading}
          onSelectTask={onOpenGlobalTasks}
        />
      )}

      {activeSubTab === 'vendors' && (
        <FleetHealthServiceVendorsPanel onOpenVendorDetail={onOpenVendorDetail} />
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
