import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  dataFreshnessWarningMessage,
  getDuePickups,
  getOverdueReturns,
  shouldShowDataFreshnessWarning,
} from './dashboardFocusMode';
import { panelShellClass, PANEL_BODY_CLASS } from './dashboardShell';
import type { DashboardViewModel, FocusNotReadyVehicle } from './dashboardTypes';

export function FocusDataFreshnessBanner({ vm }: { vm: DashboardViewModel }) {
  const de = vm.locale === 'de';
  const input = {
    syncStatus: vm.controlCenterStatus.syncStatus,
    telemetry: vm.vehicleTelemetryFreshness,
    dataFreshness: vm.dataFreshness,
    dataTrust: vm.dataTrust,
  };

  if (!shouldShowDataFreshnessWarning(input)) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.06] px-4 py-3"
    >
      <Icon name="signal" className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--status-watch)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">
          {de ? 'Datenaktualität' : 'Data freshness'}
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {dataFreshnessWarningMessage(input, vm.locale)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void vm.refreshAll()}
        disabled={vm.isRefreshing}
        className="sq-btn sq-btn-secondary min-h-10 shrink-0 text-[12px]"
      >
        {de ? 'Aktualisieren' : 'Refresh'}
      </button>
    </div>
  );
}

function HandoverRow({
  time,
  plate,
  customer,
  tone,
  onClick,
}: {
  time: string;
  plate: string;
  customer?: string;
  tone: 'critical' | 'watch';
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full min-h-11 items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5 text-left',
        onClick &&
          'sq-press transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
      )}
    >
      <span className="w-12 shrink-0 text-[13px] font-semibold tabular-nums text-muted-foreground">
        {time}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-foreground">{plate}</p>
        {customer ? (
          <p className="truncate text-[12px] text-muted-foreground">{customer}</p>
        ) : null}
      </div>
      <StatusChip tone={tone} className="shrink-0">
        {tone === 'critical' ? '!' : 'Due'}
      </StatusChip>
    </Wrapper>
  );
}

function FocusPanel({
  title,
  count,
  tone,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  tone: 'critical' | 'watch' | 'neutral';
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <section className={panelShellClass('secondary')}>
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        <StatusChip tone={tone === 'critical' ? 'critical' : tone === 'watch' ? 'watch' : 'neutral'}>
          {count}
        </StatusChip>
      </div>
      <div className={cn(PANEL_BODY_CLASS, 'space-y-2')}>
        {count === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">{emptyLabel}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function FocusHandoverPanels({
  vm,
  onOpenBookingById,
}: {
  vm: DashboardViewModel;
  onOpenBookingById?: (id: string) => void;
}) {
  const de = vm.locale === 'de';
  const overdueReturns = getOverdueReturns(vm.returnItems);
  const duePickups = getDuePickups(vm.pickupItems);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <FocusPanel
        title={de ? 'Überfällige Returns' : 'Overdue returns'}
        count={overdueReturns.length}
        tone="critical"
        emptyLabel={de ? 'Keine überfälligen Rückgaben' : 'No overdue returns'}
      >
        {overdueReturns.map((r) => (
          <HandoverRow
            key={r.bookingId ?? r.plate}
            time={r.time}
            plate={r.plate || r.vehicle}
            customer={r.customer}
            tone="critical"
            onClick={r.bookingId ? () => onOpenBookingById?.(r.bookingId!) : undefined}
          />
        ))}
      </FocusPanel>

      <FocusPanel
        title={de ? 'Fällige Pickups (<60 Min)' : 'Due pickups (<60 min)'}
        count={duePickups.length}
        tone="watch"
        emptyLabel={de ? 'Keine Pickups in der nächsten Stunde' : 'No pickups in the next hour'}
      >
        {duePickups.map((p) => (
          <HandoverRow
            key={p.bookingId ?? p.plate}
            time={p.time}
            plate={p.plate || p.vehicle}
            customer={p.customer}
            tone="watch"
            onClick={p.bookingId ? () => onOpenBookingById?.(p.bookingId!) : undefined}
          />
        ))}
      </FocusPanel>
    </div>
  );
}

export function FocusNotReadyVehicles({
  vm,
  onOpenVehicleById,
}: {
  vm: DashboardViewModel;
  onOpenVehicleById?: (id: string) => void;
}) {
  const de = vm.locale === 'de';
  const items = vm.focusNotReadyVehicles;

  return (
    <section className={panelShellClass('secondary')}>
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-foreground">
          {de ? 'Fahrzeuge nicht bereit' : 'Vehicles not ready'}
        </h2>
        <StatusChip tone={items.length > 0 ? 'watch' : 'success'}>{items.length}</StatusChip>
      </div>
      <div className={cn(PANEL_BODY_CLASS)}>
        {items.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">
            {de ? 'Alle relevanten Fahrzeuge sind bereit' : 'All relevant vehicles are ready'}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 12).map((v) => (
              <NotReadyRow
                key={v.vehicleId}
                vehicle={v}
                onOpen={() => onOpenVehicleById?.(v.vehicleId)}
              />
            ))}
            {items.length > 12 ? (
              <p className="text-center text-[11px] text-muted-foreground">
                +{items.length - 12} {de ? 'weitere' : 'more'}
              </p>
            ) : null}
          </ul>
        )}
      </div>
    </section>
  );
}

function NotReadyRow({
  vehicle,
  onOpen,
}: {
  vehicle: FocusNotReadyVehicle;
  onOpen?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="sq-press flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/35 px-3 py-2.5 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      >
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-foreground">{vehicle.label}</p>
          <p className="truncate text-[12px] text-muted-foreground">{vehicle.reason}</p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{vehicle.status}</span>
      </button>
    </li>
  );
}
