import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useRentalOrg } from '../../RentalContext';
import { countVehiclesAtStation, syncStatusLabel, syncStatusTone } from './dashboardUtils';
import type { DashboardViewModel } from './dashboardTypes';

interface DashboardControlHeaderProps {
  vm: DashboardViewModel;
  children?: ReactNode;
}

function headerCopy(locale: string, orgName: string) {
  const de = locale === 'de';
  const trimmed = orgName.trim();
  return {
    title: trimmed || (de ? 'Dashboard' : 'Dashboard'),
    noStations: de ? 'Keine Standorte verfügbar' : 'No stations available',
  };
}

/**
 * Mobile-first Control Center card. The header owns only global dashboard
 * context: title/live badge, station scope, date and optional embedded content.
 * Operational KPI data remains owned by the view-model consumer passed as
 * children.
 */
export function DashboardControlHeader({ vm, children }: DashboardControlHeaderProps) {
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

  const { orgName } = useRentalOrg();
  const copy = headerCopy(locale, orgName);
  const syncTone = syncStatusTone(controlCenterStatus.syncStatus);

  return (
    <section className="rounded-2xl border border-border/55 bg-card/60 px-4 py-4 shadow-none sm:p-5 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate font-display text-[16px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[17px]">
          {copy.title}
        </h1>
        <StatusChip tone={syncTone} dot className="shrink-0 px-1.5 py-0.5 text-[9.5px]">
          {syncStatusLabel(controlCenterStatus.syncStatus, locale)}
        </StatusChip>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="relative shrink-0" ref={stationDropdownRef}>
          <button
            type="button"
            onClick={() => setIsStationDropdownOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={isStationDropdownOpen}
            className="sq-press -mx-1 flex min-h-8 items-center gap-1 rounded-md px-1 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
          >
            <span
              className={cn(
                selectedStationId === null
                  ? 'whitespace-nowrap'
                  : 'max-w-[min(200px,50vw)] truncate',
              )}
            >
              {selectedStationName ?? t('dashboard.allStations')}
            </span>
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
                  {copy.noStations}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="ml-auto inline-flex items-center gap-1.5 text-[12px] leading-none text-muted-foreground">
          <Icon name="calendar" className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">{dateLabel}</span>
        </p>
      </div>

      {children && (
        <div className="mt-4 sm:mt-5">
          {children}
        </div>
      )}
    </section>
  );
}
