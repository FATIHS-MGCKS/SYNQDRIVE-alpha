import { useCallback } from 'react';
import {
  ActionQueue,
  BusinessPulse,
  ControlKpiStrip,
  DashboardControlHeader,
  DashboardDrilldownDrawer,
  DASHBOARD_LAYOUT,
  DashboardSectionLabel,
  FocusDataFreshnessBanner,
  FocusHandoverPanels,
  FocusNotReadyVehicles,
  NowNextTimeline,
  OperationsSchedulePanel,
  useDashboardViewModel,
  type DashboardViewProps,
} from './dashboard';
import { FleetCommandView } from './fleet-operator/FleetCommandView';

export type { DashboardViewProps } from './dashboard';

export function DashboardView({
  onVehicleSelect,
  onItemHover,
  onOpenVehicleById,
  onOpenRentalView,
  onOpenBookingById,
  onOpenFinanceView,
}: DashboardViewProps) {
  const vm = useDashboardViewModel({
    onVehicleSelect,
    onItemHover,
    onOpenVehicleById,
    onOpenRentalView,
    onOpenBookingById,
    onOpenFinanceView,
  });

  const handlers = {
    onOpenVehicleById,
    onOpenBookingById,
    onOpenRentalView,
  };
  const getFleetHealth = useCallback(
    (id: string) => vm.healthMap.get(id) ?? null,
    [vm.healthMap],
  );
  const activeDrawerTargetId = vm.activeDashboardSliceId ?? vm.activeBusinessMetricId;
  const drawerLoading = vm.activeBusinessMetricId
    ? !vm.dataFreshness.invoicesLoaded
    : vm.activeDashboardSliceId === 'due-soon' ||
        vm.activeDashboardSliceId === 'overdue-returns' ||
        vm.activeDashboardSliceId === 'overdue-pickups'
      ? !vm.dataFreshness.todayBookingsLoaded
      : vm.activeDashboardSliceId === 'critical-alerts'
        ? vm.dataFreshness.insightsLoading
        : vm.activeDashboardSliceId != null
          ? vm.dataFreshness.fleetLoading
          : false;

  if (vm.operatorFocusMode) {
    return (
      <>
        <div className={`${DASHBOARD_LAYOUT.focusShell} animate-fade-up`}>
          <DashboardControlHeader vm={vm} />

          <div className={DASHBOARD_LAYOUT.focusStack}>
            <FocusDataFreshnessBanner vm={vm} />

            <ActionQueue vm={vm} {...handlers} />

            <NowNextTimeline vm={vm} {...handlers} />

            <FocusHandoverPanels vm={vm} onOpenBookingById={onOpenBookingById} />

            <FocusNotReadyVehicles vm={vm} onOpenVehicleById={onOpenVehicleById} />
          </div>
        </div>
        <DashboardDrilldownDrawer
          activeTargetId={activeDrawerTargetId}
          dashboardRuntime={vm.dashboardRuntime}
          businessPulseSlices={vm.businessPulseSlices}
          loading={drawerLoading}
          locale={vm.locale}
          selectedStationName={vm.selectedStationName}
          onClose={vm.closeDrilldown}
          onOpenVehicle={onOpenVehicleById}
          onOpenBooking={onOpenBookingById}
          onOpenInvoice={() => onOpenFinanceView?.('invoices')}
          onOpenBilling={() => onOpenFinanceView?.('invoices')}
        />
      </>
    );
  }

  return (
    <>
      <div className={DASHBOARD_LAYOUT.shell}>
        <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
          <DashboardControlHeader vm={vm} />
        </div>

        <div className={`${DASHBOARD_LAYOUT.controlFinanceGrid} animate-fade-up`} style={{ animationDelay: '50ms' }}>
          <div className={DASHBOARD_LAYOUT.controlKpiSlot}>
            <div className={DASHBOARD_LAYOUT.controlKpiShell}>
              <ControlKpiStrip
                dashboardRuntime={vm.dashboardRuntime}
                activeSliceId={vm.activeDashboardSliceId}
                onSelectSlice={vm.openSliceDrilldown}
                embedded
                locale={vm.locale}
                dataFreshness={vm.dataFreshness}
              />
            </div>
          </div>
          <div className={DASHBOARD_LAYOUT.financeSlot}>
            <BusinessPulse
              businessPulseSlices={vm.businessPulseSlices}
              onSelectBusinessMetric={vm.openBusinessMetricDrilldown}
              onOpenBilling={() => onOpenFinanceView?.('invoices')}
              locale={vm.locale}
              currency="EUR"
              loading={!vm.dataFreshness.invoicesLoaded}
              error={vm.dataFreshness.invoicesError}
            />
          </div>
        </div>

        <div
          className={`${DASHBOARD_LAYOUT.notificationsDayPlanGrid} animate-fade-up`}
          style={{ animationDelay: '90ms' }}
        >
          <div className={DASHBOARD_LAYOUT.notificationsSlot}>
            <ActionQueue vm={vm} {...handlers} />
          </div>
          <div className={DASHBOARD_LAYOUT.dayPlanSlot}>
            <OperationsSchedulePanel vm={vm} {...handlers} />
          </div>
        </div>

        <div className={`${DASHBOARD_LAYOUT.opsStack} animate-fade-up`} style={{ animationDelay: '120ms' }}>
          <DashboardSectionLabel>
            {vm.locale === 'de' ? 'Operative Steuerung' : 'Operational control'}
          </DashboardSectionLabel>

          <FleetCommandView
            vehicles={vm.filteredFleetVehicles}
            getHealth={getFleetHealth}
            dashboardRuntime={vm.dashboardRuntime}
            loading={vm.dataFreshness.fleetLoading}
            refreshing={vm.isRefreshing}
            onRefresh={vm.refreshAll}
            onOpenVehicle={onOpenVehicleById}
            locale={vm.locale}
          />
        </div>
      </div>
      <DashboardDrilldownDrawer
        activeTargetId={activeDrawerTargetId}
        dashboardRuntime={vm.dashboardRuntime}
        businessPulseSlices={vm.businessPulseSlices}
        loading={drawerLoading}
        locale={vm.locale}
        selectedStationName={vm.selectedStationName}
        onClose={vm.closeDrilldown}
        onOpenVehicle={onOpenVehicleById}
        onOpenBooking={onOpenBookingById}
        onOpenInvoice={() => onOpenFinanceView?.('invoices')}
        onOpenBilling={() => onOpenFinanceView?.('invoices')}
      />
    </>
  );
}
