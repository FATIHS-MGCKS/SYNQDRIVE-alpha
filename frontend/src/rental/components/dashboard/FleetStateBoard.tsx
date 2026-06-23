import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { FleetBoardVehicleRow } from './FleetBoardVehicleRow';
import { panelShellClass } from './dashboardShell';
import type { VehicleData } from '../../data/vehicles';
import type { DashboardViewModel } from './dashboardTypes';

interface FleetStateBoardProps {
  vm: DashboardViewModel;
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onOpenVehicleById?: (vehicleId: string) => void;
}

function FleetBoardEmpty({ locale, stationName }: { locale: string; stationName?: string | null }) {
  const de = locale === 'de';
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="sq-tone-neutral flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40">
        <Icon name="car" className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-[13px] font-semibold text-foreground">
        {de ? 'Keine Fahrzeuge im Scope' : 'No vehicles in scope'}
      </p>
      <p className="max-w-[280px] text-[12px] text-muted-foreground text-pretty">
        {stationName
          ? de
            ? `${stationName} hat aktuell keine Fahrzeuge in der Flotte.`
            : `${stationName} has no fleet vehicles right now.`
          : de
            ? 'Es sind keine Fahrzeuge geladen oder der Filter ist leer.'
            : 'No vehicles are loaded or the current filter is empty.'}
      </p>
    </div>
  );
}

function MinimalFleetHeader({
  title,
  subtitle,
  totalCount,
  criticalCount,
  de,
  isExpanded,
  onToggle,
  controlsId,
}: {
  title: string;
  subtitle: string;
  totalCount: number;
  criticalCount: number;
  de: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/35 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={[
            'h-2 w-2 shrink-0 rounded-full',
            criticalCount > 0 ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--brand)]',
          ].join(' ')}
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground text-balance">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        {totalCount > 0 ? (
          <>
            {criticalCount > 0 ? (
              <span className="text-[11px] font-medium tabular-nums text-[color:var(--status-critical)]">
                {criticalCount} {de ? 'kritisch' : 'critical'}
              </span>
            ) : null}
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {totalCount} {de ? 'Fahrzeuge' : 'vehicles'}
            </span>
          </>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={controlsId}
          className="sq-press inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {isExpanded ? (de ? 'Zu' : 'Close') : (de ? 'Auf' : 'Open')}
          <Icon
            name="chevron-down"
            className={cn('h-3 w-3 transition-transform duration-200', !isExpanded && '-rotate-90')}
          />
        </button>
      </div>
    </div>
  );
}

export function FleetStateBoard({ vm, onVehicleSelect, onOpenVehicleById }: FleetStateBoardProps) {
  const {
    t,
    locale,
    filteredFleetVehicles,
    fleetBoard,
    fleetBoardFilter,
    setFleetBoardFilter,
    selectedStationName,
    dataFreshness,
  } = vm;

  const vehicleById = useMemo(() => {
    const m = new Map<string, VehicleData>();
    for (const v of filteredFleetVehicles) m.set(v.id, v);
    return m;
  }, [filteredFleetVehicles]);

  const loading = dataFreshness.fleetLoading;
  const de = locale === 'de';
  const criticalCount = fleetBoard.items.filter((item) => item.severity === 'critical').length;
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = 'dashboard-fleet-state-content';

  const openVehicle = (vehicleId: string) => {
    if (onOpenVehicleById) {
      onOpenVehicleById(vehicleId);
      return;
    }
    const v = vehicleById.get(vehicleId);
    if (v) onVehicleSelect?.(v);
  };

  const laneTabs = useMemo(() => {
    const withCounts = fleetBoard.lanes.filter((l) => l.lane === 'all' || l.count > 0);
    return withCounts.sort((a, b) => {
      if (a.lane === 'all') return 1;
      if (b.lane === 'all') return -1;
      const order = ['critical', 'overdue', 'due-soon', 'maintenance', 'cleaning', 'ready', 'rented', 'reserved', 'all'];
      return order.indexOf(a.lane) - order.indexOf(b.lane);
    });
  }, [fleetBoard.lanes]);

  return (
    <section
      className={panelShellClass('tertiary', 'border-solid border-border/55 bg-card/55 shadow-none')}
      aria-label={t('dashboard.fleetStatus')}
    >
      <MinimalFleetHeader
        title={de ? 'Flottensteuerung' : 'Fleet State Board'}
        subtitle={
          t('dashboard.vehiclesTotal', { count: filteredFleetVehicles.length }) +
          (selectedStationName ? ` · ${selectedStationName}` : '')
        }
        totalCount={fleetBoard.items.length}
        criticalCount={criticalCount}
        de={de}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((current) => !current)}
        controlsId={contentId}
      />

      <div id={contentId} hidden={!isExpanded} className={isExpanded ? 'animate-fade-up' : undefined}>
          <div className="border-b border-border/35 px-3 py-1.5">
            <div
              className="flex gap-1 overflow-x-auto pb-0.5"
              role="tablist"
              aria-label={de ? 'Flottenfilter' : 'Fleet filter'}
            >
              {laneTabs.map((lane) => {
                const isActive = fleetBoardFilter === lane.lane;
                if (lane.lane !== 'all' && lane.count === 0) return null;
                return (
                  <button
                    key={lane.lane}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setFleetBoardFilter(lane.lane);
                      vm.openDrilldown({ type: 'fleet-lane', lane: lane.lane });
                    }}
                    className={[
                      'flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isActive
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                    ].join(' ')}
                  >
                    {lane.label}
                    {lane.count > 0 && (
                      <span
                        className={[
                          'rounded-md px-1.5 py-0.5 text-[9.5px] tabular-nums',
                          isActive ? 'bg-background/40' : 'bg-muted/70',
                        ].join(' ')}
                      >
                        {lane.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[min(560px,72vh)] flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2.5">
                <SkeletonRows rows={5} />
              </div>
            ) : fleetBoard.filteredItems.length === 0 ? (
              <FleetBoardEmpty locale={locale} stationName={selectedStationName} />
            ) : (
              <div className="divide-y divide-border/30">
                {fleetBoard.filteredItems.map((item) => (
                  <FleetBoardVehicleRow
                    key={item.vehicleId}
                    item={item}
                    locale={locale}
                    onOpen={() => openVehicle(item.vehicleId)}
                  />
                ))}
              </div>
            )}
          </div>

          {!loading && fleetBoard.filteredItems.length > 0 && (
            <div className="border-t border-border/40 px-3.5 py-2 text-[11px] text-muted-foreground">
              {de
                ? 'Kritisch und überfällig zuerst · Offline zuletzt'
                : 'Critical and overdue first · offline last'}
            </div>
          )}
      </div>
    </section>
  );
}
