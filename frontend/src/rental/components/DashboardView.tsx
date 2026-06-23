import {
  ActionQueue,
  BusinessPulse,
  ControlKpiStrip,
  DashboardControlHeader,
  DashboardDrilldownDrawer,
  DASHBOARD_LAYOUT,
  DashboardSectionLabel,
  FleetStateBoard,
  FocusDataFreshnessBanner,
  FocusHandoverPanels,
  FocusNotReadyVehicles,
  NowNextTimeline,
  OperationsSchedulePanel,
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
          vm={vm}
          onOpenVehicleById={onOpenVehicleById}
          onOpenBookingById={onOpenBookingById}
          onOpenRentalView={onOpenRentalView}
          onOpenFinanceView={onOpenFinanceView}
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
        <div className="animate-fade-up" style={{ animationDelay: '70ms' }}>
          <ControlKpiStrip vm={vm} />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
          <BusinessPulse vm={vm} onOpenFinanceView={onOpenFinanceView} />
        </div>

        <div className={`${DASHBOARD_LAYOUT.opsStack} animate-fade-up`} style={{ animationDelay: '180ms' }}>
          <DashboardSectionLabel>
            {vm.locale === 'de' ? 'Operative Steuerung' : 'Operational control'}
          </DashboardSectionLabel>

          <div className={DASHBOARD_LAYOUT.opsGrid}>
            <ActionQueue vm={vm} {...handlers} />
            <OperationsSchedulePanel vm={vm} {...handlers} />
          </div>

          <FleetStateBoard
            vm={vm}
            onVehicleSelect={onVehicleSelect}
            onOpenVehicleById={onOpenVehicleById}
          />
        </div>
      </div>
      <DashboardDrilldownDrawer
        vm={vm}
        onOpenVehicleById={onOpenVehicleById}
        onOpenBookingById={onOpenBookingById}
        onOpenRentalView={onOpenRentalView}
        onOpenFinanceView={onOpenFinanceView}
      />
    </>
  );
}
