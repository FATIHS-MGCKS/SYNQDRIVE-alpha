import { useMemo } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useRentalOrg } from '../../RentalContext';
import {
  countVehiclesAtStation,
  resolveDashboardSyncBadge,
  syncStatusTone,
  syncStatusTranslationKey,
} from './dashboardUtils';
import { DASHBOARD_LAYOUT } from './dashboardShell';
import type { DashboardViewModel } from './dashboardTypes';

interface DashboardContextHeaderProps {
  vm: DashboardViewModel;
}

/**
 * Page-level dashboard context. Uses `grid-cols-[1fr_auto_1fr]` so the station
 * selector stays geometrically centered regardless of left/right content width.
 */
export function DashboardContextHeader({ vm }: DashboardContextHeaderProps) {
  const {
    t,
    dateLabelShort,
    dataFreshness,
    fleetVehicles,
    stations,
    selectedStationId,
    selectedStationName,
    isStationDropdownOpen,
    stationDropdownRef,
    setIsStationDropdownOpen,
    applyStationFilter,
  } = vm;

  const { orgName, loading: orgLoading, orgId } = useRentalOrg();
  const orgDisplayName = orgName.trim() || t('dashboard.title');

  const syncBadge = useMemo(
    () =>
      resolveDashboardSyncBadge(dataFreshness, {
        orgLoading,
        orgActive: !!orgId,
      }),
    [dataFreshness, orgLoading, orgId],
  );

  const syncTone = syncBadge.phase === 'loading' ? 'neutral' : syncStatusTone(syncBadge.status);
  const syncLabel =
    syncBadge.phase === 'loading'
      ? t('common.loading')
      : t(syncStatusTranslationKey(syncBadge.status));

  const stationLabel = selectedStationName ?? t('dashboard.allStations');

  return (
    <header
      className={cn(
        DASHBOARD_LAYOUT.contextHeader,
        'grid w-full grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto] items-center gap-x-3 gap-y-1 sm:grid-rows-1 sm:gap-x-6 sm:gap-y-0',
      )}
      aria-label={t('dashboard.context.headerAria')}
    >
      <p className="col-start-1 row-start-1 min-w-0 justify-self-start truncate font-display text-[15px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[16px]">
        {orgDisplayName}
      </p>

      <div className="col-start-3 row-start-1 justify-self-end sm:hidden">
        <SyncStatusBadge tone={syncTone} label={syncLabel} loading={syncBadge.phase === 'loading'} />
      </div>

      <div className="col-start-2 row-start-2 justify-self-center sm:row-start-1">
        <StationScopeControl
          t={t}
          fleetVehicles={fleetVehicles}
          stations={stations}
          selectedStationId={selectedStationId}
          stationLabel={stationLabel}
          isStationDropdownOpen={isStationDropdownOpen}
          stationDropdownRef={stationDropdownRef}
          setIsStationDropdownOpen={setIsStationDropdownOpen}
          applyStationFilter={applyStationFilter}
        />
      </div>

      <p className="col-start-3 row-start-2 justify-self-end whitespace-nowrap text-[12px] leading-none text-muted-foreground sm:hidden">
        {dateLabelShort}
      </p>

      <div className="col-start-3 row-start-1 hidden items-center justify-end gap-2 justify-self-end sm:flex">
        <span className="whitespace-nowrap text-[13px] leading-none text-muted-foreground">
          {dateLabelShort}
        </span>
        <SyncStatusBadge tone={syncTone} label={syncLabel} loading={syncBadge.phase === 'loading'} />
      </div>
    </header>
  );
}

function SyncStatusBadge({
  tone,
  label,
  loading,
  className,
}: {
  tone: ReturnType<typeof syncStatusTone>;
  label: string;
  loading: boolean;
  className?: string;
}) {
  return (
    <StatusChip
      tone={tone}
      dot={!loading}
      className={cn('shrink-0 px-1.5 py-0.5 text-[9.5px] sm:text-[10px]', className)}
      title={label}
    >
      {label}
    </StatusChip>
  );
}

function StationScopeControl({
  t,
  fleetVehicles,
  stations,
  selectedStationId,
  stationLabel,
  isStationDropdownOpen,
  stationDropdownRef,
  setIsStationDropdownOpen,
  applyStationFilter,
}: {
  t: DashboardViewModel['t'];
  fleetVehicles: DashboardViewModel['fleetVehicles'];
  stations: DashboardViewModel['stations'];
  selectedStationId: string | null;
  stationLabel: string;
  isStationDropdownOpen: boolean;
  stationDropdownRef: DashboardViewModel['stationDropdownRef'];
  setIsStationDropdownOpen: DashboardViewModel['setIsStationDropdownOpen'];
  applyStationFilter: DashboardViewModel['applyStationFilter'];
}) {
  return (
    <div className="relative min-w-0 max-w-[min(100vw-2rem,320px)]" ref={stationDropdownRef}>
      <button
        type="button"
        onClick={() => setIsStationDropdownOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isStationDropdownOpen}
        aria-label={t('dashboard.context.stationSelectorLabel', { station: stationLabel })}
        className="sq-press flex min-h-8 max-w-full items-center gap-1 rounded-md px-1.5 text-left text-[13px] font-semibold leading-snug text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      >
        <span className="truncate">{stationLabel}</span>
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
          className="sq-overlay animate-fade-up absolute left-1/2 top-full z-50 mt-2 max-h-[60vh] min-w-[240px] max-w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 overflow-auto rounded-xl p-1"
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
              {t('dashboard.context.noStations')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
