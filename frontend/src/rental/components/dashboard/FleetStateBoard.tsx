import { dt } from './dashboard-i18n';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { FleetBoardVehicleRow } from './FleetBoardVehicleRow';
import { panelShellClass } from './dashboardShell';
import type {
  DashboardRuntimeModel,
  DashboardSliceId,
  DashboardSliceRow,
  VehicleRuntimeState,
} from './runtime';
import { readyToRentNotReadyRows } from './dashboardSliceAccess';

interface FleetStateBoardProps {
  dashboardRuntime: DashboardRuntimeModel;
  activeTargetId?: DashboardSliceId | null;
  onSelectSlice?: (sliceId: DashboardSliceId) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  locale?: string;
  loading?: boolean;
  stationName?: string | null;
}

function FleetBoardEmpty({ locale, stationName }: { locale: string; stationName?: string | null }) {
  
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="sq-tone-neutral flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40">
        <Icon name="car" className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-[13px] font-semibold text-foreground">
        {dt(locale, 'dashboard.fleet.noVehiclesInScope')}
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
                {criticalCount} {dt(locale, 'dashboard.count.critical')}
              </span>
            ) : null}
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {totalCount} {dt(locale, 'dashboard.count.vehicles')}
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
          {isExpanded ? dt(locale, 'dashboard.fleet.close') : dt(locale, 'dashboard.fleet.open')}
          <Icon
            name="chevron-down"
            className={cn('h-3 w-3 transition-transform duration-200', !isExpanded && '-rotate-90')}
          />
        </button>
      </div>
    </div>
  );
}

interface RuntimeBoardSection {
  id: string;
  sliceId: DashboardSliceId;
  title: string;
  subtitle: string;
  count: number;
  rows: DashboardSliceRow[];
}

function sectionLabel(sliceId: DashboardSliceId, locale: string): string {
  const map: Record<DashboardSliceId, Parameters<typeof dt>[1]> = {
    'ready-to-rent': 'dashboard.label.ready',
    'active-rented': 'dashboard.fleet.sectionActiveRented',
    'due-soon': 'dashboard.slice.dueSoon',
    'overdue-returns': 'dashboard.slice.overdueReturns',
    'overdue-pickups': 'dashboard.slice.overduePickups',
    'blocked-maintenance': 'dashboard.slice.blockedMaintenance',
    'critical-alerts': 'dashboard.slice.criticalAlerts',
  };
  return dt(locale, map[sliceId]);
}

function availableButNotReadyRows(runtime: DashboardRuntimeModel): DashboardSliceRow[] {
  return readyToRentNotReadyRows(runtime.slices['ready-to-rent']);
}

function buildSections(runtime: DashboardRuntimeModel, locale: string): RuntimeBoardSection[] {
  const readySlice = runtime.slices['ready-to-rent'];
  const activeSlice = runtime.slices['active-rented'];
  const dueSoonSlice = runtime.slices['due-soon'];
  const overdueSlice = runtime.slices['overdue-returns'];
  const blockedSlice = runtime.slices['blocked-maintenance'];
  const criticalSlice = runtime.slices['critical-alerts'];
  const notReadyRows = availableButNotReadyRows(runtime);

  return [
    {
      id: 'ready-to-rent',
      sliceId: 'ready-to-rent',
      title: sectionLabel('ready-to-rent', locale),
      subtitle: readySlice.hint ?? (dt(locale, 'dashboard.fleet.sliceReadyHint')),
      count: readySlice.count ?? readySlice.rows.length,
      rows: readySlice.rows,
    },
    {
      id: 'available-but-not-ready',
      sliceId: 'ready-to-rent',
      title: dt(locale, 'dashboard.fleet.sliceNotReady'),
      subtitle: dt(locale, 'dashboard.fleet.sliceNotReadyHint'),
      count: notReadyRows.length,
      rows: notReadyRows,
    },
    {
      id: 'active-rented',
      sliceId: 'active-rented',
      title: sectionLabel('active-rented', locale),
      subtitle: activeSlice.hint ?? (dt(locale, 'dashboard.fleet.sliceActiveHint')),
      count: activeSlice.count ?? activeSlice.rows.length,
      rows: activeSlice.rows,
    },
    {
      id: 'due-soon',
      sliceId: 'due-soon',
      title: sectionLabel('due-soon', locale),
      subtitle: dueSoonSlice.hint ?? (dt(locale, 'dashboard.fleet.sliceDueSoonHint')),
      count: dueSoonSlice.count ?? dueSoonSlice.rows.length,
      rows: dueSoonSlice.rows,
    },
    {
      id: 'overdue-returns',
      sliceId: 'overdue-returns',
      title: sectionLabel('overdue-returns', locale),
      subtitle: overdueSlice.hint ?? (dt(locale, 'dashboard.fleet.sliceOverdueHint')),
      count: overdueSlice.count ?? overdueSlice.rows.length,
      rows: overdueSlice.rows,
    },
    {
      id: 'blocked-maintenance',
      sliceId: 'blocked-maintenance',
      title: sectionLabel('blocked-maintenance', locale),
      subtitle: blockedSlice.hint ?? (dt(locale, 'dashboard.fleet.sliceBlockedHint')),
      count: blockedSlice.count ?? blockedSlice.rows.length,
      rows: blockedSlice.rows,
    },
    {
      id: 'critical-alerts',
      sliceId: 'critical-alerts',
      title: sectionLabel('critical-alerts', locale),
      subtitle: criticalSlice.hint ?? (dt(locale, 'dashboard.fleet.sliceCriticalHint')),
      count: criticalSlice.count ?? criticalSlice.rows.length,
      rows: criticalSlice.rows,
    },
  ];
}

