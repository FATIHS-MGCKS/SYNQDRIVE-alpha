import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, History, LayoutGrid, Wrench } from 'lucide-react';
import type { Vendor } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  hasServiceCenterContextFilters,
  serviceCenterNavToAdvancedFilters,
  type ServiceCenterNavState,
} from '../../lib/service-center-navigation';
import type { ServiceTaskAdvancedFilters } from '../../lib/service-task-filters';
import { VendorManagementView } from '../VendorManagementView';
import { ServiceCenterContextBar } from './ServiceCenterContextBar';
import { ServiceControlBar } from './ServiceControlBar';
import { ServiceHistoryPanel } from './ServiceHistoryPanel';
import { ServiceOverviewPanel } from './ServiceOverviewPanel';
import { ServiceSchedulePanel } from './ServiceSchedulePanel';
import { ServiceTasksPanel } from './ServiceTasksPanel';
import { sc } from './service-center-ui';
import type { ServiceCenterTab, ServiceTaskFilter } from './service-center.types';
import { useServiceCenterData } from './useServiceCenterData';

interface ServiceCenterViewProps {
  onOpenVendorDetail?: (vendor: Vendor) => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  onCreateTask?: () => void;
  onOpenVehicle?: (vehicleId: string) => void;
  navigation?: ServiceCenterNavState | null;
  onNavigationConsumed?: () => void;
  /** Hide eyebrow/title/subtitle when nested in FleetHub Maintenance tab. */
  hideHeader?: boolean;
  /** When true, sub-tab bar is hidden (parent owns navigation, e.g. FleetHealthServiceView). */
  hideSubTabBar?: boolean;
  /** Render only this panel — used when embedded in FleetHealthServiceView. */
  forcedTab?: ServiceCenterTab;
  /** Show KPI control bar (default: true unless forcedTab is set and not overview). */
  showControlBar?: boolean;
  /** Parent sub-tab navigation (FleetHealthServiceView). */
  onNavigateToSubTab?: (tab: ServiceCenterTab) => void;
}

const TAB_ICONS = {
  overview: LayoutGrid,
  tasks: ClipboardList,
  schedule: CalendarDays,
  vendors: Wrench,
  history: History,
} as const;

