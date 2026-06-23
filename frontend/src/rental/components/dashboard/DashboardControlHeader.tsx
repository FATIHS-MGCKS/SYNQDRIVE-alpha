import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { countVehiclesAtStation, syncStatusLabel, syncStatusTone } from './dashboardUtils';
import type { DashboardViewModel } from './dashboardTypes';

interface DashboardControlHeaderProps {
  vm: DashboardViewModel;
}

function headerCopy(locale: string) {
  const de = locale === 'de';
  return {
    title: 'Control Center',
    vehicles: de ? 'Fahrzeuge' : 'vehicles',
    events: de ? 'Ereignisse' : 'events',
    sync: de ? 'Sync' : 'Sync',
  };
}

/**
 * Compact, mobile-first control-center header. It only carries context and
 * system status now: title + live badge, a single station scope selector, a
 * quiet status line (vehicles · events · sync) and a discreet date. The former
 * control row (focus mode, today/next-24h, critical-only, refresh) was removed
 * — those belong to local contexts (e.g. the Attention "Critical" tab), not the
 * global header. The underlying view-model state stays intact so dependent
 * surfaces keep working.
 */
export function DashboardControlHeader({ vm }: DashboardControlHeaderProps) {
  const {
    locale,
    t,
    dateLabel,
    controlCenterStatus,
    fleetVehicles,
    stations,
    selectedStationId,
    selectedStationName,
    isStationDropdownOpen,
    stationDropdownRef,
    setIsStationDropdownOpen,
    applyStationFilter,
  } = vm;

  const copy = headerCopy(locale);
  const syncTone = syncStatusTone(controlCenterStatus.syncStatus);

  return (
    <header className="rounded-2xl border border-border/55 bg-card/55 px-3.5 py-2.5 shadow-none">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate font-display text-[16px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[17px]">
          {copy.title}
        </h1>
        <StatusChip tone={syncTone} dot className="shrink-0 px-1.5 py-0.5 text-[9.5px]">
          {syncStatusLabel(controlCenterStatus.syncStatus, locale)}
        </StatusChip>
      </div>

      <div className="relative mt-1.5" ref={stationDropdownRef}>
        <button
          type="button"
          onClick={() => setIsStationDropdownOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isStationDropdownOpen}
          className="sq-press -mx-1 flex min-h-7 max-w-full items-center gap-1 rounded-md px-1 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          <span className="truncate">{selectedStationName ?? t('dashboard.allStations')}</span>
          <Icon
            name="chevron-down"
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              isStationDropdownOpen && 'rotate-180',
            )}
          />
        </button>
        {isStationDropdownOpen && (
          <div
            role="listbox"
            className="sq-overlay animate-fade-up absolute left-0 top-full z-50 mt-2 max-h-[60vh] min-w-[240px] max-w-[min(320px,calc(100vw-2rem))] overflow-auto rounded-xl p-1"
          >
            <button
              type="button"
              role="option"
              aria-selected={selectedStationId === null}
              onClick={() => applyStationFilter(null)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                selectedStationId === null
                  ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              <span className="truncate">{t('dashboard.allStations')}</span>
              <span className="shrink-0 text-[11px] tabular-nums opacity-70">{fleetVehicles.length}</span>
            </button>
            {stations.length > 0 && <div className="mx-2 my-1 h-px bg-border/60" aria-hidden />}
            {stations.map((s) => {
              const isActive = selectedStationId === s.id;
              const count = countVehiclesAtStation(fleetVehicles, s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => applyStationFilter(s.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                    isActive
                      ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isActive ? (
                      <Icon name="check" className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
            {stations.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">
                {locale === 'de' ? 'Keine Standorte verfügbar' : 'No stations available'}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{controlCenterStatus.vehicleCount}</span>{' '}
          {copy.vehicles}
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          <span
            className={cn(
              'font-semibold',
              controlCenterStatus.importantEventCount > 0
                ? 'text-[color:var(--status-watch)]'
                : 'text-foreground',
            )}
          >
            {controlCenterStatus.importantEventCount}
          </span>{' '}
          {copy.events}
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <Icon name="refresh-cw" className="h-3 w-3 opacity-60" />
          {copy.sync}{' '}
          <span className="font-medium text-foreground/85">{controlCenterStatus.lastSyncLabel}</span>
        </span>
      </p>

      <p className="mt-1 text-[11px] text-muted-foreground">{dateLabel}</p>
    </header>
  );
}
