import { useMemo } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { FleetBoardVehicleRow } from './FleetBoardVehicleRow';
import {
  DashboardPanelHeader,
  INTERACTIVE_TAB_CLASS,
  panelShellClass,
} from './dashboardShell';
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
      <p className="text-[12px] font-semibold text-foreground">
        {de ? 'Keine Fahrzeuge im Scope' : 'No vehicles in scope'}
      </p>
      <p className="max-w-[260px] text-[11px] text-muted-foreground">
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
      className={panelShellClass('secondary')}
      aria-label={t('dashboard.fleetStatus')}
    >
      <DashboardPanelHeader
        icon={<Icon name="car" className="h-4 w-4" />}
        iconToneClass="sq-tone-brand"
        title={de ? 'Flottensteuerung' : 'Fleet State Board'}
        subtitle={
          t('dashboard.vehiclesTotal', { count: filteredFleetVehicles.length }) +
          (selectedStationName ? ` · ${selectedStationName}` : '')
        }
        trailing={
          fleetBoard.items.length > 0 ? (
            <StatusChip tone="info">{fleetBoard.items.length}</StatusChip>
          ) : undefined
        }
      />

      <div className="border-b border-border/40 px-3 py-2">
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
                  INTERACTIVE_TAB_CLASS,
                  'flex items-center gap-1',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                ].join(' ')}
              >
                {lane.label}
                {lane.count > 0 && (
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-[9px] tabular-nums',
                      isActive ? 'bg-background/20' : 'bg-muted',
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

      <div className="max-h-[min(480px,65vh)] flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <SkeletonRows rows={5} />
        ) : fleetBoard.filteredItems.length === 0 ? (
          <FleetBoardEmpty locale={locale} stationName={selectedStationName} />
        ) : (
          <div className="space-y-2">
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
        <div className="border-t border-border/40 px-4 py-2 text-[10px] text-muted-foreground">
          {de
            ? 'Kritisch und überfällig zuerst · Offline/Stale separat markiert'
            : 'Critical and overdue first · offline/stale flagged separately'}
        </div>
      )}
    </section>
  );
}