export function ServiceCenterView({
  onOpenVendorDetail,
  onOpenGlobalTasks,
  onCreateTask,
  onOpenVehicle,
  navigation,
  onNavigationConsumed,
  hideHeader = false,
  hideSubTabBar = false,
  forcedTab,
  showControlBar,
  onNavigateToSubTab,
}: ServiceCenterViewProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const data = useServiceCenterData(orgId);
  const [tab, setTab] = useState<ServiceCenterTab>('overview');
  const [taskFilter, setTaskFilter] = useState<ServiceTaskFilter>('all');
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [navContext, setNavContext] = useState<Partial<ServiceCenterNavState>>({});
  const [advancedNavPatch, setAdvancedNavPatch] = useState<Partial<ServiceTaskAdvancedFilters>>({});

  const clearNavContext = useCallback(() => {
    setNavContext({});
    setAdvancedNavPatch({});
    setTaskFilter('all');
  }, []);

  useEffect(() => {
    if (navigation == null) return;
    const nav = navigation;
    if (!hasServiceCenterContextFilters(nav)) {
      clearNavContext();
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
    if (nav.tab) {
      if (onNavigateToSubTab) onNavigateToSubTab(nav.tab);
      else setTab(nav.tab);
    }
    if (nav.taskFilter) setTaskFilter(nav.taskFilter);
    if (nav.focusTaskId) {
      setFocusTaskId(nav.focusTaskId);
      if (onNavigateToSubTab) onNavigateToSubTab('tasks');
      else setTab('tasks');
    } else if (nav.vehicleId && !nav.tab) {
      if (onNavigateToSubTab) onNavigateToSubTab('tasks');
      else setTab('tasks');
    }
    onNavigationConsumed?.();
  }, [navigation, onNavigationConsumed, clearNavContext, onNavigateToSubTab]);

  const filteredActiveTasks = useMemo(() => {
    if (!navContext.vehicleId) return data.activeTasks;
    return data.activeTasks.filter((t) => t.vehicleId === navContext.vehicleId);
  }, [data.activeTasks, navContext.vehicleId]);

  const filteredAllTasks = useMemo(() => {
    if (!navContext.vehicleId) return data.allTasks;
    return data.allTasks.filter((t) => t.vehicleId === navContext.vehicleId);
  }, [data.allTasks, navContext.vehicleId]);

  const contextVendorName = useMemo(() => {
    if (!navContext.vendorId) return null;
    return data.vendors.find((v) => v.id === navContext.vendorId)?.name ?? null;
  }, [data.vendors, navContext.vendorId]);

  const tabs: Array<{ key: ServiceCenterTab; label: string }> = [
    { key: 'overview', label: t('serviceCenter.tab.overview') },
    { key: 'tasks', label: t('serviceCenter.tab.tasks') },
    { key: 'schedule', label: t('serviceCenter.tab.schedule') },
    { key: 'vendors', label: t('serviceCenter.tab.vendors') },
    { key: 'history', label: t('serviceCenter.tab.history') },
  ];

  const goToTab = useCallback(
    (next: ServiceCenterTab) => {
      if (onNavigateToSubTab) {
        onNavigateToSubTab(next);
        return;
      }
      setTab(next);
    },
    [onNavigateToSubTab],
  );

  const handleKpiFilter = useCallback((filter: ServiceTaskFilter) => {
    setTaskFilter(filter);
    goToTab('tasks');
  }, [goToTab]);

  const openTaskInPanel = useCallback((taskId: string) => {
    setFocusTaskId(taskId);
    goToTab('tasks');
  }, [goToTab]);

  const activeTab = forcedTab ?? tab;
  const shouldShowControlBar =
    showControlBar ?? (forcedTab == null || forcedTab === 'overview');

  return (
    <div className={sc.shell}>
      {!hideHeader && (
        <div className="space-y-1">
          <p className={sc.sectionEyebrow}>{t('serviceCenter.eyebrow')}</p>
          <h2 className="text-base sm:text-lg font-semibold tracking-[-0.03em] text-foreground">
            {t('serviceCenter.title')}
          </h2>
          <p className="text-[11px] text-muted-foreground max-w-2xl leading-relaxed">
            {t('serviceCenter.subtitle')}
          </p>
        </div>
      )}

      {shouldShowControlBar && (
        <ServiceControlBar
          kpis={data.kpis}
          loading={data.loading}
          activeFilter={activeTab === 'tasks' ? taskFilter : null}
          onFilterSelect={handleKpiFilter}
        />
      )}

      {hasServiceCenterContextFilters(navContext) && (
        <ServiceCenterContextBar
          context={navContext}
          vendorName={contextVendorName}
          onClear={clearNavContext}
        />
      )}

      {!hideSubTabBar && (
        <div className={sc.subTabBar}>
          {tabs.map((item) => {
            const Icon = TAB_ICONS[item.key];
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => goToTab(item.key)}
                className={`${sc.subTabBtn} flex items-center gap-1.5 ${active ? sc.subTabActive : sc.subTabIdle}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {activeTab === 'overview' && (
        <ServiceOverviewPanel
          activeTasks={data.activeTasks}
          historyTasks={data.historyTasks}
          vendors={data.vendors}
          loading={data.loading}
          onOpenTasks={() => goToTab('tasks')}
          onOpenSchedule={() => goToTab('schedule')}
          onCreateTask={onCreateTask}
          onReload={data.reload}
        />
      )}

      {activeTab === 'tasks' && (
        <ServiceTasksPanel
          tasks={filteredAllTasks}
          vendors={data.vendors}
          loading={data.loading}
          error={data.error}
          filter={taskFilter}
          onFilterChange={setTaskFilter}
          onOpenGlobalTasks={onOpenGlobalTasks}
          onReload={data.reload}
          focusTaskId={focusTaskId}
          initialAdvancedFilters={advancedNavPatch}
        />
      )}

      {activeTab === 'schedule' && (
        <ServiceSchedulePanel
          tasks={filteredActiveTasks}
          vendors={data.vendors}
          loading={data.loading}
          onSelectTask={openTaskInPanel}
        />
      )}

      {activeTab === 'vendors' && (
        <VendorManagementView embedded embeddedInServiceCenter onOpenDetail={onOpenVendorDetail} />
      )}

      {activeTab === 'history' && (
        <ServiceHistoryPanel
          tasks={filteredAllTasks}
          vendors={data.vendors}
          loading={data.loading}
          onOpenVehicle={onOpenVehicle}
          onOpenVendor={(vendorId) => {
            const vendor = data.vendors.find((v) => v.id === vendorId);
            if (vendor) onOpenVendorDetail?.(vendor);
          }}
          initialVehicleId={navContext.vehicleId}
        />
      )}
    </div>
  );
}
