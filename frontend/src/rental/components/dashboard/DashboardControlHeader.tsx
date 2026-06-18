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
    title: de ? 'Control Center' : 'Control Center',
    vehicles: de ? 'Fahrzeuge' : 'vehicles',
    events: de ? 'Ereignisse' : 'events',
    sync: de ? 'Sync' : 'Sync',
    refresh: de ? 'Aktualisieren' : 'Refresh',
    criticalOnly: de ? 'Nur Kritisch' : 'Critical only',
    focusMode: de ? 'Fokus-Modus' : 'Focus mode',
    focusOn: de ? 'Operator-Fokus aktiv' : 'Operator focus on',
    today: de ? 'Heute' : 'Today',
    next24h: de ? 'Nächste 24h' : 'Next 24h',
  };
}

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
    criticalOnly,
    setCriticalOnly,
    operatorFocusMode,
    setOperatorFocusMode,
    timeframe,
    setTimeframe,
    isRefreshing,
    refreshAll,
  } = vm;

  const copy = headerCopy(locale);
  const syncTone = syncStatusTone(controlCenterStatus.syncStatus);

  return (
    <header
      className={cn(
        'rounded-2xl px-4 py-3 ring-1 ring-border/30',
        operatorFocusMode ? 'bg-card/80 shadow-none' : 'sq-card shadow-[var(--shadow-xs)]',
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className={cn(
                'font-display font-bold tracking-[-0.03em] text-foreground',
                operatorFocusMode ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl',
              )}
            >
              {operatorFocusMode ? copy.focusOn : copy.title}
            </h1>
            {!operatorFocusMode && (
              <StatusChip tone="neutral" className="hidden capitalize sm:inline-flex">
                {dateLabel}
              </StatusChip>
            )}
            {operatorFocusMode && (
              <StatusChip tone="watch" className="text-[10px]">
                {copy.focusMode}
              </StatusChip>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="map-pin" className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="font-medium text-foreground/90">{controlCenterStatus.stationLabel}</span>
            </span>
            <span className="hidden h-3 w-px bg-border/70 sm:inline-block" aria-hidden />
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{controlCenterStatus.vehicleCount}</span>{' '}
              {copy.vehicles}
            </span>
            <span className="hidden h-3 w-px bg-border/70 sm:inline-block" aria-hidden />
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
            <span className="hidden h-3 w-px bg-border/70 md:inline-block" aria-hidden />
            <span className="inline-flex items-center gap-1.5">
              <Icon name="refresh-cw" className="h-3 w-3 opacity-70" />
              {copy.sync}{' '}
              <span className="font-medium text-foreground/85">{controlCenterStatus.lastSyncLabel}</span>
            </span>
            <StatusChip tone={syncTone} dot className="text-[10px]">
              {syncStatusLabel(controlCenterStatus.syncStatus, locale)}
            </StatusChip>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={() => setOperatorFocusMode(!operatorFocusMode)}
            aria-pressed={operatorFocusMode}
            className={cn(
              'sq-press inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-semibold transition-all',
              operatorFocusMode
                ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                : 'border-border/60 bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon name={operatorFocusMode ? 'eye' : 'target'} className="h-3.5 w-3.5" />
            {copy.focusMode}
          </button>

          {!operatorFocusMode && (
            <div className="sq-tab-bar flex items-center p-0.5">
            <button
              type="button"
              onClick={() => setTimeframe('today')}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-all',
                timeframe === 'today'
                  ? 'bg-card text-foreground shadow-[var(--shadow-1)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {copy.today}
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('next24h')}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-all',
                timeframe === 'next24h'
                  ? 'bg-card text-foreground shadow-[var(--shadow-1)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {copy.next24h}
            </button>
          </div>
          )}

          {!operatorFocusMode && (
          <button
            type="button"
            onClick={() => setCriticalOnly(!criticalOnly)}
            aria-pressed={criticalOnly}
            className={cn(
              'sq-press rounded-xl border px-3 py-2 text-[10px] font-semibold transition-all',
              criticalOnly
                ? 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/10 text-[color:var(--status-critical)]'
                : 'border-border/60 bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {copy.criticalOnly}
          </button>
          )}

          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={isRefreshing}
            aria-label={copy.refresh}
            className="sq-press inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 text-[10px] font-semibold text-foreground transition-all hover:bg-muted disabled:opacity-60"
          >
            <Icon name="refresh-cw" className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            {copy.refresh}
          </button>

          <div className="relative" ref={stationDropdownRef}>
            <button
              type="button"
              onClick={() => setIsStationDropdownOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isStationDropdownOpen}
              className="sq-press flex max-w-[240px] min-h-9 items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 text-[10px] font-semibold text-foreground transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"            >
              <Icon name="map-pin" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
                className="sq-overlay animate-fade-up absolute right-0 top-full z-50 mt-2 max-h-[60vh] min-w-[240px] overflow-auto rounded-xl p-1"
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
        </div>
      </div>
    </header>
  );
}
