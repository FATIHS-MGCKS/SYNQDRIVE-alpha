import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  stationDataFreshnessLabel,
  stationDataFreshnessTone,
  stationSeverityTone,
} from './controlSignalsBuilder';
import {
  DashboardPanelHeader,
  INTERACTIVE_ROW_CLASS,
  PANEL_BODY_CLASS,
  panelShellClass,
} from './dashboardShell';
import type {
  DashboardViewModel,
  StationCommandDetail,
  StationHealthSummary,
  StationVehicleChip,
} from './dashboardTypes';
import type { StationDrilldownMetric } from './dashboardDrilldownTypes';

interface StationHealthPanelProps {
  vm: DashboardViewModel;
  onSelectStation?: (stationId: string | null) => void;
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
}

function severityLabel(severity: StationHealthSummary['statusSeverity'], de: boolean): string {
  if (severity === 'healthy') return de ? 'Stabil' : 'Stable';
  if (severity === 'attention') return de ? 'Beobachten' : 'Watch';
  if (severity === 'warning') return de ? 'Engpass' : 'Squeeze';
  return de ? 'Kritisch' : 'Critical';
}

function stationCardAccent(severity: StationHealthSummary['statusSeverity']): string {
  if (severity === 'critical') {
    return 'border-l-[3px] border-l-[color:var(--status-critical)] bg-[color:var(--status-critical)]/[0.03]';
  }
  if (severity === 'warning') {
    return 'border-l-[3px] border-l-[color:var(--status-watch)]';
  }
  return 'border-l-[3px] border-l-transparent';
}

function MetricPill({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'watch' | 'critical' | 'info' | 'neutral';
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'min-w-0 rounded-lg border border-border/45 bg-card/35 px-2 py-1.5 text-left transition-colors',
        onClick &&
          'sq-press hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
      )}
    >
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-[17px] font-bold tabular-nums leading-none',
          tone === 'critical' && value > 0 && 'text-[color:var(--status-critical)]',
          tone === 'watch' && value > 0 && 'text-[color:var(--status-watch)]',
          tone === 'success' && 'text-[color:var(--status-positive)]',
        )}
      >
        {value}
      </p>
    </Wrapper>
  );
}

function openStationMetric(
  vm: DashboardViewModel,
  stationId: string,
  metric: StationDrilldownMetric,
) {
  vm.openDrilldown({ type: 'station-metric', stationId, metric });
}

function StationCommandCard({
  station,
  de,
  vm,
  onSelect,
}: {
  station: StationHealthSummary;
  de: boolean;
  vm: DashboardViewModel;
  onSelect?: () => void;
}) {
  const onMetric = (metric: StationDrilldownMetric) => {
    openStationMetric(vm, station.stationId, metric);
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'sq-press w-full rounded-xl border border-border/50 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        stationCardAccent(station.statusSeverity),
        INTERACTIVE_ROW_CLASS,
      )}
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-foreground">{station.stationName}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {station.vehicleCount} {de ? 'Fahrzeuge' : 'vehicles'}
            {station.capacityGap > 0 ? (
              <span className="text-[color:var(--status-watch)]">
                {' '}
                · {de ? `Engpass +${station.capacityGap}` : `squeeze +${station.capacityGap}`}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusChip tone={stationSeverityTone(station.statusSeverity)}>
            {severityLabel(station.statusSeverity, de)}
          </StatusChip>
          <StatusChip tone={stationDataFreshnessTone(station.dataFreshness)}>
            {stationDataFreshnessLabel(station.dataFreshness, de ? 'de' : 'en')}
          </StatusChip>
        </div>
      </div>

      <div
        className="grid grid-cols-4 gap-1.5 border-t border-border/40 px-3 py-2 sm:grid-cols-8"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <MetricPill
          label={de ? 'Bereit' : 'Ready'}
          value={station.readyCount}
          tone="success"
          onClick={() => onMetric('ready')}
        />
        <MetricPill
          label={de ? 'Vermietet' : 'Rented'}
          value={station.rentedCount}
          onClick={() => onMetric('rented')}
        />
        <MetricPill
          label={de ? 'Heute' : 'Due'}
          value={station.dueTodayCount}
          tone="info"
          onClick={() => onMetric('due-today')}
        />
        <MetricPill
          label={de ? 'Überfällig' : 'Overdue'}
          value={station.overdueCount}
          tone="critical"
          onClick={() => onMetric('overdue')}
        />
        <MetricPill
          label={de ? 'Blockiert' : 'Blocked'}
          value={station.blockedCount}
          tone="watch"
          onClick={() => onMetric('blocked')}
        />
        <MetricPill
          label={de ? 'Kritisch' : 'Critical'}
          value={station.criticalAlerts}
          tone="critical"
          onClick={() => onMetric('critical')}
        />
        <MetricPill label="PU" value={station.pickupsToday} onClick={() => onMetric('pickups')} />
        <MetricPill label="RET" value={station.returnsToday} onClick={() => onMetric('returns')} />
      </div>
    </button>
  );
}

