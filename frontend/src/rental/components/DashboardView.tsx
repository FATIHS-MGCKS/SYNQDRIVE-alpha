import {
  ActionQueue,
  BusinessPulse,
  ControlKpiStrip,
  DashboardControlHeader,
  DashboardDrilldownDrawer,
  DASHBOARD_LAYOUT,
  FocusDataFreshnessBanner,
  FocusHandoverPanels,
  FocusNotReadyVehicles,
  NowNextTimeline,
  useDashboardViewModel,
  type DashboardViewProps,
} from './dashboard';

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
        <div className={`${DASHBOARD_LAYOUT.controlFinanceGrid} animate-fade-up`} style={{ animationDelay: '0ms' }}>
          <div className={DASHBOARD_LAYOUT.controlKpiSlot}>
            <DashboardControlHeader vm={vm}>
              <ControlKpiStrip
                dashboardRuntime={vm.dashboardRuntime}
                activeSliceId={vm.activeDashboardSliceId}
                onSelectSlice={vm.openSliceDrilldown}
                embedded
                locale={vm.locale}
                dataFreshness={vm.dataFreshness}
              />
            </DashboardControlHeader>
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
          <div className={DASHBOARD_LAYOUT.notificationsSlot}>
            <ActionQueue vm={vm} {...handlers} layout="sidebar" />
          </div>
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
