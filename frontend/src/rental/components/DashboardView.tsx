import {
  ActionQueue,
  BusinessPulse,
  ControlKpiStrip,
  DashboardControlHeader,
  DashboardDrilldownDrawer,
  DASHBOARD_LAYOUT,
  DashboardSectionLabel,
  DataFreshnessIndicator,
  FleetReadinessScore,
  FleetStateBoard,
  FocusDataFreshnessBanner,
  FocusHandoverPanels,
  FocusNotReadyVehicles,
  NowNextTimeline,
  StationHealthPanel,
  TodayOperations,
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
        <div className={DASHBOARD_LAYOUT.focusShell}>
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
      <div className={`${DASHBOARD_LAYOUT.shell} animate-fade-up`}>
      <DashboardControlHeader vm={vm} />
      <ControlKpiStrip vm={vm} />

      <div className={DASHBOARD_LAYOUT.opsStack}>
        <DashboardSectionLabel>
          {vm.locale === 'de' ? 'Operative Steuerung' : 'Operational control'}
        </DashboardSectionLabel>

        <ActionQueue vm={vm} {...handlers} />

        <div className={DASHBOARD_LAYOUT.opsGrid}>
          <NowNextTimeline vm={vm} {...handlers} />
          <TodayOperations vm={vm} {...handlers} />
        </div>

        <FleetStateBoard
          vm={vm}
          onVehicleSelect={onVehicleSelect}
          onOpenVehicleById={onOpenVehicleById}
        />
      </div>

      <div className={DASHBOARD_LAYOUT.opsStack}>
        <DashboardSectionLabel>
          {vm.locale === 'de' ? 'Kontrollsignale' : 'Control signals'}
        </DashboardSectionLabel>

        <div className={DASHBOARD_LAYOUT.signalsGrid}>
          <DataFreshnessIndicator vm={vm} />
          <FleetReadinessScore vm={vm} />
        </div>

        <StationHealthPanel
          vm={vm}
          onSelectStation={vm.applyStationFilter}
          onOpenVehicleById={onOpenVehicleById}
          onOpenBookingById={onOpenBookingById}
        />
      </div>

      <div className={DASHBOARD_LAYOUT.financeZone}>
        <BusinessPulse vm={vm} onOpenFinanceView={onOpenFinanceView} />
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