function VehicleChipRow({
  title,
  items,
  tone,
  onOpenVehicle,
}: {
  title: string;
  items: StationVehicleChip[];
  tone: 'success' | 'watch' | 'critical';
  onOpenVehicle?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const toneClass =
    tone === 'critical'
      ? 'sq-tone-critical'
      : tone === 'watch'
        ? 'sq-tone-watch'
        : 'sq-tone-success';

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((v) => (
          <button
            key={v.vehicleId}
            type="button"
            onClick={() => onOpenVehicle?.(v.vehicleId)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-left text-[12px] font-medium transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
              toneClass,
            )}
            title={v.hint}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HandoverMiniList({
  title,
  items,
  de,
  onOpenBooking,
}: {
  title: string;
  items: { time: string; plate: string; customer: string; bookingId?: string; isOverdue?: boolean }[];
  de: boolean;
  onOpenBooking?: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 px-2.5 py-2 text-[12px] text-muted-foreground">
        {de ? 'Keine Einträge' : 'No items'}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {items.slice(0, 5).map((item) => (
          <li key={item.bookingId ?? `${item.plate}-${item.time}`}>
            <button
              type="button"
              disabled={!item.bookingId}
              onClick={() => item.bookingId && onOpenBooking?.(item.bookingId)}
              className="flex w-full min-h-10 items-center gap-2.5 rounded-lg border border-border/45 bg-card/30 px-2.5 py-2 text-left text-[12.5px] transition-colors hover:bg-muted/25 disabled:cursor-default disabled:opacity-80"
            >
              <span className="shrink-0 tabular-nums text-muted-foreground">{item.time}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.plate}</span>
              {item.isOverdue ? (
                <StatusChip tone="critical">
                  {de ? 'Überfällig' : 'Overdue'}
                </StatusChip>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StationDetailView({
  detail,
  de,
  vm,
  onClearStation,
  onOpenVehicleById,
  onOpenBookingById,
}: {
  detail: StationCommandDetail;
  de: boolean;
  vm: DashboardViewModel;
  onClearStation?: () => void;
  onOpenVehicleById?: (id: string) => void;
  onOpenBookingById?: (id: string) => void;
}) {
  const s = detail.station;
  const onMetric = (metric: StationDrilldownMetric) => {
    openStationMetric(vm, s.stationId, metric);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-foreground">{s.stationName}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {s.vehicleCount} {de ? 'Fahrzeuge' : 'vehicles'} · {s.readyCount}{' '}
            {de ? 'bereit' : 'ready'} · {s.dueTodayCount} {de ? 'heute fällig' : 'due today'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip tone={stationSeverityTone(s.statusSeverity)}>{severityLabel(s.statusSeverity, de)}</StatusChip>
          <StatusChip tone={stationDataFreshnessTone(s.dataFreshness)}>
            {stationDataFreshnessLabel(s.dataFreshness, de ? 'de' : 'en')}
          </StatusChip>
          {onClearStation ? (
            <button
              type="button"
              onClick={onClearStation}
              className="sq-btn sq-btn-secondary min-h-9 px-2.5 text-[12px]"
            >
              {de ? 'Alle Stationen' : 'All stations'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <MetricPill label={de ? 'Bereit' : 'Ready'} value={s.readyCount} tone="success" onClick={() => onMetric('ready')} />
        <MetricPill label={de ? 'Vermietet' : 'Rented'} value={s.rentedCount} onClick={() => onMetric('rented')} />
        <MetricPill label={de ? 'Pickups' : 'Pickups'} value={s.pickupsToday} onClick={() => onMetric('pickups')} />
        <MetricPill label={de ? 'Returns' : 'Returns'} value={s.returnsToday} onClick={() => onMetric('returns')} />
        <MetricPill label={de ? 'Überfällig' : 'Overdue'} value={s.overdueCount} tone="critical" onClick={() => onMetric('overdue')} />
        <MetricPill label={de ? 'Blockiert' : 'Blocked'} value={s.blockedCount} tone="watch" onClick={() => onMetric('blocked')} />
        <MetricPill label={de ? 'Kritisch' : 'Critical'} value={s.criticalAlerts} tone="critical" onClick={() => onMetric('critical')} />
        <MetricPill label={de ? 'Engpass' : 'Gap'} value={s.capacityGap} tone="watch" onClick={() => onMetric('due-today')} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <HandoverMiniList
          title={de ? 'Pickups heute' : 'Pickups today'}
          de={de}
          onOpenBooking={onOpenBookingById}
          items={detail.pickups.map((p) => ({
            time: p.time,
            plate: p.plate || p.vehicle,
            customer: p.customer,
            bookingId: p.bookingId,
            isOverdue: p.isOverdue,
          }))}
        />
        <HandoverMiniList
          title={de ? 'Returns heute' : 'Returns today'}
          de={de}
          onOpenBooking={onOpenBookingById}
          items={detail.returns.map((r) => ({
            time: r.time,
            plate: r.plate || r.vehicle,
            customer: r.customer,
            bookingId: r.bookingId,
            isOverdue: r.isOverdue,
          }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <VehicleChipRow
          title={de ? 'Bereit' : 'Ready'}
          items={detail.readyVehicles}
          tone="success"
          onOpenVehicle={onOpenVehicleById}
        />
        <VehicleChipRow
          title={de ? 'Blockiert / Wartung' : 'Blocked / maint.'}
          items={detail.blockedVehicles}
          tone="watch"
          onOpenVehicle={onOpenVehicleById}
        />
        <VehicleChipRow
          title={de ? 'Kritische Alerts' : 'Critical alerts'}
          items={detail.criticalVehicles}
          tone="critical"
          onOpenVehicle={onOpenVehicleById}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {de ? 'Nächste 24h' : 'Next 24h'}
        </p>
        {detail.timelineItems.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {de ? 'Keine anstehenden Ereignisse' : 'No upcoming events'}
          </p>
        ) : (
          <ul className="space-y-1">
            {detail.timelineItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2.5 rounded-lg border border-border/45 bg-card/25 px-2.5 py-2 text-[12.5px]"
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">{item.timeLabel}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.vehicleLabel}</span>
                <StatusChip tone={item.tone} className="capitalize">
                  {item.type}
                </StatusChip>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {de ? 'Stations-Aktionen' : 'Station actions'}
        </p>
        {detail.actionItems.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {de ? 'Keine dringenden Aktionen für diese Station' : 'No urgent actions for this station'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {detail.actionItems.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-border/45 bg-card/25 px-2.5 py-2.5 text-[12.5px]"
              >
                <p className="font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 line-clamp-2 text-muted-foreground text-pretty">{item.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function UnassignedFleetBanner({
  vm,
  de,
  onOpenVehicleById,
}: {
  vm: DashboardViewModel;
  de: boolean;
  onOpenVehicleById?: (id: string) => void;
}) {
  const { unassignedFleet } = vm;
  if (unassignedFleet.count === 0) return null;

  return (
    <div className="rounded-xl border border-dashed border-[color:var(--status-watch)]/40 bg-[color:var(--status-watch)]/[0.04] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-watch)]" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[12.5px] font-semibold text-foreground">
            {de
              ? `${unassignedFleet.count} Fahrzeuge ohne Stationszuordnung`
              : `${unassignedFleet.count} vehicles without station assignment`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unassignedFleet.vehicles.map((v) => (
              <button
                key={v.vehicleId}
                type="button"
                onClick={() => onOpenVehicleById?.(v.vehicleId)}
                className="rounded-md bg-muted/50 px-2 py-0.5 text-[12px] font-medium hover:bg-muted"
              >
                {v.label}
              </button>
            ))}
            {unassignedFleet.count > unassignedFleet.vehicles.length ? (
              <span className="text-[12px] text-muted-foreground">
                +{unassignedFleet.count - unassignedFleet.vehicles.length}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StationHealthPanel({
  vm,
  onSelectStation,
  onOpenVehicleById,
  onOpenBookingById,
}: StationHealthPanelProps) {
  const { stationHealth, stationCommandDetail, selectedStationId, locale } = vm;
  const de = locale === 'de';

  return (
    <section
      className={panelShellClass('secondary')}
      aria-label={de ? 'Stations-Kommando' : 'Station command'}
    >
      <DashboardPanelHeader
        icon={<Icon name="map-pin" className="h-4 w-4" />}
        iconToneClass="sq-tone-brand"
        title={de ? 'Stations-Kommando' : 'Station command'}
        subtitle={
          selectedStationId
            ? stationCommandDetail?.station.stationName ?? (de ? 'Unbekannte Station' : 'Unknown station')
            : de
              ? 'Alle Stationen · kritische zuerst'
              : 'All stations · critical first'
        }
      />

      <div className={PANEL_BODY_CLASS}>
        {stationHealth.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="map-pin" className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-[13px] font-semibold text-foreground">
              {de ? 'Keine Stationen konfiguriert' : 'No stations configured'}
            </p>
            <p className="max-w-xs text-[12px] text-muted-foreground text-pretty">
              {de
                ? 'Stationen erscheinen hier, sobald sie angelegt sind.'
                : 'Stations will appear here once configured.'}
            </p>
          </div>
        ) : selectedStationId && stationCommandDetail ? (
          <StationDetailView
            detail={stationCommandDetail}
            de={de}
            vm={vm}
            onClearStation={() => onSelectStation?.(null)}
            onOpenVehicleById={onOpenVehicleById}
            onOpenBookingById={onOpenBookingById}
          />
        ) : (
          <div className="space-y-3">
            <UnassignedFleetBanner vm={vm} de={de} onOpenVehicleById={onOpenVehicleById} />
            <div className="space-y-2">
              {stationHealth.map((s) => (
                <StationCommandCard
                  key={s.stationId}
                  station={s}
                  de={de}
                  vm={vm}
                  onSelect={() => onSelectStation?.(s.stationId)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