function SectionHeader({
  section,
  active,
  locale,
  onSelect,
}: {
  section: RuntimeBoardSection;
  active: boolean;
  locale: string;
  onSelect?: (sliceId: DashboardSliceId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(section.sliceId)}
      className={cn(
        'sq-press flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]'
          : 'border-border/45 surface-premium/35 hover:border-border/70 hover:bg-muted/20',
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-foreground">
          {section.title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-snug text-muted-foreground">
          {section.subtitle}
        </p>
      </div>
      <span className="rounded-lg bg-background/55 px-2 py-1 text-[11px] font-semibold tabular-nums text-foreground">
        {section.count}
      </span>
      <span className="sr-only">{dt(locale, 'dashboard.fleet.openSlice')}</span>
    </button>
  );
}

function SectionEmpty({ de }: { de: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border/45 bg-muted/10 px-3 py-4 text-center">
      <p className="text-[11.5px] font-medium text-muted-foreground">
        {dt(locale, 'dashboard.fleet.noItemsInSection')}
      </p>
    </div>
  );
}

/**
 * @deprecated Dashboard Fleet Command list removed (V4.9.314). Vehicle lists live
 * in KPI drilldown drawers (ready-to-rent, active-rented, …) and on Fleet page
 * via FleetCommandPanel. FleetStateBoard is reference-only.
 */
export function FleetStateBoard({
  dashboardRuntime,
  activeTargetId,
  onSelectSlice,
  onOpenVehicle,
  locale = 'de',
  loading = false,
  stationName,
}: FleetStateBoardProps) {
  const de = locale === 'de';
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = 'dashboard-fleet-state-content';
  const sections = useMemo(() => buildSections(dashboardRuntime, locale), [dashboardRuntime, locale]);
  const runtimeStateByVehicleId = useMemo(() => {
    const states = new Map<string, VehicleRuntimeState>();
    for (const state of dashboardRuntime.vehicleStates) states.set(state.vehicleId, state);
    return states;
  }, [dashboardRuntime.vehicleStates]);
  const totalCount = dashboardRuntime.vehicleStates.length;
  const criticalCount = dashboardRuntime.slices['critical-alerts'].count ?? dashboardRuntime.slices['critical-alerts'].rows.length;
  const hasVisibleRows = sections.some((section) => section.rows.length > 0);

  return (
    <section
      className={panelShellClass('tertiary')}
      aria-label={dt(locale, 'dashboard.fleet.boardAria')}
    >
      <MinimalFleetHeader
        title={dt(locale, 'dashboard.fleet.boardTitle')}
        subtitle={
          `${totalCount} ${dt(locale, 'dashboard.count.vehicles')}` +
          (stationName ? ` · ${stationName}` : '')
        }
        totalCount={totalCount}
        criticalCount={criticalCount}
        de={de}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((current) => !current)}
        controlsId={contentId}
      />

      <div id={contentId} hidden={!isExpanded} className={isExpanded ? 'animate-fade-up' : undefined}>
          <div className="grid grid-cols-1 gap-2 border-b border-border/35 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => (
              <SectionHeader
                key={section.id}
                section={section}
                active={activeTargetId === section.sliceId}
                locale={locale}
                onSelect={onSelectSlice}
              />
            ))}
          </div>

          <div className="max-h-[min(620px,76vh)] flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="py-2.5">
                <SkeletonRows rows={5} />
              </div>
            ) : totalCount === 0 ? (
              <FleetBoardEmpty locale={locale} stationName={stationName} />
            ) : !hasVisibleRows ? (
              <FleetBoardEmpty locale={locale} stationName={stationName} />
            ) : (
              <div className="space-y-4">
                {sections.map((section) => (
                  <section key={section.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <div className="min-w-0">
                        <h3 className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {section.title}
                        </h3>
                        <p className="truncate text-[10.5px] text-muted-foreground/85">{section.subtitle}</p>
                      </div>
                      <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                        {section.count}
                      </span>
                    </div>
                    {section.rows.length === 0 ? (
                      <SectionEmpty de={de} />
                    ) : (
                      <div className="space-y-2">
                        {section.rows.map((row) => (
                          <FleetBoardVehicleRow
                            key={row.id}
                            row={row}
                            runtimeState={row.vehicleId ? runtimeStateByVehicleId.get(row.vehicleId) : undefined}
                            locale={locale}
                            onOpen={row.vehicleId && onOpenVehicle ? () => onOpenVehicle(row.vehicleId as string) : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>

          {!loading && hasVisibleRows && (
            <div className="border-t border-border/40 px-3.5 py-2 text-[11px] text-muted-foreground">
              {de
                ? 'Quelle: Dashboard Runtime Slices · Fahrzeugdetails aus VehicleRuntimeState'
                : 'Source: Dashboard runtime slices · vehicle details from VehicleRuntimeState'}
            </div>
          )}
      </div>
    </section>
  );
}
